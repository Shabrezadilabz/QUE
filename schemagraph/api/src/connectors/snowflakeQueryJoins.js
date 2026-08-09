/**
 * Snowflake query-history assisted joins (MVP) — parity with Databricks assist.
 */
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { runReadonlyQuery } from './snowflake.js'
import { leafName, norm } from '../inferJoins.js'
import { extractJoinPairsFromSql } from './databricksQueryJoins.js'

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

/**
 * Fetch recent query texts from Snowflake ACCOUNT_USAGE (best-effort).
 */
export async function assistJoinsFromSnowflakeHistory(
  workspaceId,
  connectionId,
  config = {},
) {
  if (!config.account || (!config.token && !config.password)) {
    return { created: 0, skipped: 'not_live_snowflake' }
  }

  let queryTexts = []
  try {
    const result = await runReadonlyQuery(
      config,
      `SELECT QUERY_TEXT AS q
       FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
       WHERE QUERY_TEXT IS NOT NULL
         AND LOWER(QUERY_TEXT) LIKE '%join%'
       ORDER BY START_TIME DESC
       LIMIT 40`,
      { timeoutMs: 45_000 },
    )
    const rows = Array.isArray(result) ? result : result?.rows || []
    queryTexts = rows.map((r) => r.q || r.Q || r.query_text).filter(Boolean)
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
    if (existing.length) continue

    const label = `${p.leftTable}.${p.leftCol} → ${p.rightTable}.${p.rightCol}`
    const evidence = {
      source: 'snowflake_query_history',
      connectionId,
      signals: [
        {
          code: 'query_log_join',
          label: 'Observed in Snowflake QUERY_HISTORY JOIN',
          weight: 0.35,
        },
      ],
      summary: 'Observed in recent Snowflake SQL JOIN',
      sqlSnippet: `SELECT * FROM ${p.leftTable} a JOIN ${p.rightTable} b ON a.${p.leftCol} = b.${p.rightCol} LIMIT 20`,
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
        'snowflake query-history assist',
        JSON.stringify(evidence),
      ],
    )
    created += 1
  }

  return { created, scanned: queryTexts.length, pairs: pairs.length }
}
