/**
 * Connector reliability — retries, checkpoints, SLA-oriented status.
 * Schema introspect only; never full-table ETL.
 */
import { query } from './db.js'
import { syncConnection } from './syncConnection.js'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Sync with bounded retries + checkpoint updates.
 */
export async function syncWithRetries(
  workspaceId,
  connectionId,
  { maxAttempts = null, userId = null } = {},
) {
  const { rows } = await query(
    `SELECT sync_retry_max, sync_retry_backoff_sec, sync_attempt
     FROM connections WHERE id = $1 AND workspace_id = $2`,
    [connectionId, workspaceId],
  )
  if (!rows[0]) {
    const err = new Error('connection not found')
    err.status = 404
    throw err
  }
  const max = Math.min(
    8,
    Math.max(
      1,
      Number(maxAttempts ?? rows[0].sync_retry_max) || 3,
    ),
  )
  const backoffSec = Math.min(
    600,
    Math.max(5, Number(rows[0].sync_retry_backoff_sec) || 30),
  )

  let lastErr = null
  const started = Date.now()
  for (let i = 0; i < max; i++) {
    await query(
      `UPDATE connections SET
         sync_attempt = $2,
         sync_checkpoint_json = $3::jsonb,
         updated_at = now()
       WHERE id = $1`,
      [
        connectionId,
        i + 1,
        JSON.stringify({
          phase: 'attempt',
          attempt: i + 1,
          max,
          at: new Date().toISOString(),
        }),
      ],
    )
    try {
      const result = await syncConnection(workspaceId, connectionId, { userId })
      const durationMs = Date.now() - started
      await query(
        `UPDATE connections SET
           sync_attempt = 0,
           last_sync_duration_ms = $2,
           sync_checkpoint_json = $3::jsonb,
           updated_at = now()
         WHERE id = $1`,
        [
          connectionId,
          durationMs,
          JSON.stringify({
            phase: 'done',
            at: new Date().toISOString(),
            durationMs,
          }),
        ],
      )
      return { ...result, attempts: i + 1, durationMs }
    } catch (err) {
      lastErr = err
      const kind = err.healthKind || 'unknown'
      await query(
        `UPDATE connections SET
           sync_checkpoint_json = $2::jsonb,
           updated_at = now()
         WHERE id = $1`,
        [
          connectionId,
          JSON.stringify({
            phase: 'failed',
            attempt: i + 1,
            max,
            kind,
            error: String(err.message || err).slice(0, 500),
            at: new Date().toISOString(),
          }),
        ],
      )
      if (kind === 'auth') break
      if (i < max - 1) {
        await sleep(backoffSec * 1000 * (i + 1))
      }
    }
  }
  throw lastErr
}

/**
 * Workspace connector reliability / SLA snapshot.
 */
export async function getConnectorReliabilityStatus(workspaceId) {
  const { rows } = await query(
    `SELECT id, name, source_type, status, sync_schedule, sync_next_at,
            last_sync_at, last_sync_error_kind, last_sync_error,
            sync_retry_max, sync_retry_backoff_sec, sync_attempt,
            sync_checkpoint_json, last_sync_duration_ms
     FROM connections
     WHERE workspace_id = $1
     ORDER BY name`,
    [workspaceId],
  )

  const connections = rows.map((r) => {
    const lastAt = r.last_sync_at ? new Date(r.last_sync_at).getTime() : null
    const ageHours =
      lastAt != null ? (Date.now() - lastAt) / (3600 * 1000) : null
    let sla = 'ok'
    if (r.status === 'error') sla = 'breached'
    else if (r.sync_schedule !== 'off' && ageHours != null) {
      const budget =
        r.sync_schedule === 'hourly' ? 3 : r.sync_schedule === 'daily' ? 36 : 72
      if (ageHours > budget) sla = 'degraded'
    } else if (!r.last_sync_at && r.sync_schedule !== 'off') {
      sla = 'pending'
    }
    return {
      id: r.id,
      name: r.name,
      type: r.source_type,
      status: r.status,
      syncSchedule: r.sync_schedule || 'off',
      syncNextAt: r.sync_next_at,
      lastSyncAt: r.last_sync_at,
      lastSyncErrorKind: r.last_sync_error_kind,
      lastSyncError: r.last_sync_error
        ? String(r.last_sync_error).slice(0, 200)
        : null,
      retryMax: Number(r.sync_retry_max || 3),
      retryBackoffSec: Number(r.sync_retry_backoff_sec || 30),
      syncAttempt: Number(r.sync_attempt || 0),
      checkpoint:
        r.sync_checkpoint_json && typeof r.sync_checkpoint_json === 'object'
          ? r.sync_checkpoint_json
          : {},
      lastSyncDurationMs:
        r.last_sync_duration_ms != null
          ? Number(r.last_sync_duration_ms)
          : null,
      sla,
      note: 'Schema introspect SLA only — Que does not ETL full tables.',
    }
  })

  const summary = {
    total: connections.length,
    ok: connections.filter((c) => c.sla === 'ok').length,
    degraded: connections.filter((c) => c.sla === 'degraded').length,
    breached: connections.filter((c) => c.sla === 'breached').length,
    pending: connections.filter((c) => c.sla === 'pending').length,
    errorStatus: connections.filter((c) => c.status === 'error').length,
  }

  return {
    summary,
    connections,
    targets: {
      hourlyMaxAgeHours: 3,
      dailyMaxAgeHours: 36,
      note: 'Non-contractual ops targets until MSA countersigns',
    },
  }
}

/**
 * Patch retry policy on a connection.
 */
export async function updateConnectionRetryPolicy(
  workspaceId,
  connectionId,
  { syncRetryMax, syncRetryBackoffSec } = {},
) {
  const max =
    syncRetryMax != null
      ? Math.min(8, Math.max(1, Number(syncRetryMax) || 3))
      : null
  const backoff =
    syncRetryBackoffSec != null
      ? Math.min(600, Math.max(5, Number(syncRetryBackoffSec) || 30))
      : null
  const { rows } = await query(
    `UPDATE connections SET
       sync_retry_max = COALESCE($3, sync_retry_max),
       sync_retry_backoff_sec = COALESCE($4, sync_retry_backoff_sec),
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, sync_retry_max, sync_retry_backoff_sec`,
    [workspaceId, connectionId, max, backoff],
  )
  if (!rows[0]) {
    const err = new Error('connection not found')
    err.status = 404
    throw err
  }
  return {
    id: rows[0].id,
    syncRetryMax: Number(rows[0].sync_retry_max),
    syncRetryBackoffSec: Number(rows[0].sync_retry_backoff_sec),
  }
}
