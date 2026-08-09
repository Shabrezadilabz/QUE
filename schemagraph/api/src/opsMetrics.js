/**
 * Ops / monitoring — health detail + Prometheus-ish text metrics.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { authDisabled, getSsoConfig } from './auth.js'
import { vectorExtensionReady } from './ai/vectorStore.js'

const startedAt = Date.now()

export async function collectOpsSnapshot() {
  let dbOk = false
  let dbLatencyMs = null
  const t0 = Date.now()
  try {
    await query('SELECT 1')
    dbOk = true
    dbLatencyMs = Date.now() - t0
  } catch (err) {
    dbLatencyMs = Date.now() - t0
    return {
      ok: false,
      service: 'que-api',
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      db: { ok: false, latencyMs: dbLatencyMs, error: String(err.message || err) },
      authDisabled: authDisabled(),
      sso: getSsoConfig().status,
    }
  }

  let workspaces = 0
  let connections = 0
  let jobs = 0
  let managedDatasets = 0
  let openSuggestedJoins = 0
  let vectorReady = false
  try {
    const [w, c, j, m, r] = await Promise.all([
      query(`SELECT COUNT(*)::int AS n FROM workspaces`),
      query(`SELECT COUNT(*)::int AS n FROM connections`),
      query(`SELECT COUNT(*)::int AS n FROM jobs`),
      query(`SELECT COUNT(*)::int AS n FROM managed_datasets`).catch(() => ({
        rows: [{ n: 0 }],
      })),
      query(
        `SELECT COUNT(*)::int AS n FROM relationships
         WHERE status = 'suggested' AND relation_type = 'ai-inferred'`,
      ),
    ])
    workspaces = w.rows[0].n
    connections = c.rows[0].n
    jobs = j.rows[0].n
    managedDatasets = m.rows[0].n
    openSuggestedJoins = r.rows[0].n
    vectorReady = await vectorExtensionReady().catch(() => false)
  } catch {
    /* partial ok */
  }

  const snapshot = {
    ok: true,
    service: 'que-api',
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    authDisabled: authDisabled(),
    sso: getSsoConfig().status,
    vectorReady,
    inventory: {
      workspaces,
      connections,
      jobs,
      managedDatasets,
      openSuggestedJoins,
    },
    region: process.env.QUE_REGION || 'unspecified',
    generatedAt: new Date().toISOString(),
  }

  try {
    await query(
      `INSERT INTO ops_heartbeats (id, service, status, detail_json)
       VALUES ($1,'que-api',$2,$3::jsonb)`,
      [
        randomUUID(),
        snapshot.ok ? 'ok' : 'degraded',
        JSON.stringify({
          dbLatencyMs,
          inventory: snapshot.inventory,
        }),
      ],
    )
    // Keep last 500 heartbeats
    await query(
      `DELETE FROM ops_heartbeats WHERE id IN (
         SELECT id FROM ops_heartbeats ORDER BY created_at DESC OFFSET 500
       )`,
    )
  } catch {
    /* table may be missing until migrate */
  }

  return snapshot
}

export function formatPrometheus(snapshot) {
  const lines = [
    `# HELP que_up 1 if API healthy`,
    `# TYPE que_up gauge`,
    `que_up ${snapshot.ok ? 1 : 0}`,
    `# HELP que_uptime_seconds Process uptime`,
    `# TYPE que_uptime_seconds counter`,
    `que_uptime_seconds ${snapshot.uptimeSec || 0}`,
    `# HELP que_db_latency_ms Last DB ping latency`,
    `# TYPE que_db_latency_ms gauge`,
    `que_db_latency_ms ${snapshot.db?.latencyMs ?? -1}`,
    `# HELP que_workspaces Workspace count`,
    `# TYPE que_workspaces gauge`,
    `que_workspaces ${snapshot.inventory?.workspaces || 0}`,
    `# HELP que_connections Connection count`,
    `# TYPE que_connections gauge`,
    `que_connections ${snapshot.inventory?.connections || 0}`,
    `# HELP que_jobs Job count`,
    `# TYPE que_jobs gauge`,
    `que_jobs ${snapshot.inventory?.jobs || 0}`,
    `# HELP que_managed_datasets Managed dataset count`,
    `# TYPE que_managed_datasets gauge`,
    `que_managed_datasets ${snapshot.inventory?.managedDatasets || 0}`,
    `# HELP que_suggested_joins Open suggested joins`,
    `# TYPE que_suggested_joins gauge`,
    `que_suggested_joins ${snapshot.inventory?.openSuggestedJoins || 0}`,
  ]
  return lines.join('\n') + '\n'
}
