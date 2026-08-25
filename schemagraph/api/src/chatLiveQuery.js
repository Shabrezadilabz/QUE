/**
 * Chat live warehouse reads — generate SQL from schema metadata, execute read-only,
 * return rows to the UI only. Row payloads never enter the LLM prompt or chat history metadata.
 */
import {
  buildSchemaContextPack,
  findTablesMentioned,
  formatContextForPrompt,
} from './schemaContext.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { callChatModel, resolveModel } from './ai/models.js'
import { resolveProviderKeys } from './secrets.js'
import {
  executeLiveSql,
  prepareReadonlySql,
  resolveLiveTarget,
  LIVE_VALIDATE_MAX_ROWS,
} from './liveExec.js'
import { leafName, norm } from './inferJoins.js'
import { scrubGridRows } from './privacy/gridScrub.js'
import { isHidePiiRuleEnabled } from './workspaceRules.js'
import { loadPiiTaggedColumnNames } from './policyPacks.js'

const WRITE_RE =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|load into)\b/i

const SKIP_LIVE_RE =
  /^\/(help|outcome|agent|privacy|list|describe|joins|suggested|job|diff)\b/i

/** User wants factual row answers, not schema metadata only. */
export const WANTS_LIVE_DATA_RE =
  /\b(what|which|how many|show me|show|list|tell me|explain what|do we have|we have|are there|exists?|give me|get me|lookup|find)\b/i

const SCHEMA_ONLY_RE =
  /\b(describe|schema|columns?|fields?|join draft|suggested join|\/help|privacy policy|list tables)\b/i

/** Postgres/Snowflake connectors may return { name, dataType } — chat UI needs string names. */
export function normalizeLiveColumns(columns) {
  return (columns || [])
    .map((c) => {
      if (typeof c === 'string') return c.trim()
      if (c && typeof c === 'object' && c.name) return String(c.name).trim()
      return null
    })
    .filter(Boolean)
}

function extractSqlFromText(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fence = raw.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  if (/^\s*(with|select)\b/i.test(raw)) return raw.replace(/;+\s*$/, '').trim()
  return null
}

function compactPackForChat(pack, question, focusTables = []) {
  const mentioned = findTablesMentioned(pack, question, focusTables)
  const focusIds = new Set(mentioned.map((t) => t.id))
  const tables = [
    ...pack.tables.filter((t) => focusIds.has(t.id)),
    ...pack.tables.filter((t) => !focusIds.has(t.id)),
  ].slice(0, 30)
  return {
    ...pack,
    tables,
    relationships: pack.relationships.slice(0, 20),
  }
}

function resolveFocusTable(pack, question, mentions = null) {
  const explicit = Array.isArray(mentions?.tables) ? mentions.tables : []
  const mentioned = findTablesMentioned(pack, question, explicit)
  if (mentioned.length) return mentioned[0]

  const tokens = String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9_@.\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)

  for (const t of pack.tables) {
    const tableNorm = norm(leafName(t.name))
    if (tokens.some((tok) => tableNorm.includes(tok) || tok.includes(tableNorm))) {
      return t
    }
  }
  return pack.tables[0] || null
}

function heuristicLiveSql(question, pack, focusTable) {
  const q = String(question || '').toLowerCase().trim()
  const table = focusTable?.name || 'unknown_table'
  const safeTable = table.replace(/[^a-z0-9_."]/gi, '')

  if (WRITE_RE.test(q)) {
    return {
      sql: null,
      explanation: 'Write and DDL operations are blocked — read-only SELECT only.',
      error: 'blocked',
    }
  }

  const limit = LIVE_VALIDATE_MAX_ROWS
  const cols = focusTable?.columns || []
  const nameCol =
    cols.find((c) => /^(name|title|label|brand_name)$/i.test(c.name)) ||
    cols.find((c) => /name/i.test(c.name))
  const idCol = cols.find((c) => c.keyKind === 'pk') || cols[0]

  if (/\bcount\b/.test(q)) {
    return {
      sql: `SELECT COUNT(*) AS row_count\nFROM ${safeTable}`,
      explanation: `Count rows in **${table}** from your warehouse.`,
    }
  }

  if (/\b(distinct|unique)\b/.test(q) && idCol) {
    return {
      sql: `SELECT DISTINCT ${idCol.name}\nFROM ${safeTable}`,
      explanation: `Distinct values for **${idCol.name}** in **${table}**.`,
    }
  }

  const projection =
    cols.length <= 8
      ? cols.map((c) => c.name).join(', ')
      : [idCol?.name, nameCol?.name]
          .filter(Boolean)
          .concat(cols.slice(0, 4).map((c) => c.name))
          .filter((v, i, a) => v && a.indexOf(v) === i)
          .slice(0, 6)
          .join(', ') || '*'

  return {
    sql: `SELECT ${projection}\nFROM ${safeTable}`,
    explanation: `Live snapshot from **${table}** (${focusTable?.connection || 'warehouse'}). Results appear below — not sent to the AI model.`,
  }
}

async function generateLiveSqlDraft(workspaceId, question, { pack, model, keys, mentions }) {
  const focusTable = resolveFocusTable(pack, question, mentions)
  if (!focusTable) {
    return {
      sql: null,
      explanation: null,
      error: 'no_tables',
    }
  }

  if (!model) {
    return heuristicLiveSql(question, pack, focusTable)
  }

  const compact = compactPackForChat(
    pack,
    question,
    mentions?.tables || [],
  )
  const schemaBlock = formatContextForPrompt(compact)
  const system =
    `You are Que SQL generator — schema metadata ONLY (no row access).\n` +
    `Write ONE read-only PostgreSQL SELECT or WITH for the user's question.\n` +
    `Use ONLY tables/columns from context. Never invent names.\n` +
    `No INSERT/UPDATE/DELETE/DDL. Include LIMIT ${LIVE_VALIDATE_MAX_ROWS} or lower.\n` +
    `Respond with JSON only: {"sql":"...","explanation":"one short sentence for the user"}\n\n` +
    schemaBlock

  try {
    const raw = await callChatModel(model, system, question, [], keys)
    let sql = extractSqlFromText(raw)
    let explanation = null
    try {
      const jsonMatch = String(raw).match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed?.sql) sql = String(parsed.sql).trim()
        if (parsed?.explanation) explanation = String(parsed.explanation).trim()
      }
    } catch {
      /* ignore */
    }
    if (!sql) {
      return heuristicLiveSql(question, pack, focusTable)
    }
    if (WRITE_RE.test(sql)) {
      return {
        sql: null,
        explanation: 'Blocked: only read-only SELECT/WITH is allowed.',
        error: 'blocked',
      }
    }
    return {
      sql,
      explanation:
        explanation ||
        `Query generated from schema metadata for **${focusTable.name}**. Live rows shown below only.`,
    }
  } catch {
    return heuristicLiveSql(question, pack, focusTable)
  }
}

/**
 * @param {string} message
 * @param {{ hasSlashSkill?: boolean }} [ctx]
 */
export function shouldRunChatLiveQuery(message, ctx = {}) {
  const q = String(message || '').trim()
  if (!q || ctx.hasSlashSkill) return false
  if (SKIP_LIVE_RE.test(q)) return false
  if (WRITE_RE.test(q.toLowerCase())) return false
  if (SCHEMA_ONLY_RE.test(q.toLowerCase()) && !WANTS_LIVE_DATA_RE.test(q.toLowerCase())) {
    return false
  }
  return WANTS_LIVE_DATA_RE.test(q.toLowerCase())
}

/**
 * Generate SQL + execute on warehouse. Rows returned for UI — never for AI context.
 * @param {string} workspaceId
 * @param {string} question
 * @param {{ pack?: object, model?: object, keys?: object, mentions?: object, sqlHint?: string|null, userId?: string|null }} opts
 */
export async function runChatLiveQuery(workspaceId, question, opts = {}) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  if (settings.enableLiveValidate === false) {
    return {
      ok: false,
      skipped: true,
      reason: 'live_disabled',
      message: 'Live warehouse reads are off in Settings → AI & Policy.',
    }
  }

  const pack = opts.pack || (await buildSchemaContextPack(workspaceId))
  const keys = opts.keys || (await resolveProviderKeys(workspaceId))
  const model =
    opts.model ||
    resolveModel(settings, opts.modelId, keys)

  let sql = opts.sqlHint ? extractSqlFromText(opts.sqlHint) : null
  let explanation = null

  if (!sql) {
    const draft = await generateLiveSqlDraft(workspaceId, question, {
      pack,
      model,
      keys,
      mentions: opts.mentions,
    })
    if (draft.error === 'blocked' || draft.error === 'no_tables') {
      return { ok: false, skipped: true, reason: draft.error, message: draft.explanation }
    }
    sql = draft.sql
    explanation = draft.explanation
  }

  if (!sql) {
    return { ok: false, skipped: true, reason: 'no_sql' }
  }

  let connection
  try {
    connection = await resolveLiveTarget(workspaceId, {}, opts.connectionId || null)
  } catch (err) {
    return {
      ok: false,
      skipped: true,
      reason: 'no_connection',
      message: err.message || 'No live SQL connection configured.',
    }
  }

  const started = Date.now()
  let exec
  try {
    exec = await executeLiveSql(connection, sql, {
      maxRows: LIVE_VALIDATE_MAX_ROWS,
    })
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Live query failed',
      sql,
      explanation,
      connectionName: connection.name,
    }
  }

  const columnNames = normalizeLiveColumns(exec.columns)
  const hidePii = await isHidePiiRuleEnabled(workspaceId)
  const taggedNames = hidePii ? await loadPiiTaggedColumnNames(workspaceId) : null
  const scrubbedRows = hidePii
    ? scrubGridRows(exec.rows || [], columnNames, { taggedNames })
    : exec.rows || []
  const masked =
    hidePii &&
    JSON.stringify(scrubbedRows) !== JSON.stringify(exec.rows || [])

  return {
    ok: true,
    sql: exec.sqlExecuted || prepareReadonlySql(sql),
    explanation,
    connectionId: connection.id,
    connectionName: connection.name,
    columns: columnNames,
    rows: scrubbedRows,
    rowCount: scrubbedRows.length,
    durationMs: Date.now() - started,
    displayMasked: masked,
    policy: 'chat-live-readonly-capped',
    aiIsolation: 'row_payloads_never_sent_to_model',
  }
}

/**
 * Attach live query to chat result when eligible. Mutates/extends result object.
 */
export async function enrichChatWithLiveQuery(workspaceId, question, result, opts = {}) {
  if (!shouldRunChatLiveQuery(question, opts)) {
    return result
  }

  const live = await runChatLiveQuery(workspaceId, question, {
    pack: opts.pack,
    model: opts.model,
    keys: opts.keys,
    mentions: opts.mentions,
    sqlHint: result?.sql,
    userId: opts.userId,
  })

  if (!live.ok) {
    if (live.skipped && live.reason === 'live_disabled') {
      return {
        ...result,
        liveQuerySkipped: live.reason,
        liveQueryHint: live.message,
      }
    }
    if (live.error) {
      return {
        ...result,
        liveQuery: {
          ok: false,
          error: live.error,
          sql: live.sql || result?.sql || null,
          connectionName: live.connectionName || null,
        },
        sql: live.sql || result?.sql || null,
      }
    }
    return result
  }

  const focusTable = resolveFocusTable(opts.pack, question, opts.mentions)
  const intro =
    live.explanation ||
    `Fetched **${live.rowCount}** row(s) from **${live.connectionName}**.`

  const cleanReply = stripInternalPrefixes(result?.reply || '')
  const reply =
    `${intro}\n\n` +
    (cleanReply && !isMetadataOnlyReply(cleanReply)
      ? `${cleanReply}\n\n`
      : '') +
    `_Live warehouse data (${live.rowCount} row${live.rowCount === 1 ? '' : 's'}) is shown in the table below. Those values were **not** sent to the AI model._`

  return {
    ...result,
    reply,
    sql: live.sql,
    liveQuery: {
      ok: true,
      columns: live.columns,
      rows: live.rows,
      rowCount: live.rowCount,
      connectionName: live.connectionName,
      connectionId: live.connectionId,
      durationMs: live.durationMs,
      displayMasked: live.displayMasked,
      policy: live.policy,
      aiIsolation: live.aiIsolation,
    },
    planeScope: 'in_scope',
    planeScopeHint: null,
    mode: result?.mode ? `${result.mode}+live` : 'live',
    referencedTables: result?.referencedTables?.length
      ? result.referencedTables
      : focusTable
        ? [
            {
              name: focusTable.name,
              connection: focusTable.connection,
              sourceType: focusTable.sourceType,
              columns: (focusTable.columns || []).slice(0, 12).map((c) => ({
                name: c.name,
                dataType: c.dataType,
                keyKind: c.keyKind,
              })),
            },
          ]
        : result?.referencedTables || [],
  }
}

function stripInternalPrefixes(text) {
  return String(text || '')
    .replace(/^⚠️ \*\*Open schema drift\*\*[\s\S]*?\n\n/, '')
    .replace(/^_[^_]+_\s[\s\S]*?\n\n/, '')
    .trim()
}

function isMetadataOnlyReply(text) {
  const t = String(text || '').toLowerCase()
  return (
    t.includes('lineage anchors') ||
    t.includes('open schema drift') ||
    (t.startsWith('**') && t.includes('columns') && t.includes('table'))
  )
}
