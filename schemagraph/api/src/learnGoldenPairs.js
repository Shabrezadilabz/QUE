/**
 * Learn customer-specific golden join pairs from query history + promoted joins.
 */
import { query } from './db.js'
import { extractJoinPairsFromSql } from './connectors/databricksQueryJoins.js'
import { assistJoinsFromSnowflakeHistory } from './connectors/snowflakeQueryJoins.js'
import { assistJoinsFromDatabricksHistory } from './connectors/databricksQueryJoins.js'
import { unsealConnectionConfig } from './connectionCrypto.js'
import { upsertGoldenEvalSchedule, getGoldenEvalSchedule } from './scheduledGoldenEval.js'

function normalizePair(p) {
  return {
    fromTable: String(p.fromTable || p.from_table || '').trim(),
    fromColumn: String(p.fromColumn || p.from_column || '').trim(),
    toTable: String(p.toTable || p.to_table || '').trim(),
    toColumn: String(p.toColumn || p.to_column || '').trim(),
  }
}

export async function upsertLearnedPair(workspaceId, pair, source, confidence = null) {
  const p = normalizePair(pair)
  if (!p.fromTable || !p.fromColumn || !p.toTable || !p.toColumn) return null
  const { rows } = await query(
    `INSERT INTO learned_golden_pairs (
       workspace_id, from_table, from_column, to_table, to_column,
       source, confidence, hit_count
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,1)
     ON CONFLICT (workspace_id, from_table, from_column, to_table, to_column)
     DO UPDATE SET
       hit_count = learned_golden_pairs.hit_count + 1,
       confidence = COALESCE(EXCLUDED.confidence, learned_golden_pairs.confidence),
       source = EXCLUDED.source,
       updated_at = now()
     RETURNING *`,
    [
      workspaceId,
      p.fromTable,
      p.fromColumn,
      p.toTable,
      p.toColumn,
      source,
      confidence,
    ],
  )
  return rows[0]
}

export async function listLearnedGoldenPairs(workspaceId, limit = 100) {
  const { rows } = await query(
    `SELECT * FROM learned_golden_pairs
     WHERE workspace_id = $1
     ORDER BY hit_count DESC, updated_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(limit, 200)],
  )
  return rows.map((r) => ({
    fromTable: r.from_table,
    fromColumn: r.from_column,
    toTable: r.to_table,
    toColumn: r.to_column,
    source: r.source,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    hitCount: r.hit_count,
  }))
}

async function learnFromPromotedJoins(workspaceId) {
  const { rows } = await query(
    `SELECT fo.name AS from_table, fc.name AS from_column,
            tto.name AS to_table, tc.name AS to_column, r.confidence
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects tto ON tto.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1 AND r.status = 'accepted'
     ORDER BY r.updated_at DESC
     LIMIT 80`,
    [workspaceId],
  )
  let n = 0
  for (const r of rows) {
    await upsertLearnedPair(
      workspaceId,
      r,
      'accepted_join',
      r.confidence != null ? Number(r.confidence) : 1,
    )
    n += 1
  }
  return n
}

async function learnFromConnectionHistory(workspaceId, connectionId) {
  const { rows } = await query(
    `SELECT id, source_type, config_json FROM connections
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, connectionId],
  )
  if (!rows[0]) return { created: 0 }
  const conn = rows[0]
  const config = unsealConnectionConfig(conn.config_json)
  const type = String(conn.source_type || '').toLowerCase()
  let assist = { created: 0 }
  if (type === 'snowflake') {
    assist = await assistJoinsFromSnowflakeHistory(workspaceId, connectionId, config)
  } else if (type === 'databricks') {
    assist = await assistJoinsFromDatabricksHistory(workspaceId, connectionId, config)
  }
  return assist
}

/** Learn pairs from job SQL notebooks in workspace. */
async function learnFromJobSql(workspaceId) {
  const { rows } = await query(
    `SELECT sql_text, notebook_json FROM jobs
     WHERE workspace_id = $1 AND sql_text IS NOT NULL
     ORDER BY updated_at DESC LIMIT 30`,
    [workspaceId],
  )
  let n = 0
  for (const r of rows) {
    const texts = [r.sql_text]
    const nb = r.notebook_json
    if (nb?.cells) {
      for (const c of nb.cells) {
        if (c.sql) texts.push(c.sql)
      }
    }
    for (const t of texts) {
      for (const p of extractJoinPairsFromSql(String(t || ''))) {
        await upsertLearnedPair(workspaceId, {
          fromTable: p.leftTable,
          fromColumn: p.leftCol,
          toTable: p.rightTable,
          toColumn: p.rightCol,
        }, 'query_history', 0.85)
        n += 1
      }
    }
  }
  return n
}

/**
 * Full learn pass + sync to golden eval schedule.
 */
export async function learnAndSyncGoldenPairs(workspaceId, opts = {}) {
  const fromJoins = await learnFromPromotedJoins(workspaceId)
  const fromJobs = await learnFromJobSql(workspaceId)
  let fromHistory = 0
  if (opts.connectionId) {
    const h = await learnFromConnectionHistory(workspaceId, opts.connectionId)
    fromHistory = h.created || 0
  }

  const learned = await listLearnedGoldenPairs(workspaceId, 200)
  const pairs = learned.map((p) => ({
    fromTable: p.fromTable,
    fromColumn: p.fromColumn,
    toTable: p.toTable,
    toColumn: p.toColumn,
  }))

  let schedule = null
  if (pairs.length) {
    schedule = await upsertGoldenEvalSchedule(workspaceId, {
      enabled: true,
      intervalHours: opts.intervalHours || 24,
      pairs,
    })
  } else {
    schedule = await getGoldenEvalSchedule(workspaceId)
  }

  return {
    learnedCount: pairs.length,
    fromPromotedJoins: fromJoins,
    fromJobSql: fromJobs,
    fromQueryHistory: fromHistory,
    pairs: pairs.slice(0, 50),
    schedule,
  }
}
