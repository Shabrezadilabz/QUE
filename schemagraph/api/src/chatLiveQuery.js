/**
 * Chat live warehouse reads — generate SQL from schema metadata, execute read-only,
 * return rows to the UI only. Row payloads never enter the LLM prompt or chat history metadata.
 */
import {
  buildSchemaContextPack,
  findTablesMentioned,
} from './schemaContext.js'
import { buildChatGraphContext } from './chatGraphContext.js'
import { buildPinnedSamplesAiPack } from './pinnedSamples.js'
import {
  validateSqlAgainstSchema,
  filterPackForConnection,
  filterPackByLiveTables,
  heuristicBrandRevenueSql,
  heuristicBrandRevenueSqlFromLive,
  isMissingRelationError,
  isBrandRevenueQuestion,
  missingRelationName,
} from './chatSqlGuard.js'

function resolveLiveTableRefForCheck(liveSet, baseName) {
  const b = String(baseName || '').toLowerCase()
  if (liveSet.has(b)) return b
  for (const n of liveSet) {
    if (n === b || n.endsWith(`.${b}`) || leafName(n).toLowerCase() === b) return n
  }
  return null
}
import { getWorkspaceSettings } from './workspaceSettings.js'
import { callChatModel, resolveModel } from './ai/models.js'
import { resolveProviderKeys } from './secrets.js'
import {
  executeLiveSql,
  prepareReadonlySql,
  resolveLiveTarget,
  LIVE_VALIDATE_MAX_ROWS,
} from './liveExec.js'
import { listLiveTableNames } from './connectors/postgres.js'
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
  /\b(what|which|how many|how much|show me|show|list|tell me|let me know|explain what|do we have|we have|are there|exists?|give me|get me|lookup|find|can you|could you|whats|what's|what is|what are|what was|who|when|where)\b/i

/** Revenue / KPI / business-metric questions — always try a warehouse read. */
export const METRIC_QUESTION_RE =
  /\b(revenue|sales|total|amount|profit|margin|cost|price|orders?|customers?|units|inventory|stock|spend|budget|kpi|metric|performance|growth|turnover|earnings|avg|average|sum|count)\b/i

const SCHEMA_ONLY_RE =
  /\b(describe|schema|columns?|fields?|join draft|suggested join|\/help|privacy policy|list tables|how do i join|slash skill|\/list|\/describe|\/joins|\/sql)\b/i

/**
 * Natural-language question that should trigger a live warehouse read.
 * @param {string} message
 */
export function looksLikeDataQuestion(message) {
  const q = String(message || '').trim().toLowerCase()
  if (!q || q.length < 4) return false
  if (WANTS_LIVE_DATA_RE.test(q)) return true
  if (METRIC_QUESTION_RE.test(q)) return true
  if (/\?\s*$/.test(q)) return true
  return false
}

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


function resolveFocusTable(pack, question, mentions = null) {
  const explicit = Array.isArray(mentions?.tables) ? mentions.tables : []
  const mentioned = findTablesMentioned(pack, question, explicit)
  if (mentioned.length) return mentioned[0]

  const q = String(question || '').toLowerCase()

  if (/\b(revenue|sales|order total|turnover)\b/.test(q)) {
    const orders = pack.tables.find((t) => /\borders?\b/i.test(t.name))
    if (orders) return orders
  }

  if (/\b(brand|puma|nike|adidas|reebok)\b/.test(q)) {
    const brands = pack.tables.find((t) => /\bbrands?\b/i.test(t.name))
    if (brands) return brands
  }

  const tokens = q
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

function tryBrandRevenueSql(question, pack, connectionName, graphCtx) {
  if (!isBrandRevenueQuestion(question)) return null
  const h = heuristicBrandRevenueSql(question, pack)
  if (!h?.sql) return null
  const check = validateSqlAgainstSchema(h.sql, pack, connectionName)
  if (!check.ok) return null
  return { ...h, graphCtx, source: 'heuristic-brand-revenue' }
}

async function resolveLiveScopedPack(pack, connection) {
  let scoped = filterPackForConnection(pack, connection.name || null)
  /** @type {string[]} */
  let liveNames = []
  if (connection.type === 'postgresql') {
    try {
      liveNames = await listLiveTableNames(connection.config)
      scoped = filterPackByLiveTables(scoped, liveNames)
    } catch (err) {
      console.warn('[Que chat] live table list skipped:', err.message || err)
    }
  }
  return { scopedPack: scoped, liveNames }
}

function pickValidatedSql(question, pack, draft, connectionName) {
  if (!draft?.sql) return draft
  const check = validateSqlAgainstSchema(draft.sql, pack, connectionName)
  if (check.ok) return draft

  const heuristic = heuristicBrandRevenueSql(question, pack)
  if (heuristic?.sql) {
    const hCheck = validateSqlAgainstSchema(heuristic.sql, pack, connectionName)
    if (hCheck.ok) {
      return {
        ...heuristic,
        graphCtx: draft.graphCtx,
        sqlCorrected: true,
        correctionReason: `Removed unknown tables: ${check.unknown.join(', ')}`,
      }
    }
  }

  const focusTable = resolveFocusTable(pack, question, null)
  const fallback = heuristicLiveSql(question, pack, focusTable)
  if (fallback?.sql) {
    const fCheck = validateSqlAgainstSchema(fallback.sql, pack, connectionName)
    if (fCheck.ok) {
      return {
        ...fallback,
        graphCtx: draft.graphCtx,
        sqlCorrected: true,
        correctionReason: `Unknown tables in model SQL: ${check.unknown.join(', ')}`,
      }
    }
  }

  return {
    ...draft,
    error: 'invalid_tables',
    explanation: `SQL referenced tables not in schema: ${check.unknown.join(', ')}. Allowed: ${check.allowedNames.slice(0, 12).join(', ')}…`,
  }
}

async function loadPinnedSamplesForSql(workspaceId) {
  try {
    const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
    if (settings.aiMayUsePinnedSamples === false) return []
    return await buildPinnedSamplesAiPack(workspaceId, { maxTables: 12 })
  } catch {
    return []
  }
}

function buildSqlUserMessage(question, tableNames = []) {
  const list =
    tableNames.length > 0
      ? tableNames.slice(0, 30).join(', ')
      : '(see SCHEMA PRIMER)'
  return (
    `Before writing SQL, confirm you will use ONLY these tables: ${list}.\n` +
    `Use column sample values in SCHEMA PRIMER to pick correct filters (e.g. brand names).\n\n` +
    `Question: ${question}`
  )
}

async function generateLiveSqlDraft(
  workspaceId,
  question,
  { pack, model, keys, mentions, graphCtx, audience, connectionName, pinnedSamples },
) {
  const scopedPack = filterPackForConnection(pack, connectionName)
  const pins = pinnedSamples ?? (await loadPinnedSamplesForSql(workspaceId))
  const ctx = buildChatGraphContext(
    scopedPack,
    question,
    findTablesMentioned(scopedPack, question, mentions?.tables || []),
    [],
    {
      audience: audience === 'engineer' ? 'engineer' : 'ceo',
      connectionName,
      pinnedSamples: pins,
      includeSamples: true,
      liveVerified: Boolean(connectionName),
    },
  )

  const focusTable =
    ctx.focusTables[0] || resolveFocusTable(scopedPack, question, mentions)
  if (!focusTable) {
    return {
      sql: null,
      explanation: null,
      error: 'no_tables',
      graphCtx: ctx,
    }
  }

  const brandHeuristic = tryBrandRevenueSql(
    question,
    scopedPack,
    connectionName,
    ctx,
  )
  if (brandHeuristic) return brandHeuristic

  if (isBrandRevenueQuestion(question)) {
    const h = heuristicBrandRevenueSql(question, scopedPack)
    if (h?.sql) {
      const check = validateSqlAgainstSchema(h.sql, scopedPack, connectionName)
      if (check.ok) {
        return { ...h, graphCtx: ctx, source: 'heuristic-brand-revenue' }
      }
    }
    return {
      sql: null,
      explanation:
        'Could not query brand revenue — ensure **orders** and **brands** exist on your live Postgres (re-sync Sources if needed).',
      error: 'no_sql',
      graphCtx: ctx,
    }
  }

  if (!model) {
    const h = heuristicLiveSql(question, scopedPack, focusTable)
    return { ...h, graphCtx: ctx }
  }

  const allowed = validateSqlAgainstSchema('SELECT 1 FROM x', scopedPack, connectionName)
    .allowedNames
  const allowBlock =
    allowed.length > 0
      ? `\nALLOWED TABLE NAMES (use ONLY these — never invent):\n${allowed.slice(0, 50).join(', ')}\n`
      : ''

  const joinPathNote =
    ctx.joinPaths.length > 0
      ? `\nPrefer JOIN paths listed in the graph (e.g. ${ctx.joinPaths[0].path.join(' → ')}).\n`
      : ctx.plan.needsJoins
        ? '\nQuestion likely needs JOINs — follow FK relationships in the graph.\n'
        : ''

  const system =
    `You are Que SQL generator.\n` +
    `STEP 1 — Read SCHEMA PRIMER first (exact tables, columns, sample values).\n` +
    `STEP 2 — Read join paths and relationships.\n` +
    `STEP 3 — Write ONE read-only PostgreSQL SELECT or WITH using ONLY names from SCHEMA PRIMER.\n` +
    `Never invent tables or columns. If revenue + brand: join orders to brands using FK paths.\n` +
    allowBlock +
    joinPathNote +
    `Use sample values to verify filters (e.g. WHERE LOWER(b.name) LIKE '%puma%').\n` +
    `For revenue/sales/totals use SUM/COUNT/AVG with GROUP BY when aggregating.\n` +
    `No INSERT/UPDATE/DELETE/DDL. Include LIMIT ${LIVE_VALIDATE_MAX_ROWS} or lower.\n` +
    `Respond with JSON only: {"sql":"...","explanation":"one short sentence"}\n\n` +
    ctx.promptBlock

  const userMsg = buildSqlUserMessage(
    question,
    ctx.focusTables?.map((t) => t.name) || [],
  )

  try {
    const raw = await callChatModel(model, system, userMsg, [], keys)
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
      const h = heuristicLiveSql(question, scopedPack, focusTable)
      return { ...h, graphCtx: ctx }
    }
    if (WRITE_RE.test(sql)) {
      return {
        sql: null,
        explanation: 'Blocked: only read-only SELECT/WITH is allowed.',
        error: 'blocked',
        graphCtx: ctx,
      }
    }
    const draft = {
      sql,
      explanation:
        explanation ||
        `Query generated from focus graph (${ctx.focusTables.length} tables) for **${focusTable.name}**. Live rows shown below only.`,
      graphCtx: ctx,
    }
    return pickValidatedSql(question, scopedPack, draft, connectionName)
  } catch {
    const h = heuristicLiveSql(question, scopedPack, focusTable)
    return { ...h, graphCtx: ctx }
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
  const lower = q.toLowerCase()
  if (SCHEMA_ONLY_RE.test(lower) && !looksLikeDataQuestion(q)) {
    return false
  }
  if (looksLikeDataQuestion(q)) return true
  // CEO mode: conversational questions should prefer live reads over schema help.
  if (
    ctx.audience === 'ceo' &&
    !SCHEMA_ONLY_RE.test(lower) &&
    q.length >= 10 &&
    !/^(hi|hello|hey|thanks|thank you)\b/i.test(lower)
  ) {
    return true
  }
  return false
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
  const audience = opts.audience === 'engineer' ? 'engineer' : 'ceo'

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

  const connectionName = connection.name || null
  const { scopedPack, liveNames } = await resolveLiveScopedPack(pack, connection)
  const liveSet = new Set(liveNames.map((n) => String(n).toLowerCase()))
  const pinnedSamples = await loadPinnedSamplesForSql(workspaceId)

  if (isBrandRevenueQuestion(question)) {
    const fromLive = heuristicBrandRevenueSqlFromLive(liveSet, question)
    if (fromLive?.sql) {
      const started = Date.now()
      try {
        const exec = await executeLiveSql(connection, fromLive.sql, {
          maxRows: LIVE_VALIDATE_MAX_ROWS,
        })
        const columnNames = normalizeLiveColumns(exec.columns)
        const hidePii = await isHidePiiRuleEnabled(workspaceId)
        const taggedNames = hidePii ? await loadPiiTaggedColumnNames(workspaceId) : null
        const scrubbedRows = hidePii
          ? scrubGridRows(exec.rows || [], columnNames, { taggedNames })
          : exec.rows || []
        return {
          ok: true,
          sql: exec.sqlExecuted || prepareReadonlySql(fromLive.sql),
          explanation: fromLive.explanation,
          connectionId: connection.id,
          connectionName: connection.name,
          columns: columnNames,
          rows: scrubbedRows,
          rowCount: scrubbedRows.length,
          durationMs: Date.now() - started,
          displayMasked:
            hidePii &&
            JSON.stringify(scrubbedRows) !== JSON.stringify(exec.rows || []),
          policy: 'chat-live-readonly-capped',
          aiIsolation: 'row_payloads_never_sent_to_model',
          graphCtx: null,
          source: 'heuristic-brand-revenue-live',
        }
      } catch (err) {
        console.warn('[Que chat] live brand revenue fast path failed:', err.message || err)
      }
    }
  }

  let graphCtx = buildChatGraphContext(
    scopedPack,
    question,
    findTablesMentioned(scopedPack, question, opts.mentions?.tables || []),
    opts.ragChunks || [],
    {
      audience,
      connectionName,
      pinnedSamples,
      includeSamples: true,
      liveVerified: connection.type === 'postgresql',
    },
  )
  graphCtx.primerReady = true

  let sql = opts.sqlHint ? extractSqlFromText(opts.sqlHint) : null
  let explanation = null

  if (!sql) {
    const draft = await generateLiveSqlDraft(workspaceId, question, {
      pack: scopedPack,
      model,
      keys,
      mentions: opts.mentions,
      graphCtx,
      audience,
      connectionName,
      pinnedSamples,
    })
    graphCtx = draft.graphCtx || graphCtx
    if (draft.error === 'blocked' || draft.error === 'no_tables' || draft.error === 'invalid_tables' || draft.error === 'no_sql') {
      return {
        ok: false,
        skipped: true,
        reason: draft.error,
        message: draft.explanation || 'Could not generate SQL for this question.',
        graphCtx,
      }
    }
    sql = draft.sql
    explanation = draft.explanation
  } else {
    const check = validateSqlAgainstSchema(sql, scopedPack, connectionName)
    if (!check.ok) {
      const fixed = pickValidatedSql(
        question,
        scopedPack,
        { sql, explanation, graphCtx },
        connectionName,
      )
      if (fixed.error) {
        return {
          ok: false,
          skipped: true,
          reason: fixed.error,
          message: fixed.explanation,
          graphCtx,
        }
      }
      sql = fixed.sql
      explanation = fixed.explanation || explanation
    }
  }

  if (!sql) {
    const hint =
      isBrandRevenueQuestion(question) &&
      !resolveLiveTableRefForCheck(liveSet, 'orders')
        ? 'Your live Postgres is missing **orders** and/or **brands** — run SportEdge bootstrap or re-sync Sources.'
        : 'Could not generate SQL for this question.'
    return { ok: false, skipped: true, reason: 'no_sql', message: hint, graphCtx }
  }

  const started = Date.now()
  let exec
  try {
    exec = await executeLiveSql(connection, sql, {
      maxRows: LIVE_VALIDATE_MAX_ROWS,
    })
  } catch (err) {
    const errMsg = err.message || 'Live query failed'
    if (isMissingRelationError(errMsg)) {
      let retryPack = scopedPack
      if (connection.type === 'postgresql') {
        try {
          const liveNames = await listLiveTableNames(connection.config)
          retryPack = filterPackByLiveTables(scopedPack, liveNames)
        } catch {
          /* use scoped pack */
        }
      }

      const retry =
        tryBrandRevenueSql(question, retryPack, connectionName, graphCtx) ||
        (() => {
          const h = heuristicBrandRevenueSql(question, retryPack)
          if (!h?.sql) return null
          const check = validateSqlAgainstSchema(h.sql, retryPack, connectionName)
          return check.ok ? { ...h, graphCtx } : null
        })()

      if (retry?.sql && retry.sql !== sql) {
        try {
          exec = await executeLiveSql(connection, retry.sql, {
            maxRows: LIVE_VALIDATE_MAX_ROWS,
          })
          sql = retry.sql
          explanation = retry.explanation
        } catch (retryErr) {
          return {
            ok: false,
            error: retryErr.message || errMsg,
            sql,
            explanation,
            connectionName: connection.name,
            graphCtx,
          }
        }
      } else {
        const missing = missingRelationName(errMsg)
        return {
          ok: false,
          error: errMsg,
          sql,
          explanation:
            missing && isBrandRevenueQuestion(question)
              ? `Table **${missing}** is not in your live warehouse. Use orders + brands for revenue.`
              : explanation,
          connectionName: connection.name,
          graphCtx,
        }
      }
    } else {
      return {
        ok: false,
        error: errMsg,
        sql,
        explanation,
        connectionName: connection.name,
        graphCtx,
      }
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
    graphCtx,
  }
}

/**
 * Merge successful live warehouse execution into a chat result object.
 * @param {string} question
 * @param {object} live from runChatLiveQuery (ok: true)
 * @param {object} result base chat result
 * @param {object} opts
 */
export async function formatLiveQuerySuccessResult(question, live, result, opts = {}) {
  const graphCtx = live.graphCtx || opts.graphCtx || null
  const focusTable =
    graphCtx?.focusTables?.[0] ||
    resolveFocusTable(opts.pack, question, opts.mentions)
  const audience = opts.audience === 'engineer' ? 'engineer' : 'ceo'
  const focusName = focusTable?.name || null

  const reply =
    audience === 'ceo'
      ? await buildCeoSummary(question, live, {
          model: opts.model,
          keys: opts.keys,
          focusTableName: focusName,
        })
      : buildEngineerLiveReply(live, result, graphCtx)

  const engineerTables =
    graphCtx?.focusTables?.slice(0, 8).map((t) => ({
      name: t.name,
      connection: t.connection,
      sourceType: t.sourceType,
      columns: (t.columns || []).slice(0, 12).map((c) => ({
        name: c.name,
        dataType: c.dataType,
        keyKind: c.keyKind,
      })),
    })) || []

  return {
    ...result,
    reply,
    audience,
    sql: live.sql,
    graphContext: graphCtx
      ? {
          plan: graphCtx.plan,
          joinPaths: graphCtx.joinPaths,
          focusTableCount: graphCtx.focusTables?.length ?? 0,
        }
      : null,
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
      compact: audience === 'ceo',
    },
    planeScope: 'in_scope',
    planeScopeHint: null,
    mode: result?.mode ? `${result.mode}+live` : 'live-graph',
    referencedTables:
      audience === 'engineer'
        ? engineerTables.length
          ? engineerTables
          : result?.referencedTables?.length
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
              : result?.referencedTables || []
        : [],
    retrievedChunks: audience === 'ceo' ? [] : result?.retrievedChunks,
    samplePreviews: audience === 'ceo' ? [] : result?.samplePreviews,
  }
}

/**
 * Attach live query to chat result when eligible. Mutates/extends result object.
 */
export async function enrichChatWithLiveQuery(workspaceId, question, result, opts = {}) {
  if (opts.skipLive) return result
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
    graphCtx: opts.graphCtx,
    audience: opts.audience,
  })

  if (!live.ok) {
    const audience = opts.audience === 'engineer' ? 'engineer' : 'ceo'
    const failReply = buildLiveFailureReply(question, live, audience)

    if (live.skipped && live.reason === 'live_disabled') {
      return {
        ...result,
        reply: failReply,
        liveQuerySkipped: live.reason,
        liveQueryHint: live.message,
        audience,
      }
    }
    if (live.error) {
      return {
        ...result,
        reply: failReply,
        liveQuery: {
          ok: false,
          error: live.error,
          sql: live.sql || result?.sql || null,
          connectionName: live.connectionName || null,
        },
        sql: live.sql || result?.sql || null,
        audience,
      }
    }
    return {
      ...result,
      reply: failReply,
      liveQuerySkipped: live.reason || 'skipped',
      audience,
    }
  }

  return formatLiveQuerySuccessResult(question, live, result, opts)
}

function buildLiveFailureReply(question, live, audience) {
  if (audience === 'ceo') {
    if (live.reason === 'live_disabled') {
      return 'Live data reads are turned off for this workspace. Ask an admin to enable them in Settings → AI & Policy.'
    }
    if (live.reason === 'no_connection') {
      return 'I couldn’t reach your warehouse yet. Connect a Postgres or SQL source first, then ask again.'
    }
    if (live.message) {
      return String(live.message).replace(/\*\*/g, '')
    }
    if (live.error) {
      return `I tried to look that up but the query didn’t succeed. ${String(live.error).slice(0, 160)}`
    }
    if (live.reason === 'no_sql') {
      return 'I couldn’t build a query for that question. Make sure **orders** and **brands** exist on your Postgres source, then re-sync.'
    }
    return `I couldn’t find live data for “${String(question || '').slice(0, 80)}” right now. Try naming a table with @ or check your warehouse connection.`
  }
  const base = live.message || live.error || live.reason || 'Live query skipped'
  return `**Live read failed** — ${base}`
}

export { buildLiveFailureReply }

function heuristicCeoSummary(question, live, focusTableName) {
  const n = live.rowCount ?? (live.rows || []).length
  const cols = (live.columns || []).slice(0, 5).join(', ')
  const subject = focusTableName || 'your data'
  if (n === 0) {
    return `I didn’t find any matching records for that question.`
  }
  if (n === 1) {
    return `I found one record — details are in the table below.`
  }
  return `I found ${n} records — see the table below.`
}

/**
 * One-shot CEO summary using live rows — ephemeral; not stored in RAG / chat AI context.
 */
async function buildCeoSummary(question, live, { model, keys, focusTableName }) {
  const rows = live.rows || []
  const columns = live.columns || []
  if (!rows.length) {
    return heuristicCeoSummary(question, live, focusTableName)
  }
  if (!model) {
    return heuristicCeoSummary(question, live, focusTableName)
  }

  const sampleLines = rows
    .slice(0, 20)
    .map((row, i) => {
      const parts = columns.map((c) => `${c}: ${formatCeoCell(row[c])}`)
      return `${i + 1}. ${parts.join(' · ')}`
    })
    .join('\n')

  const system =
    `You write short answers for a business executive (CEO).\n` +
    `Rules:\n` +
    `- 1–2 short sentences max, plain English, confident and clear\n` +
    `- Answer the question directly using the result rows\n` +
    `- No bullet lists unless the user asked for a list\n` +
    `- No SQL, no database/connection/table names, no technical jargon\n` +
    `- Do not mention AI, models, queries, or how data was fetched\n` +
    `- You may name brands, products, numbers, and regions from the rows`

  const userMsg =
    `Question: ${question}\n\n` +
    `Result rows (${live.rowCount} total, sample below):\n${sampleLines}`

  try {
    const text = await callChatModel(model, system, userMsg, [], keys)
    return String(text || '').trim() || heuristicCeoSummary(question, live, focusTableName)
  } catch {
    return heuristicCeoSummary(question, live, focusTableName)
  }
}

function formatCeoCell(v) {
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v).slice(0, 80)
}

function buildEngineerLiveReply(live, result, graphCtx = null) {
  const intro =
    live.explanation ||
    `Fetched **${live.rowCount}** row(s) from **${live.connectionName}**.`

  const plan = graphCtx?.plan
  const planBlock = plan
    ? `**Query plan:** ${plan.intent}` +
      (plan.metrics.length ? ` · metrics: ${plan.metrics.join(', ')}` : '') +
      (plan.needsJoins ? ' · joins required' : '') +
      '\n'
    : ''

  const pathBlock =
    graphCtx?.joinPaths?.length > 0
      ? `**Join path used:** ${graphCtx.joinPaths[0].path.join(' → ')}\n`
      : ''

  const tablesBlock =
    graphCtx?.focusTables?.length > 0
      ? `**Focus tables (${graphCtx.focusTables.length}):** ${graphCtx.focusTables
          .slice(0, 6)
          .map((t) => t.name)
          .join(', ')}${graphCtx.focusTables.length > 6 ? '…' : ''}\n`
      : ''

  const sqlBlock = live.sql
    ? `\`\`\`sql\n${live.sql}\n\`\`\`\n`
    : ''

  const execBlock =
    `**Execution:** ${live.connectionName}` +
    (live.durationMs != null ? ` · ${live.durationMs}ms` : '') +
    ` · ${live.rowCount} row(s) · read-only · max ${LIVE_VALIDATE_MAX_ROWS}\n`

  const cleanReply = stripInternalPrefixes(result?.reply || '')
  const contextNote =
    cleanReply && !isMetadataOnlyReply(cleanReply) ? `${cleanReply}\n\n` : ''

  return (
    `${intro}\n\n` +
    planBlock +
    pathBlock +
    tablesBlock +
    sqlBlock +
    execBlock +
    contextNote +
    `_Live warehouse data is in the table below. Row values were **not** sent to the AI model._`
  )
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
