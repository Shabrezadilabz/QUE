/**
 * S5.2 — BigQuery query-history assisted joins.
 */
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { extractJoinPairsFromSql } from './databricksQueryJoins.js'
import { leafName, norm } from '../inferJoins.js'

async function loadColumnIndex(workspaceId) {
  const { rows } = await query(
    `SELECT o.id AS object_id, o.name AS table_name, c.id AS column_id, c.name AS column_name
     FROM schema_objects o
     JOIN schema_columns c ON c.schema_object_id = o.id
     WHERE o.workspace_id = $1`,
    [workspaceId],
  )
  const map = new Map()
  for (const r of rows) {
    map.set(`${norm(leafName(r.table_name))}.${norm(r.column_name)}`, {
      objectId: r.object_id,
      columnId: r.column_id,
    })
    map.set(`${norm(r.table_name)}.${norm(r.column_name)}`, {
      objectId: r.object_id,
      columnId: r.column_id,
    })
  }
  return map
}

async function bqQuery(projectId, token, sql, location) {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      location,
      maxResults: 100,
      timeoutMs: 45000,
    }),
    signal: AbortSignal.timeout(50000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message || `BigQuery HTTP ${res.status}`
    throw new Error(msg)
  }
  const fields = json.schema?.fields || []
  const rows = json.rows || []
  return rows.map((r) => {
    const obj = {}
    fields.forEach((f, i) => {
      obj[f.name] = r.f?.[i]?.v ?? null
    })
    return obj
  })
}

/**
 * Fetch recent BQ jobs and suggest joins from SQL text.
 */
export async function assistJoinsFromBigQueryHistory(
  workspaceId,
  connectionId,
  config = {},
) {
  const projectId = config.projectId || config.project
  const token =
    config.token ||
    config.accessToken ||
    process.env.GOOGLE_ACCESS_TOKEN
  const location = config.location || 'US'
  const region = config.region || (location === 'EU' ? 'eu' : 'us')

  if (!projectId || !token) {
    return { created: 0, skipped: 'not_live_bigquery' }
  }

  let queryTexts = []
  try {
    const historySql = `
      SELECT query
      FROM \`${projectId}.region-${region}\`.INFORMATION_SCHEMA.JOBS_BY_PROJECT
      WHERE creation_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        AND statement_type = 'SELECT'
        AND query IS NOT NULL
        AND LOWER(query) LIKE '%join%'
      ORDER BY creation_time DESC
      LIMIT 40
    `
    const rows = await bqQuery(projectId, token, historySql, location)
    queryTexts = rows.map((r) => r.query).filter(Boolean)
  } catch {
    return { created: 0, skipped: 'query_history_unavailable' }
  }

  const pairs = []
  for (const q of queryTexts) {
    pairs.push(...extractJoinPairsFromSql(q))
  }
  if (!pairs.length) {
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
       WHERE workspace_id = $1 AND from_column_id = $2 AND to_column_id = $3
       LIMIT 1`,
      [workspaceId, left.columnId, right.columnId],
    )
    if (existing.length && existing[0].status === 'rejected') continue
    if (existing.length) continue

    const label = `${p.leftTable}.${p.leftCol} → ${p.rightTable}.${p.rightCol}`
    await query(
      `INSERT INTO relationships (
         id, workspace_id, from_object_id, from_column_id,
         to_object_id, to_column_id, relation_type, status, confidence,
         join_criteria, label, ai_notes, evidence_json
       ) VALUES ($1,$2,$3,$4,$5,$6,'ai-inferred','suggested',0.38,$7,$8,$9,$10::jsonb)`,
      [
        randomUUID(),
        workspaceId,
        left.objectId,
        left.columnId,
        right.objectId,
        right.columnId,
        label,
        label,
        'Observed in BigQuery INFORMATION_SCHEMA job history',
        JSON.stringify({
          source: 'bigquery_query_history',
          connectionId,
          signals: [{ type: 'query_log_join', weight: 0.35 }],
          summary: 'Observed in recent BigQuery SELECT with JOIN',
          scoredAt: new Date().toISOString(),
        }),
      ],
    )
    created += 1
  }

  return { created, scanned: queryTexts.length, pairsConsidered: pairs.length }
}
