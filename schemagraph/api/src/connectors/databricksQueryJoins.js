/**
 * Databricks query-history assisted joins (MVP).
 * Parses recent SQL for JOIN ... ON a.b = c.d patterns and upserts suggested edges.
 */
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { runDatabricksSql } from './databricks.js'
import { leafName, norm } from '../inferJoins.js'

const JOIN_ON_RE =
  /\bjoin\s+([`"[\w.]+)\s+(?:as\s+)?([a-zA-Z_][\w]*)?\s+on\s+([`"[\w.]+)\s*=\s*([`"[\w.]+)/gi
const EQ_RE =
  /([a-zA-Z_][\w]*)\.(`?[a-zA-Z_][\w]*`?)\s*=\s*([a-zA-Z_][\w]*)\.(`?[a-zA-Z_][\w]*`?)/g

function stripIdent(s) {
  return String(s || '')
    .replace(/^[`"[]+|[`"\]]+$/g, '')
    .split('.')
    .pop()
}

/**
 * @param {string} sqlText
 * @returns {Array<{ leftTable: string, leftCol: string, rightTable: string, rightCol: string }>}
 */
export function extractJoinPairsFromSql(sqlText) {
  const text = String(sqlText || '')
  const pairs = []
  const aliasToTable = new Map()

  // crude FROM / JOIN alias capture
  const fromJoin =
    /\b(?:from|join)\s+([`"[\w.]+)\s+(?:as\s+)?([a-zA-Z_][\w]*)?/gi
  let m
  while ((m = fromJoin.exec(text))) {
    const table = stripIdent(m[1])
    const alias = m[2] || table
    if (table) aliasToTable.set(norm(alias), table)
    aliasToTable.set(norm(table), table)
  }

  while ((m = JOIN_ON_RE.exec(text))) {
    const left = m[3]
    const right = m[4]
    const lp = left.split('.')
    const rp = right.split('.')
    if (lp.length < 2 || rp.length < 2) continue
    const lt = aliasToTable.get(norm(stripIdent(lp[0]))) || stripIdent(lp[0])
    const rt = aliasToTable.get(norm(stripIdent(rp[0]))) || stripIdent(rp[0])
    pairs.push({
      leftTable: lt,
      leftCol: stripIdent(lp[lp.length - 1]),
      rightTable: rt,
      rightCol: stripIdent(rp[rp.length - 1]),
    })
  }

  // fallback equality patterns
  while ((m = EQ_RE.exec(text))) {
    const lt = aliasToTable.get(norm(m[1])) || m[1]
    const rt = aliasToTable.get(norm(m[3])) || m[3]
    pairs.push({
      leftTable: stripIdent(lt),
      leftCol: stripIdent(m[2]),
      rightTable: stripIdent(rt),
      rightCol: stripIdent(m[4]),
    })
  }

  // dedupe
  const seen = new Set()
  return pairs.filter((p) => {
    if (!p.leftTable || !p.rightTable || !p.leftCol || !p.rightCol) return false
    if (norm(p.leftTable) === norm(p.rightTable) && norm(p.leftCol) === norm(p.rightCol))
      return false
    const k = `${norm(p.leftTable)}.${norm(p.leftCol)}|${norm(p.rightTable)}.${norm(p.rightCol)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function loadColumnIndex(workspaceId) {
  const { rows } = await query(
    `SELECT o.id AS object_id, o.name AS table_name, c.id AS column_id, c.name AS column_name
     FROM schema_objects o
     JOIN schema_columns c ON c.schema_object_id = o.id
     WHERE o.workspace_id = $1`,
    [workspaceId],
  )
  /** @type {Map<string, { objectId: string, columnId: string }>} */
  const map = new Map()
  for (const r of rows) {
    map.set(
      `${norm(leafName(r.table_name))}.${norm(r.column_name)}`,
      { objectId: r.object_id, columnId: r.column_id },
    )
    map.set(
      `${norm(r.table_name)}.${norm(r.column_name)}`,
      { objectId: r.object_id, columnId: r.column_id },
    )
  }
  return map
}

/**
 * Fetch recent query texts from Databricks (best-effort) and suggest joins.
 */
export async function assistJoinsFromDatabricksHistory(
  workspaceId,
  connectionId,
  config = {},
) {
  if (!config.host || !config.warehouseId || !config.token) {
    return { created: 0, skipped: 'not_live_databricks' }
  }

  let queryTexts = []
  try {
    // Prefer system table when available; fall back quietly
    const rows = await runDatabricksSql(
      config.host,
      config.warehouseId,
      config.token,
      `SELECT statement_text AS q
       FROM system.query.history
       WHERE statement_text IS NOT NULL
         AND lower(statement_text) LIKE '%join%'
       ORDER BY start_time DESC
       LIMIT 40`,
      { timeoutMs: 45_000 },
    )
    queryTexts = rows.map((r) => r.q).filter(Boolean)
  } catch {
    return { created: 0, skipped: 'query_history_unavailable' }
  }

  const pairs = []
  for (const q of queryTexts) {
    pairs.push(...extractJoinPairsFromSql(q))
  }
  if (pairs.length === 0) {
    return { created: 0, scanned: queryTexts.length }
  }

  const index = await loadColumnIndex(workspaceId)
  let created = 0
  for (const p of pairs.slice(0, 80)) {
    const left =
      index.get(`${norm(p.leftTable)}.${norm(p.leftCol)}`) ||
      index.get(`${norm(leafName(p.leftTable))}.${norm(p.leftCol)}`)
    const right =
      index.get(`${norm(p.rightTable)}.${norm(p.rightCol)}`) ||
      index.get(`${norm(leafName(p.rightTable))}.${norm(p.rightCol)}`)
    if (!left || !right) continue

    const { rows: existing } = await query(
      `SELECT id, status FROM relationships
       WHERE workspace_id = $1
         AND from_column_id = $2 AND to_column_id = $3
       LIMIT 1`,
      [workspaceId, left.columnId, right.columnId],
    )
    if (existing.length && existing[0].status === 'rejected') continue
    if (existing.length) continue

    const label = `${p.leftTable}.${p.leftCol} → ${p.rightTable}.${p.rightCol}`
    const evidence = {
      source: 'databricks_query_history',
      connectionId,
      signals: [{ type: 'query_log_join', weight: 0.35 }],
      summary: 'Observed in recent Databricks SQL JOIN',
      scoredAt: new Date().toISOString(),
    }
    await query(
      `INSERT INTO relationships (
         id, workspace_id, from_object_id, from_column_id,
         to_object_id, to_column_id, relation_type, status, confidence,
         join_criteria, label, ai_notes, evidence_json
       ) VALUES ($1,$2,$3,$4,$5,$6,'ai-inferred','suggested',$7,$8,$9,$10,$11::jsonb)`,
      [
        randomUUID(),
        workspaceId,
        left.objectId,
        left.columnId,
        right.objectId,
        right.columnId,
        0.82,
        label,
        label,
        'query-history assist',
        JSON.stringify(evidence),
      ],
    )
    created += 1
  }

  return { created, scanned: queryTexts.length, pairs: pairs.length }
}
