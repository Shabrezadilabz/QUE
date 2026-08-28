/**
 * Phase 5.3 — Que Warehouse Worker queue + orchestrator.
 * Scheduled and manual job runs execute against workspace Que Warehouse via worker pool.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { runJobWithRetries } from './scheduledJobs.js'
import { getWarehouseRegistry } from './queWarehouse.js'

export const QUEUE_KINDS = new Set(['job_run', 'sync', 'studio_refresh'])

export function warehouseWorkerEnabled() {
  const raw = String(process.env.QUE_WAREHOUSE_WORKER_ENABLED || 'true')
    .trim()
    .toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no'
}

export function resolveWorkerId() {
  return (
    process.env.QUE_WORKER_ID ||
    `worker-${process.pid}-${String(process.env.HOSTNAME || 'local').slice(0, 12)}`
  )
}

function clampPriority(n) {
  return Math.min(Math.max(Number(n) || 5, 1), 10)
}

function mapQueueRow(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    payload:
      row.payload_json && typeof row.payload_json === 'object'
        ? row.payload_json
        : {},
    jobId: row.job_id ?? null,
    runId: row.run_id ?? null,
    workerId: row.worker_id ?? null,
    trigger: row.trigger_source || 'manual',
    attempt: row.attempt ?? 0,
    error: row.error_message ?? null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

/**
 * @param {string} workspaceId
 * @param {{ kind?: string, jobId?: string, trigger?: string, priority?: number, payload?: object }} spec
 */
export async function enqueueWarehouseJob(workspaceId, spec = {}) {
  const kind = QUEUE_KINDS.has(spec.kind) ? spec.kind : 'job_run'
  const id = randomUUID()
  const payload =
    spec.payload && typeof spec.payload === 'object' ? spec.payload : {}
  const priority = clampPriority(spec.priority)

  await query(
    `INSERT INTO warehouse_job_queue (
       id, workspace_id, kind, status, priority, payload_json,
       job_id, trigger_source, created_at
     ) VALUES ($1,$2,$3,'queued',$4,$5::jsonb,$6,$7, now())`,
    [
      id,
      workspaceId,
      kind,
      priority,
      JSON.stringify(payload),
      spec.jobId || null,
      spec.trigger || 'manual',
    ],
  )

  return { id, workspaceId, kind, status: 'queued', priority }
}

/** Claim next queued item (SKIP LOCKED for multi-worker safety). */
export async function claimNextQueueItem(wid = resolveWorkerId()) {
  const { rows } = await query(
    `UPDATE warehouse_job_queue
     SET status = 'running',
         worker_id = $1,
         started_at = now(),
         attempt = attempt + 1
     WHERE id = (
       SELECT id FROM warehouse_job_queue
       WHERE status = 'queued'
       ORDER BY priority ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [wid],
  )
  return mapQueueRow(rows[0])
}

async function finishQueueItem(id, fields) {
  await query(
    `UPDATE warehouse_job_queue SET
       status = $2,
       run_id = COALESCE($3, run_id),
       error_message = $4,
       finished_at = now()
     WHERE id = $1`,
    [id, fields.status, fields.runId ?? null, fields.error ?? null],
  )
}

/**
 * Execute one queue item on Que Warehouse.
 * @param {ReturnType<typeof mapQueueRow>} item
 */
export async function processQueueItem(item, opts = {}) {
  if (!item) {
    const err = new Error('queue item required')
    err.status = 400
    throw err
  }

  try {
    if (item.kind === 'job_run') {
      const jobId = item.jobId || item.payload?.jobId
      if (!jobId) {
        throw new Error('job_run queue item missing jobId')
      }

      const reg = await getWarehouseRegistry(item.workspaceId)
      if (!reg) {
        throw new Error('Que Warehouse not provisioned for workspace')
      }

      const mode = item.payload?.mode === 'dry_run' ? 'dry_run' : 'live'
      const out = await runJobWithRetries(item.workspaceId, jobId, {
        mode,
        maxRetries: Number(item.payload?.maxRetries) || 0,
        retryDelaySec: Number(item.payload?.retryDelaySec) || 60,
        trigger: item.payload?.trigger || item.trigger || 'worker',
        actorUserId: item.payload?.actorUserId || null,
      })

      await finishQueueItem(item.id, {
        status: out.ok ? 'succeeded' : 'failed',
        runId: out.run?.id,
        error: out.ok ? null : String(out.run?.summary || 'job run failed').slice(0, 500),
      })

      return { ok: out.ok, runId: out.run?.id, attempts: out.attempts }
    }

    await finishQueueItem(item.id, { status: 'succeeded' })
    return { ok: true, skipped: true, kind: item.kind }
  } catch (err) {
    await finishQueueItem(item.id, {
      status: 'failed',
      error: String(err.message || err).slice(0, 500),
    })
    throw err
  }
}

/**
 * @param {string} workspaceId
 * @param {{ limit?: number, status?: string }} [opts]
 */
export async function listQueueItems(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const params = [workspaceId, limit]
  let sql = `SELECT * FROM warehouse_job_queue
     WHERE workspace_id = $1`
  if (opts.status) {
    sql += ` AND status = $3`
    params.push(String(opts.status))
  }
  sql += ` ORDER BY created_at DESC LIMIT $2`

  const { rows } = await query(sql, params)
  return rows.map(mapQueueRow)
}

export async function getWorkerPoolStatus(workspaceId) {
  const { rows } = await query(
    `SELECT status, count(*)::int AS n
     FROM warehouse_job_queue
     WHERE workspace_id = $1
       AND created_at > now() - interval '7 days'
     GROUP BY status`,
    [workspaceId],
  )
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]))
  const reg = await getWarehouseRegistry(workspaceId)

  return {
    enabled: warehouseWorkerEnabled(),
    workerId: resolveWorkerId(),
    warehouseProvisioned: Boolean(reg),
    schemaName: reg?.schemaName || null,
    queue: byStatus,
    queued: byStatus.queued || 0,
    running: byStatus.running || 0,
    succeeded7d: byStatus.succeeded || 0,
    failed7d: byStatus.failed || 0,
  }
}

/** Global queue rollup for /health (all workspaces, 7d). */
export async function getGlobalWorkerQueueStats() {
  const { rows } = await query(
    `SELECT status, count(*)::int AS n
     FROM warehouse_job_queue
     WHERE created_at > now() - interval '7 days'
     GROUP BY status`,
  ).catch(() => ({ rows: [] }))
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]))
  return {
    enabled: warehouseWorkerEnabled(),
    workerId: resolveWorkerId(),
    queued: byStatus.queued || 0,
    running: byStatus.running || 0,
    succeeded7d: byStatus.succeeded || 0,
    failed7d: byStatus.failed || 0,
  }
}

export async function enqueueScheduledJobRun(workspaceId, jobId, opts = {}) {
  return enqueueWarehouseJob(workspaceId, {
    kind: 'job_run',
    jobId,
    trigger: opts.trigger || 'schedule',
    priority: 3,
    payload: {
      jobId,
      mode: opts.mode === 'dry_run' ? 'dry_run' : 'live',
      maxRetries: opts.maxRetries ?? 0,
      retryDelaySec: opts.retryDelaySec ?? 60,
      trigger: opts.trigger || 'schedule',
    },
  })
}

/** Whether scheduled jobs should route through warehouse queue. */
export async function shouldRouteJobViaWorker(workspaceId) {
  if (!warehouseWorkerEnabled()) return false
  const reg = await getWarehouseRegistry(workspaceId)
  return Boolean(reg)
}

/**
 * @param {{ limit?: number, workerId?: string, force?: boolean }} [opts]
 */
export async function runWorkerTick(opts = {}) {
  if (!warehouseWorkerEnabled() && !opts.force) {
    return { ok: true, skipped: true, reason: 'disabled', processed: 0, results: [] }
  }

  const max = Math.min(Math.max(Number(opts.limit) || 2, 1), 10)
  const wid = opts.workerId || resolveWorkerId()
  const results = []

  for (let i = 0; i < max; i++) {
    const item = await claimNextQueueItem(wid)
    if (!item) break
    try {
      const out = await processQueueItem(item, { workerId: wid })
      results.push({ queueId: item.id, workspaceId: item.workspaceId, ok: true, ...out })
    } catch (err) {
      results.push({
        queueId: item.id,
        workspaceId: item.workspaceId,
        ok: false,
        error: String(err.message || err),
      })
    }
  }

  return { ok: true, processed: results.length, results }
}

let _timer = null
let _running = false

export function startWarehouseWorkerLoop() {
  if (_timer) return { started: false, already: true }
  if (!warehouseWorkerEnabled()) {
    console.log('[Que] warehouse worker: OFF (QUE_WAREHOUSE_WORKER_ENABLED)')
    return { started: false, enabled: false }
  }
  const ms = Math.min(
    Math.max(Number(process.env.QUE_WAREHOUSE_WORKER_TICK_MS) || 5000, 2000),
    60000,
  )
  console.log(`[Que] warehouse worker: ON · tick every ${ms}ms · Phase 5.3`)
  _timer = setInterval(() => {
    if (_running) return
    _running = true
    runWorkerTick()
      .catch((err) => {
        console.warn('[Que] warehouse worker tick failed:', err.message || err)
      })
      .finally(() => {
        _running = false
      })
  }, ms)
  return { started: true, tickMs: ms }
}
