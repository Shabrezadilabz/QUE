/**
 * Wave 2.5 — scheduled schema sync (introspect only).
 * In-process ticker; soft-fail per connection; never full-table ETL.
 */
import { query } from './db.js'
import { syncWithRetries } from './connectorReliability.js'
import { recordAuditEvent } from './auditLog.js'
import { noteSourceLandingAfterSync } from './planeQuery.js'

export const SYNC_SCHEDULES = new Set(['off', 'hourly', 'daily'])

const SYNCABLE = new Set([
  'postgresql',
  'excel',
  'csv',
  'mongodb',
  'databricks',
  'snowflake',
  'bigquery',
  'salesforce',
])

/** @param {'off'|'hourly'|'daily'} schedule @param {Date} [from] */
export function computeNextSyncAt(schedule, from = new Date()) {
  if (schedule === 'hourly') {
    return new Date(from.getTime() + 60 * 60 * 1000)
  }
  if (schedule === 'daily') {
    return new Date(from.getTime() + 24 * 60 * 60 * 1000)
  }
  return null
}

export function scheduledSyncEnabled() {
  const raw = String(process.env.QUE_SCHEDULED_SYNC_ENABLED || 'true')
    .trim()
    .toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no'
}

function tickMs() {
  const n = Number(process.env.QUE_SCHEDULED_SYNC_TICK_MS || 60000)
  return Math.min(Math.max(Number.isFinite(n) ? n : 60000, 15000), 300000)
}

function maxPerTick() {
  const n = Number(process.env.QUE_SCHEDULED_SYNC_MAX_PER_TICK || 3)
  return Math.min(Math.max(Number.isFinite(n) ? n : 3, 1), 10)
}

/**
 * @param {string} workspaceId
 * @param {string} connectionId
 * @param {'off'|'hourly'|'daily'} schedule
 */
export async function setConnectionSyncSchedule(
  workspaceId,
  connectionId,
  schedule,
) {
  const s = String(schedule || 'off')
  if (!SYNC_SCHEDULES.has(s)) {
    const err = new Error("syncSchedule must be 'off', 'hourly', or 'daily'")
    err.status = 400
    err.code = 'INVALID_SYNC_SCHEDULE'
    throw err
  }
  const next = computeNextSyncAt(s)
  const { rows } = await query(
    `UPDATE connections
     SET sync_schedule = $3,
         sync_next_at = $4,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, sync_schedule, sync_next_at, last_scheduled_sync_at,
               last_sync_at, name, source_type`,
    [workspaceId, connectionId, s, next],
  )
  if (!rows[0]) {
    const err = new Error('connection not found')
    err.status = 404
    throw err
  }
  const r = rows[0]
  return {
    id: r.id,
    name: r.name,
    syncSchedule: r.sync_schedule,
    syncNextAt: r.sync_next_at
      ? new Date(r.sync_next_at).toISOString()
      : null,
    lastScheduledSyncAt: r.last_scheduled_sync_at
      ? new Date(r.last_scheduled_sync_at).toISOString()
      : null,
    lastSyncAt: r.last_sync_at
      ? new Date(r.last_sync_at).toISOString()
      : null,
  }
}

/**
 * Workspace schedule overview for Settings / Sources.
 * @param {string} workspaceId
 */
export async function getWorkspaceSyncScheduleStatus(workspaceId) {
  const { rows } = await query(
    `SELECT id, name, source_type, status, sync_schedule, sync_next_at,
            last_scheduled_sync_at, last_sync_at, last_sync_error_kind,
            sync_retry_max, sync_attempt, last_sync_duration_ms,
            sync_checkpoint_json
     FROM connections
     WHERE workspace_id = $1
     ORDER BY
       CASE WHEN sync_schedule = 'off' THEN 1 ELSE 0 END,
       sync_next_at ASC NULLS LAST,
       name`,
    [workspaceId],
  )
  const connections = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.source_type,
    status: r.status,
    syncSchedule: r.sync_schedule || 'off',
    syncNextAt: r.sync_next_at
      ? new Date(r.sync_next_at).toISOString()
      : null,
    lastScheduledSyncAt: r.last_scheduled_sync_at
      ? new Date(r.last_scheduled_sync_at).toISOString()
      : null,
    lastSyncAt: r.last_sync_at
      ? new Date(r.last_sync_at).toISOString()
      : null,
    lastSyncErrorKind: r.last_sync_error_kind || null,
    syncRetryMax: Number(r.sync_retry_max || 3),
    syncAttempt: Number(r.sync_attempt || 0),
    lastSyncDurationMs:
      r.last_sync_duration_ms != null
        ? Number(r.last_sync_duration_ms)
        : null,
    checkpoint:
      r.sync_checkpoint_json && typeof r.sync_checkpoint_json === 'object'
        ? r.sync_checkpoint_json
        : {},
    syncable: SYNCABLE.has(r.source_type),
  }))
  const scheduled = connections.filter((c) => c.syncSchedule !== 'off')
  const due = scheduled.filter(
    (c) => c.syncNextAt && Date.parse(c.syncNextAt) <= Date.now(),
  )
  return {
    enabled: scheduledSyncEnabled(),
    tickMs: tickMs(),
    note: 'Schema introspect only — Que does not run full-table ETL on a schedule.',
    summary: {
      total: connections.length,
      scheduled: scheduled.length,
      due: due.length,
      hourly: scheduled.filter((c) => c.syncSchedule === 'hourly').length,
      daily: scheduled.filter((c) => c.syncSchedule === 'daily').length,
    },
    connections,
  }
}

/**
 * Connections whose sync_next_at is due.
 * @param {{ limit?: number, workspaceId?: string }} [opts]
 */
export async function listDueScheduledSyncs(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || maxPerTick(), 1), 20)
  const params = []
  let wsSql = ''
  if (opts.workspaceId) {
    params.push(opts.workspaceId)
    wsSql = ` AND workspace_id = $${params.length}`
  }
  params.push(limit)
  const { rows } = await query(
    `SELECT id, workspace_id, name, source_type, sync_schedule,
            last_sync_error_kind
     FROM connections
     WHERE sync_schedule IN ('hourly', 'daily')
       AND sync_next_at IS NOT NULL
       AND sync_next_at <= now()
       AND COALESCE(last_sync_error_kind, '') <> 'auth'
       ${wsSql}
     ORDER BY sync_next_at ASC
     LIMIT $${params.length}`,
    params,
  )
  return rows.filter((r) => SYNCABLE.has(r.source_type))
}

/**
 * Advance next run even on failure so we don't tight-loop.
 */
async function bumpScheduleAfterRun(connectionId, schedule, ok) {
  const next = computeNextSyncAt(schedule)
  await query(
    `UPDATE connections
     SET sync_next_at = $2,
         last_scheduled_sync_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [connectionId, next],
  )
  return { ok, nextAt: next ? next.toISOString() : null }
}

/**
 * Run one scheduler tick (global or workspace-scoped).
 * @param {{ workspaceId?: string, limit?: number, actorUserId?: string|null }} [opts]
 */
export async function runScheduledSyncTick(opts = {}) {
  if (!scheduledSyncEnabled() && !opts.force) {
    return { ok: true, skipped: true, reason: 'disabled', results: [] }
  }
  const due = await listDueScheduledSyncs({
    workspaceId: opts.workspaceId,
    limit: opts.limit,
  })
  const results = []
  for (const row of due) {
    const started = Date.now()
    try {
      const sync = await syncWithRetries(row.workspace_id, row.id)
      const bump = await bumpScheduleAfterRun(row.id, row.sync_schedule, true)
      void recordAuditEvent({
        workspaceId: row.workspace_id,
        actorUserId: opts.actorUserId || null,
        action: 'connection.scheduled_sync',
        resourceType: 'connection',
        resourceId: row.id,
        summary: `Scheduled ${row.sync_schedule} sync: ${row.name}`,
        meta: {
          schedule: row.sync_schedule,
          tablesSynced: sync?.tablesSynced,
          attempts: sync?.attempts,
          durationMs: Date.now() - started,
        },
      })
      try {
        await noteSourceLandingAfterSync(row.workspace_id, row.id, null)
      } catch (landErr) {
        console.warn('[Que] scheduled sync landing:', landErr.message || landErr)
      }
      results.push({
        connectionId: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        ok: true,
        nextAt: bump.nextAt,
        tablesSynced: sync?.tablesSynced,
        attempts: sync?.attempts,
      })
    } catch (err) {
      const bump = await bumpScheduleAfterRun(row.id, row.sync_schedule, false)
      void recordAuditEvent({
        workspaceId: row.workspace_id,
        actorUserId: opts.actorUserId || null,
        action: 'connection.scheduled_sync_failed',
        resourceType: 'connection',
        resourceId: row.id,
        summary: `Scheduled sync failed: ${row.name}`,
        meta: {
          schedule: row.sync_schedule,
          error: String(err.message || err).slice(0, 500),
          healthKind: err.healthKind || null,
        },
      })
      results.push({
        connectionId: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        ok: false,
        nextAt: bump.nextAt,
        error: String(err.message || err).slice(0, 500),
      })
    }
  }
  return {
    ok: true,
    skipped: false,
    due: due.length,
    ran: results.length,
    results,
  }
}

let _timer = null
let _running = false

/** Start in-process ticker (idempotent). */
export function startScheduledSyncLoop() {
  if (_timer) return { started: false, already: true }
  if (!scheduledSyncEnabled()) {
    console.log('[Que] scheduled sync: OFF (QUE_SCHEDULED_SYNC_ENABLED)')
    return { started: false, enabled: false }
  }
  const ms = tickMs()
  console.log(
    `[Que] scheduled sync: ON · tick every ${ms}ms · schema introspect only`,
  )
  _timer = setInterval(() => {
    if (_running) return
    _running = true
    runScheduledSyncTick()
      .catch((err) => {
        console.warn('[Que] scheduled sync tick failed:', err.message || err)
      })
      .finally(() => {
        _running = false
      })
  }, ms)
  if (typeof _timer.unref === 'function') _timer.unref()
  return { started: true, tickMs: ms }
}

export function stopScheduledSyncLoop() {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}
