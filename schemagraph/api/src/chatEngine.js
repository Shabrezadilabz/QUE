/**
 * Schema-only chat engine with RAG, model switching, and skill runtime.
 * Never sends raw warehouse rows — metadata + product docs only.
 * Pinned scrubbed samples (5–10) may be included when aiMayUsePinnedSamples.
 * Managed dataset row payloads are never included.
 */
import {
  buildSchemaContextPack,
  findTablesMentioned,
} from './schemaContext.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { buildPinnedSamplesAiPack } from './pinnedSamples.js'
import { managedDatasetsSchemaForAi } from './managedDataPlane.js'
import {
  buildRulesAiPack,
  formatRulesForPrompt,
} from './workspaceRules.js'
import {
  formatRagContext,
  retrieveForQuery,
  retrievedChunkSummary,
} from './ai/rag.js'
import { callChatModel, resolveModel } from './ai/models.js'
import { detectSkill, resolveMentioned, runSkill } from './ai/skillsRuntime.js'
import { appendTurn } from './ai/feedback.js'
import { vectorExtensionReady } from './ai/vectorStore.js'
import { getOpenHighDrift } from './contracts/contractFreeze.js'
import { attachSamplePreviews } from './samplePreview.js'
import { enrichChatWithPlaneScope } from './chatScope.js'
import { resolveProviderKeys } from './secrets.js'
import { buildNotebookFromFields } from './jobNotebook.js'
import { bestJoinOnClause } from './inferJoins.js'
import { getWorkspaceLineageLite } from './lineageLite.js'

/**
 * Phase 3 — lineage-grounded citation strings (edges + owners / job titles).
 */
async function lineageCitations(workspaceId, message) {
  try {
    const lite = await getWorkspaceLineageLite(workspaceId, { limit: 24 })
    const q = String(message || '').toLowerCase()
    const out = []
    for (const j of lite.joins || []) {
      const label = j.label || ''
      const hay = `${label} ${j.from?.table || ''} ${j.to?.table || ''}`.toLowerCase()
      if (!q || hay.split(/\W+/).some((t) => t.length > 2 && q.includes(t))) {
        out.push(
          `lineage:join ${label}` +
            (j.from?.connection || j.to?.connection
              ? ` · owners ${[j.from?.connection, j.to?.connection].filter(Boolean).join(' → ')}`
              : ''),
        )
      }
      if (out.length >= 6) break
    }
    for (const path of lite.paths || []) {
      const title = path.job?.title || ''
      if (
        title &&
        (!q ||
          title
            .toLowerCase()
            .split(/\W+/)
            .some((t) => t.length > 2 && q.includes(t)))
      ) {
        const stages = (path.stages || [])
          .filter((s) => s.ready)
          .map((s) => s.label)
          .join(' → ')
        out.push(
          `lineage:job ${title}` +
            (stages ? ` · ${stages}` : '') +
            (path.complete ? ' · complete' : ''),
        )
      }
      if (out.length >= 10) break
    }
    if (!out.length && (lite.joins || []).length) {
      for (const j of (lite.joins || []).slice(0, 3)) {
        out.push(`lineage:join ${j.label}`)
      }
    }
    return out
  } catch {
    return []
  }
}

function mergeCitations(...lists) {
  return [...new Set(lists.flat().filter(Boolean))]
}

function finalizeChatResult(result, pack, userMessage = '') {
  const withSamples = attachSamplePreviews(result, pack, 4, 10)
  return enrichChatWithPlaneScope(userMessage, withSamples, pack)
}

/**
 * @param {string} workspaceId
 * @param {string} message
 * @param {{ role: string, content: string }[]} [history]
 * @param {{ tables?: string[], columns?: { table: string, column: string }[] } | null} [mentions]
 * @param {{ modelId?: string, sessionId?: string } | null} [opts]
 */
export async function answerChat(
  workspaceId,
  message,
  history = [],
  mentions = null,
  opts = null,
) {
  const pack = await buildSchemaContextPack(workspaceId)
  const trimmed = String(message || '').trim()
  if (!trimmed) {
    return {
      reply:
        'Ask a schema question — e.g. “list tables”, “describe orders”, or “how do I join leads to users_main?”',
      citations: [],
      jobDraft: null,
      mode: 'empty',
      contextStats: pack.stats,
      referencedTables: [],
      retrievedChunks: [],
      model: null,
    }
  }

  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  const topK = Number(settings.ragTopK) > 0 ? Number(settings.ragTopK) : 8
  const includeDocs = settings.ragIncludeDocs !== false
  const preferLlm = settings.preferLlmChat === true
  const keys = await resolveProviderKeys(workspaceId)
  const model = resolveModel(settings, opts?.modelId, keys)

  let ragChunks = []
  const vectorReady = await vectorExtensionReady()
  if (vectorReady) {
    try {
      ragChunks = await retrieveForQuery(workspaceId, trimmed, {
        topK,
        includeDocs,
        openaiKey: keys.openai,
      })
    } catch (err) {
      console.warn('[Que chat] RAG retrieve failed:', err.message || err)
    }
  }

  const { block: ragBlock, citations: ragCitations } =
    formatRagContext(ragChunks)
  const mentioned = resolveMentioned(pack, trimmed, mentions)
  const linCites = await lineageCitations(workspaceId, trimmed)

  // Drift gate note for AI (does not hard-block chat — jobs/export do)
  let driftPrefix = ''
  let hasOpenHighDrift = false
  try {
    const openHigh = await getOpenHighDrift(workspaceId)
    if (openHigh.length) {
      hasOpenHighDrift = true
      driftPrefix =
        `⚠️ **Open schema drift** (${openHigh.length}): ${openHigh
          .slice(0, 3)
          .map((d) => d.summary)
          .join(' · ')}. ` +
        `Acknowledge in Jobs before exporting a stitch contract.\n\n`
    }
  } catch {
    /* drift table may be missing */
  }
  let lineagePrefix = ''
  if (linCites.length) {
    lineagePrefix =
      `_Lineage anchors:_ ${linCites.slice(0, 4).join(' · ')}\n\n`
  }
  const replyPrefix = `${driftPrefix}${lineagePrefix}`

  // 1) Skill path (deterministic + RAG note)
  const skill = detectSkill(trimmed)
  if (skill) {
    const result = runSkill(
      pack,
      skill.id,
      mentioned,
      trimmed,
      {
        listTables,
        describeTable,
        explainJoins,
        listSuggested,
        draftSql,
        draftJob,
        schemaSummary,
        privacyPolicy,
        helpSkills,
      },
      ragChunks,
    )
    const out = {
      ...result,
      reply: `${replyPrefix}${result.reply}`,
      citations: mergeCitations(result.citations, ragCitations, linCites),
      lineageCitations: linCites,
      retrievedChunks: retrievedChunkSummary(ragChunks),
      model: model?.id || null,
      contextStats: pack.stats,
      vectorReady,
      driftBlocking: hasOpenHighDrift,
    }
    await persistTurns(workspaceId, opts?.sessionId, trimmed, out)
    return finalizeChatResult(out, pack, trimmed)
  }

  // Pinned scrubbed samples for AI (default ON) — never managed rows
  let pinnedAiBlock = ''
  let managedSchemaBlock = ''
  let rulesBlock = ''
  try {
    const rules = await buildRulesAiPack(workspaceId)
    rulesBlock = formatRulesForPrompt(rules)
  } catch {
    /* rules optional until migrate */
  }
  if (settings.aiMayUsePinnedSamples !== false) {
    try {
      const pins = await buildPinnedSamplesAiPack(workspaceId, { maxTables: 16 })
      if (pins.length) {
        pinnedAiBlock =
          `\n## Pinned scrubbed samples (fixed 5–10 rows; not live warehouse)\n` +
          pins
            .map((p) => {
              const header = p.columns.join(' | ')
              const body = (p.rows || [])
                .slice(0, 10)
                .map((row) =>
                  p.columns.map((c) => String(row?.[c] ?? '')).join(' | '),
                )
                .join('\n')
              return `### ${p.table}\n${header}\n${body}`
            })
            .join('\n\n')
      }
    } catch {
      /* pins optional */
    }
  }
  try {
    const managedMeta = await managedDatasetsSchemaForAi(workspaceId)
    if (managedMeta.length) {
      managedSchemaBlock =
        `\n## Managed datasets (schema only — row data denied to AI)\n` +
        managedMeta
          .map(
            (d) =>
              `• ${d.name} (${d.slug}) · ${d.rowCount} rows · cols: ${(d.columns || []).map((c) => c.name).join(', ')}` +
              (d.certified ? ' · certified' : ''),
          )
          .join('\n')
    }
  } catch {
    /* managed plane optional */
  }

  // 2) RAG + LLM when preferred and model available
  if (preferLlm && model) {
    try {
      const llm = await tryRagLlmAnswer({
        pack,
        message: trimmed,
        history,
        ragBlock,
        ragChunks,
        model,
        mentioned,
        keys,
        pinnedAiBlock,
        managedSchemaBlock,
        rulesBlock,
      })
      if (llm) {
        const out = {
          ...llm,
          reply: `${replyPrefix}${llm.reply}`,
          citations: mergeCitations(llm.citations, linCites),
          lineageCitations: linCites,
          contextStats: pack.stats,
          vectorReady,
          driftBlocking: hasOpenHighDrift,
        }
        await persistTurns(workspaceId, opts?.sessionId, trimmed, out)
        return finalizeChatResult(out, pack, trimmed)
      }
    } catch (err) {
      console.warn('[Que chat] RAG-LLM failed:', err.message || err)
    }
  }

  // 3) Heuristic fallback (always stable)
  const heuristic = heuristicAnswer(pack, trimmed, mentions)
  const out = {
    ...heuristic,
    reply: `${replyPrefix}${heuristic.reply}`,
    citations: mergeCitations(heuristic.citations, ragCitations, linCites),
    lineageCitations: linCites,
    retrievedChunks: retrievedChunkSummary(ragChunks),
    model: null,
    contextStats: pack.stats,
    mode: heuristic.mode || 'heuristic',
    vectorReady,
    driftBlocking: hasOpenHighDrift,
  }
  await persistTurns(workspaceId, opts?.sessionId, trimmed, out)
  return finalizeChatResult(out, pack, trimmed)
}

async function persistTurns(workspaceId, sessionId, userMsg, assistant) {
  try {
    const sid = sessionId || 'default'
    await appendTurn(workspaceId, {
      sessionId: sid,
      role: 'user',
      content: userMsg,
    })
    await appendTurn(workspaceId, {
      sessionId: sid,
      role: 'assistant',
      content: assistant.reply,
      modelId: assistant.model,
      mode: assistant.mode,
      metadata: {
        citations: assistant.citations || [],
        retrieved: assistant.retrievedChunks || [],
      },
    })
  } catch (err) {
    console.warn('[Que chat] turn persist skipped:', err.message || err)
  }
}

async function tryRagLlmAnswer({
  pack,
  message,
  history,
  ragBlock,
  ragChunks,
  model,
  mentioned,
  keys,
  pinnedAiBlock = '',
  managedSchemaBlock = '',
  rulesBlock = '',
}) {
  const system =
    `You are Que AI — a schema-only data engineering assistant.\n` +
    `Answer ONLY from the retrieved context and schema stats below. Never invent tables.\n` +
    `You may use pinned scrubbed sample grids when provided (5–10 rows, not the lake).\n` +
    `Never request or assume access to managed dataset row payloads or full warehouse facts.\n` +
    `Cite table.column / doc titles. When proposing SQL, mark it as a draft.\n` +
    `Always obey workspace rules below (org memory from Promote + admins).\n\n` +
    `## Workspace stats\n` +
    `Tables: ${pack.stats.tableCount} · Columns: ${pack.stats.columnCount} · ` +
    `Relationships: ${pack.stats.relationshipCount} · Suggested: ${pack.stats.suggestedJoins}\n\n` +
    ragBlock +
    rulesBlock +
    pinnedAiBlock +
    managedSchemaBlock

  const text = await callChatModel(model, system, message, history, keys)
  const cited = findTablesMentioned(pack, `${message}\n${text}`)
  const refs = cited.length ? cited : mentioned
  return {
    reply: text,
    citations: [
      ...refs.flatMap((t) => [
        t.name,
        ...t.columns.slice(0, 3).map((c) => `${t.name}.${c.name}`),
      ]),
      ...ragChunks.map((c) => c.title),
    ].filter(Boolean),
    jobDraft: null,
    referencedTables: refs.map(compactTable),
    sql: extractSql(text),
    mode: 'rag-llm',
    model: model.id,
    retrievedChunks: retrievedChunkSummary(ragChunks),
  }
}

function heuristicAnswer(pack, message, mentions = null) {
  const q = message.toLowerCase()
  const explicit = Array.isArray(mentions?.tables) ? mentions.tables : []
  const mentioned = findTablesMentioned(pack, message, explicit)

  if (
    /\b(help|skills?|commands?)\b/.test(q) ||
    /list available chat skills/.test(q) ||
    /how to use @table/.test(q)
  ) {
    return helpSkills(pack)
  }

  if (/\b(privacy|schema-only|never.*(row|data)|policy)\b/.test(q)) {
    return privacyPolicy(pack)
  }

  if (
    /\bsummar(y|ize)\b/.test(q) ||
    /\bschema summary\b/.test(q) ||
    /\bcounts?\b.*\b(source|table)/.test(q)
  ) {
    return schemaSummary(pack)
  }

  if (
    /\b(list|show|what)\b.*\b(tables|collections|schema|sources)\b/.test(q) ||
    q === 'schema'
  ) {
    return listTables(pack)
  }

  if (/\b(describe|explain|columns?|fields?)\b/.test(q) && mentioned.length) {
    return describeTable(pack, mentioned[0])
  }

  if (
    mentioned.length === 1 &&
    /^(describe|show|explain)\s+\w+/i.test(message)
  ) {
    return describeTable(pack, mentioned[0])
  }

  if (
    /\b(job|pipeline|etl|sync job)\b/.test(q) ||
    /\bdraft\b.*\b(job|pipeline)\b/.test(q)
  ) {
    return draftJob(pack, mentioned, message)
  }

  if (/\b(join|relate|relationship|link)\b/.test(q)) {
    return explainJoins(pack, mentioned)
  }

  if (/\b(sql|query|select)\b/.test(q)) {
    return draftSql(pack, mentioned, message)
  }

  if (/\bsuggest(ed)?\b.*\bjoin/.test(q) || /\bai[- ]?infer/.test(q)) {
    return listSuggested(pack)
  }

  if (mentioned.length === 1) {
    return describeTable(pack, mentioned[0])
  }

  if (mentioned.length >= 2) {
    return explainJoins(pack, mentioned)
  }

  return helpSkills(pack)
}

function helpSkills(pack) {
  return {
    reply:
      `**Que AI skills** (schema metadata only — ${pack.stats.tableCount} tables).\n\n` +
      `**Mentions**\n` +
      `• Type \`@\` to pick a table or \`@table.column\`\n` +
      `• Click a table/column in the sidebar to paste into the composer\n\n` +
      `**Slash skills**\n` +
      `• \`/list\` — inventory tables\n` +
      `• \`/describe\` — columns for a focused table\n` +
      `• \`/joins\` — relationships for focused tables\n` +
      `• \`/suggested\` — AI-inferred joins\n` +
      `• \`/sql\` — schema-only SELECT/JOIN draft\n` +
      `• \`/job\` — draft a stitch job\n` +
      `• \`/diff\` — workspace schema summary\n` +
      `• \`/privacy\` — what Que never sends to AI\n` +
      `• \`/help\` — this message\n\n` +
      `**RAG** · vector search over schema + Que docs · pick a model in the chat header\n\n` +
      `**Natural language**\n` +
      `• “list tables” · “describe @customers” · “SQL join @leads and @users_main”`,
    citations: [],
    jobDraft: null,
    referencedTables: [],
    sql: null,
    mode: 'help',
  }
}

function privacyPolicy(pack) {
  return {
    reply:
      `**Que schema-only policy**\n\n` +
      `Que AI answers from **metadata packs** + **retrieved vector chunks** + optional **pinned scrubbed samples** (5–10 rows per table, frozen until re-pin).\n\n` +
      `**Never sent to AI:** full warehouse/lake rows, managed data-plane row payloads (Offer B), unrestricted PII dumps, or production query dumps.\n\n` +
      `Join confidence uses pinned overlap in the **~88–95%** band (not 100%) — humans edit + Promote.\n\n` +
      `This workspace pack currently has **${pack.stats.tableCount}** tables, **${pack.stats.columnCount}** columns, **${pack.stats.relationshipCount}** relationships.`,
    citations: [],
    jobDraft: null,
    referencedTables: [],
    sql: null,
    mode: 'privacy',
  }
}

function schemaSummary(pack) {
  const bySource = new Map()
  for (const t of pack.tables) {
    const key = `${t.connection} (${t.sourceType})`
    bySource.set(key, (bySource.get(key) || 0) + 1)
  }
  const lines = [...bySource.entries()].map(
    ([k, n]) => `• **${k}** — ${n} table${n === 1 ? '' : 's'}`,
  )
  return {
    reply:
      `**Workspace schema summary**\n\n` +
      `• Tables: **${pack.stats.tableCount}**\n` +
      `• Columns: **${pack.stats.columnCount}**\n` +
      `• Relationships: **${pack.stats.relationshipCount}**\n` +
      `• Suggested joins: **${pack.stats.suggestedJoins}**\n\n` +
      `**By source**\n` +
      lines.join('\n'),
    citations: pack.tables.map((t) => t.name),
    jobDraft: null,
    referencedTables: pack.tables.map(compactTable),
    sql: null,
    mode: 'summary',
  }
}

function listTables(pack) {
  const bySource = new Map()
  for (const t of pack.tables) {
    const key = `${t.connection} (${t.sourceType})`
    const list = bySource.get(key) ?? []
    list.push(t)
    bySource.set(key, list)
  }
  const parts = [
    `**${pack.stats.tableCount} tables/collections** in this workspace:\n`,
  ]
  for (const [src, tables] of bySource) {
    parts.push(`**${src}**`)
    for (const t of tables) {
      parts.push(
        `• \`${t.name}\` — ${t.entityKind}, ${t.columns.length} columns`,
      )
    }
    parts.push('')
  }
  return {
    reply: parts.join('\n').trim(),
    citations: pack.tables.map((t) => t.name),
    jobDraft: null,
    referencedTables: pack.tables.map(compactTable),
    sql: null,
    mode: 'list',
  }
}

function describeTable(pack, table) {
  const cols = table.columns
    .map((c) => {
      const key =
        c.keyKind && c.keyKind !== 'none'
          ? ` · **${c.keyKind.toUpperCase()}**`
          : ''
      const refs = c.references ? ` · ref ${c.references}` : ''
      const samples = c.samples?.length
        ? ` · e.g. ${c.samples.map((s) => `\`${s}\``).join(', ')}`
        : ''
      return `• \`${c.name}\`: ${c.dataType}${key}${refs}${samples}`
    })
    .join('\n')

  const rels = pack.relationships.filter(
    (r) =>
      r.from.startsWith(`${table.name}.`) || r.to.startsWith(`${table.name}.`),
  )
  const relBlock =
    rels.length === 0
      ? '_No recorded relationships yet._'
      : rels
          .map(
            (r) =>
              `• [${r.type}/${r.status}] \`${r.from}\` → \`${r.to}\` (conf ${r.confidence})`,
          )
          .join('\n')

  return {
    reply:
      `**\`${table.name}\`** (${table.entityKind} · ${table.sourceType} · ${table.connection})\n\n` +
      `### Columns\n${cols}\n\n### Relationships\n${relBlock}`,
    citations: [
      table.name,
      ...table.columns.slice(0, 8).map((c) => `${table.name}.${c.name}`),
    ],
    jobDraft: null,
    referencedTables: [compactTable(table)],
    sql: null,
    mode: 'describe',
  }
}

function explainJoins(pack, mentioned) {
  let rels = pack.relationships
  if (mentioned.length >= 1) {
    const names = new Set(mentioned.map((t) => t.name))
    rels = rels.filter((r) => {
      const [ft] = r.from.split('.')
      const [tt] = r.to.split('.')
      return names.has(ft) || names.has(tt)
    })
  }

  if (rels.length === 0 && mentioned.length >= 2) {
    const [a, b] = mentioned
    const sql = proposeHeuristicSql(a, b)
    return {
      reply:
        `No stored relationship between \`${a.name}\` and \`${b.name}\` yet.\n\n` +
        `Que will **not invent** a join path — Promote on the canvas / stitch session first.\n\n` +
        `Blocked draft (promote, then re-run /sql):\n`,
      citations: [a.name, b.name],
      jobDraft: null,
      referencedTables: mentioned.map(compactTable),
      sql,
      mode: 'join-propose',
    }
  }

  if (rels.length === 0) {
    return {
      reply:
        'No relationships match that question. Sync sources or ask “show suggested joins”.',
      citations: [],
      jobDraft: null,
      referencedTables: mentioned.map(compactTable),
      sql: null,
      mode: 'join-empty',
    }
  }

  const lines = rels.map((r) => {
    const note = r.aiNotes ? `\n  _${r.aiNotes}_` : ''
    return `• **${r.type}** (${r.status}, conf ${r.confidence}): \`${r.from}\` → \`${r.to}\`${note}`
  })

  let sql = null
  if (mentioned.length >= 2) {
    sql = proposeHeuristicSql(mentioned[0], mentioned[1], rels)
  } else if (rels[0]) {
    const [ft] = rels[0].from.split('.')
    const [tt] = rels[0].to.split('.')
    const a = pack.tables.find((t) => t.name === ft)
    const b = pack.tables.find((t) => t.name === tt)
    if (a && b) sql = proposeHeuristicSql(a, b, [rels[0]])
  }

  return {
    reply: `Found **${rels.length}** relationship(s):\n\n${lines.join('\n')}`,
    citations: rels.flatMap((r) => [r.from, r.to]),
    jobDraft: null,
    referencedTables: mentioned.length
      ? mentioned.map(compactTable)
      : findTablesMentioned(
          pack,
          rels.map((r) => `${r.from} ${r.to}`).join(' '),
        ).map(compactTable),
    sql,
    mode: 'join',
  }
}

function listSuggested(pack) {
  const sug = pack.relationships.filter(
    (r) => r.type === 'ai-inferred' && r.status === 'suggested',
  )
  if (!sug.length) {
    return {
      reply:
        'No suggested joins right now. Sync Excel/Mongo/Postgres to refresh inference.',
      citations: [],
      jobDraft: null,
      referencedTables: [],
      sql: null,
      mode: 'suggested-empty',
    }
  }
  return {
    reply:
      `**${sug.length} suggested joins** (review on the canvas → Promote / Reject):\n\n` +
      sug
        .map(
          (r) =>
            `• \`${r.from}\` → \`${r.to}\` (conf ${r.confidence})${r.aiNotes ? ` — ${r.aiNotes}` : ''}`,
        )
        .join('\n'),
    citations: sug.flatMap((r) => [r.from, r.to]),
    jobDraft: null,
    referencedTables: [],
    sql: null,
    mode: 'suggested',
  }
}

function draftSql(pack, mentioned, message) {
  if (mentioned.length >= 2) {
    const rels = pack.relationships.filter((r) => {
      const names = new Set(mentioned.map((t) => t.name))
      const [ft] = r.from.split('.')
      const [tt] = r.to.split('.')
      return names.has(ft) && names.has(tt)
    })
    const sql = proposeHeuristicSql(mentioned[0], mentioned[1], rels)
    return {
      reply: `Draft SQL joining \`${mentioned[0].name}\` and \`${mentioned[1].name}\` from schema metadata only. Validate filters against real data policies before running.`,
      citations: mentioned.map((t) => t.name),
      jobDraft: null,
      referencedTables: mentioned.map(compactTable),
      sql,
      mode: 'sql',
    }
  }
  if (mentioned.length === 1) {
    const t = mentioned[0]
    const cols = t.columns.slice(0, 6).map((c) => c.name)
    const sql = `SELECT ${cols.join(', ')}\nFROM ${t.name}\nLIMIT 100;`
    return {
      reply: `Simple projection for \`${t.name}\` (schema-only draft):`,
      citations: [t.name],
      jobDraft: null,
      referencedTables: [compactTable(t)],
      sql,
      mode: 'sql',
    }
  }
  return {
    reply: `Name the tables to query (e.g. “SQL join leads to users_main”). Workspace has: ${pack.tables
      .slice(0, 8)
      .map((t) => `\`${t.name}\``)
      .join(', ')}.`,
    citations: [],
    jobDraft: null,
    referencedTables: [],
    sql: null,
    mode: 'sql-help',
  }
}

function draftJob(pack, mentioned, message) {
  const sources = [...new Set(pack.tables.map((t) => t.connection))]
  const focus =
    mentioned.length > 0
      ? mentioned
      : pack.tables
          .filter((t) => /excel|mongo|csv/i.test(t.sourceType))
          .slice(0, 2)

  const steps = [
    {
      id: 1,
      action: 'introspect',
      detail: 'Confirm latest schema snapshot for involved connections',
    },
    {
      id: 2,
      action: 'map_fields',
      detail:
        focus.length >= 2
          ? `Map fields between ${focus.map((t) => t.name).join(' and ')}`
          : 'Map source fields to target columns by name/type',
    },
    {
      id: 3,
      action: 'review_joins',
      detail: 'Promote or reject suggested Que Relations on the canvas',
    },
    {
      id: 4,
      action: 'emit_sql',
      detail: 'Export reviewed join SQL / pipeline steps (runner TBD)',
    },
  ]

  const jobDraft = {
    title:
      focus.length >= 2
        ? `Que ${focus[0].name} → ${focus[1].name}`
        : 'Schema stitch job draft',
    status: 'draft',
    sources,
    tables: focus.map((t) => t.name),
    steps,
    notes:
      'Draft only — generated from schema metadata. No raw rows were read by the assistant.',
    sqlText: focus.length >= 2 ? proposeHeuristicSql(focus[0], focus[1]) : null,
  }
  jobDraft.notebook = buildNotebookFromFields(jobDraft)

  return {
    reply:
      `Created a **job draft** (notebook) from schema context (not executed).\n\n` +
      `**${jobDraft.title}** · ${jobDraft.notebook.length} cell(s)\n` +
      jobDraft.steps.map((s) => `${s.id}. ${s.action} — ${s.detail}`).join('\n') +
      `\n\nSave it from chat, then open **Jobs** to review the notebook / export.`,
    citations: focus.map((t) => t.name),
    jobDraft,
    referencedTables: focus.map(compactTable),
    sql: jobDraft.sqlText,
    mode: 'job',
  }
}

function proposeHeuristicSql(a, b, rels = [], opts = {}) {
  const requireAccepted = opts.requireAcceptedJoins !== false
  let on = null
  let joinSource = 'none'

  const accepted = (rels || []).filter(
    (r) =>
      r.status === 'accepted' ||
      r.status == null ||
      // schema pack relationships for accepted omit rejected; treat stored as usable
      r.type === 'explicit',
  )
  const suggestedOnly = (rels || []).filter(
    (r) => r.status === 'suggested' || r.type === 'ai-inferred',
  )

  const usable =
    accepted.length > 0
      ? accepted
      : requireAccepted
        ? []
        : rels || []

  if (usable[0]) {
    const [, fc] = usable[0].from.split('.')
    const [, tc] = usable[0].to.split('.')
    const fromIsA = usable[0].from.startsWith(`${a.name}.`)
    on = fromIsA ? `a.${fc} = b.${tc}` : `a.${tc} = b.${fc}`
    joinSource = accepted.length > 0 ? 'accepted' : 'stored'
  } else if (!requireAccepted) {
    const scored = bestJoinOnClause(a, b)
    on = scored?.on || null
    joinSource = scored ? 'inferred' : 'none'
  }

  if (!on) {
    const hint =
      suggestedOnly.length > 0
        ? `-- ${suggestedOnly.length} suggested join(s) exist — promote on canvas / stitch session first`
        : `-- No accepted joins between ${a.name} and ${b.name} — promote a join before trusting AI SQL`
    return (
      `-- Que: AI SQL blocked from inventing join paths (accepted-join graph only)\n` +
      `${hint}\n` +
      `SELECT a.*, b.*\n` +
      `FROM ${a.name} a\n` +
      `-- JOIN ${b.name} b ON …  -- promote a relationship, then re-run /sql\n` +
      `LIMIT 0;`
    )
  }

  return (
    `-- Que join source: ${joinSource} (schema-only)\n` +
    `SELECT a.*, b.*\n` +
    `FROM ${a.name} a\n` +
    `JOIN ${b.name} b\n` +
    `  ON ${on}\n` +
    `LIMIT 100;`
  )
}

function compactTable(t) {
  return {
    name: t.name,
    entityKind: t.entityKind,
    sourceType: t.sourceType,
    connection: t.connection,
    columns: t.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      keyKind: c.keyKind,
      samples: Array.isArray(c.samples) ? c.samples.slice(0, 5) : [],
    })),
  }
}

function extractSql(text) {
  const m = String(text).match(/```(?:sql)?\s*([\s\S]*?)```/i)
  return m ? m[1].trim() : null
}
