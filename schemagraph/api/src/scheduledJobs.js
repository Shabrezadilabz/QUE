/**
 * Wave 4.2 — scheduled job runs + failure retries.
 * In-process ticker (mirror of scheduledSync); single-API-instance assumption.
 * Does not rebuild Airflow — Que dry_run/live only.
 */
import { query } from './db.js'
import { runJob } from './jobRunner.js'
import { recordAuditEvent } from './auditLog.js'

export const JOB_RUN_SCHEDULES = new Set(['off', 'hourly', 'daily'])

/** @param {'off'|'hourly'|'daily'} schedule @param {Date} [from] */
export function computeNextJobRunAt(schedule, from = new Date()) {
  if (schedule === 'hourly') {
    return new Date(from.getTime() + 60 * 60 * 1000)
  }
  if (schedule === 'daily') {
    return new Date(from.getTime() + 24 * 60 * 60 * 1000)
  }
  return null
}

export function scheduledJobsEnabled() {
  const raw = String(process.env.QUE_SCHEDULED_JOBS_ENABLED || 'true')
    .trim()
    .toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no'
}

function tickMs() {
  const n = Number(process.env.QUE_SCHEDULED_JOBS_TICK_MS || 60000)
  return Math.min(Math.max(Number.isFinite(n) ? n : 60000, 15000), 300000)
}

function maxPerTick() {
  const n = Number(process.env.QUE_SCHEDULED_JOBS_MAX_PER_TICK || 2)
  return Math.min(Math.max(Number.isFinite(n) ? n : 2, 1), 10)
}

/**
 * @param {string} workspaceId
 * @param {string} jobId
 * @param {{ runSchedule?: string, runMode?: string, maxRetries?: number, retryDelaySec?: number }} patch
 */
export async function setJobRunSchedule(workspaceId, jobId, patch = {}) {
  const { rows: existing } = await query(
    `SELECT id, run_schedule, run_mode, max_retries, retry_delay_sec
     FROM jobs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, jobId],
  )
  if (!existing[0]) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }
  const cur = existing[0]
  let schedule = cur.run_schedule || 'off'
  if (patch.runSchedule != null || patch.run_schedule != null) {
    schedule = String(patch.runSchedule ?? patch.run_schedule)
    if (!JOB_RUN_SCHEDULES.has(schedule)) {
      const err = new Error("runSchedule must be 'off', 'hourly', or 'daily'")
      err.status = 400
      err.code = 'INVALID_JOB_SCHEDULE'
      throw err
    }
  }
  let runMode = cur.run_mode || 'dry_run'
  if (patch.runMode != null || patch.run_mode != null) {
    runMode = String(patch.runMode ?? patch.run_mode)
    if (runMode !== 'dry_run' && runMode !== 'live') {
      const err = new Error("runMode must be 'dry_run' or 'live'")
      err.status = 400
      throw err
    }
  }
  let maxRetries =
    patch.maxRetries != null
      ? Number(patch.maxRetries)
      : patch.max_retries != null
        ? Number(patch.max_retries)
        : cur.max_retries
  if (!Number.isFinite(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    const err = new Error('maxRetries must be 0–10')
    err.status = 400
    throw err
  }
  let retryDelaySec =
    patch.retryDelaySec != null
      ? Number(patch.retryDelaySec)
      : patch.retry_delay_sec != null
        ? Number(patch.retry_delay_sec)
        : cur.retry_delay_sec
  if (
    !Number.isFinite(retryDelaySec) ||
    retryDelaySec < 5 ||
    retryDelaySec > 3600
  ) {
    const err = new Error('retryDelaySec must be 5–3600')
    err.status = 400
    throw err
  }

  const next = computeNextJobRunAt(schedule)
  const { rows } = await query(
    `UPDATE jobs
     SET run_schedule = $3,
         run_next_at = $4,
         run_mode = $5,
         max_retries = $6,
         retry_delay_sec = $7,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, title, status, run_schedule, run_next_at,
               last_scheduled_run_at, run_mode, max_retries, retry_delay_sec`,
    [workspaceId, jobId, schedule, next, runMode, maxRetries, retryDelaySec],
  )
  return mapScheduleRow(rows[0])
}

function mapScheduleRow(r) {
  if (!r) return null
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    runSchedule: r.run_schedule || 'off',
    runNextAt: r.run_next_at ? new Date(r.run_next_at).toISOString() : null,
    lastScheduledRunAt: r.last_scheduled_run_at
      ? new Date(r.last_scheduled_run_at).toISOString()
      : null,
    runMode: r.run_mode || 'dry_run',
    maxRetries: r.max_retries ?? 2,
    retryDelaySec: r.retry_delay_sec ?? 60,
  }
}

/**
 * @param {string} workspaceId
 */
export async function getWorkspaceJobScheduleStatus(workspaceId) {
  const { rows } = await query(
    `SELECT id, title, status, run_schedule, run_next_at, last_scheduled_run_at,
            run_mode, max_retries, retry_delay_sec
     FROM jobs
     WHERE workspace_id = $1 AND status <> 'archived'
     ORDER BY
       CASE WHEN run_schedule = 'off' THEN 1 ELSE 0 END,
       run_next_at ASC NULLS LAST,
       title`,
    [workspaceId],
  )
  const jobs = rows.map(mapScheduleRow)
  const scheduled = jobs.filter((j) => j.runSchedule !== 'off')
  const due = scheduled.filter(
    (j) => j.runNextAt && Date.parse(j.runNextAt) <= Date.now(),
  )
  return {
    enabled: scheduledJobsEnabled(),
    tickMs: tickMs(),
    note: 'Wave 4.2 — scheduled notebook dry_run/live. Not Airflow; triggers only.',
    summary: {
      total: jobs.length,
      scheduled: scheduled.length,
      due: due.length,
      hourly: scheduled.filter((j) => j.runSchedule === 'hourly').length,
      daily: scheduled.filter((j) => j.runSchedule === 'daily').length,
    },
    jobs,
  }
}

/**
 * @param {{ limit?: number, workspaceId?: string }} [opts]
 */
export async function listDueScheduledJobs(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || maxPerTick(), 1), 20)
  const params = []
  let wsSql = ''
  if (opts.workspaceId) {
    params.push(opts.workspaceId)
    wsSql = ` AND workspace_id = $${params.length}`
  }
  params.push(limit)
  const { rows } = await query(
    `SELECT id, workspace_id, title, run_schedule, run_mode, max_retries,
            retry_delay_sec
     FROM jobs
     WHERE run_schedule IN ('hourly', 'daily')
       AND run_next_at IS NOT NULL
       AND run_next_at <= now()
       AND status <> 'archived'
       ${wsSql}
     ORDER BY run_next_at ASC
     LIMIT $${params.length}`,
    params,
  )
  return rows
}

async function bumpJobScheduleAfterRun(jobId, schedule) {
  const next = computeNextJobRunAt(schedule)
  await query(
    `UPDATE jobs
     SET run_next_at = $2,
         last_scheduled_run_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [jobId, next],
  )
  return { nextAt: next ? next.toISOString() : null }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run job with retries on failure.
 * @param {string} workspaceId
 * @param {string} jobId
 * @param {{ mode?: string, maxRetries?: number, retryDelaySec?: number, trigger?: string, actorUserId?: string|null }} opts
 */
export async function runJobWithRetries(workspaceId, jobId, opts = {}) {
  const maxRetries = Math.min(Math.max(Number(opts.maxRetries) || 0, 0), 10)
  const delaySec = Math.min(Math.max(Number(opts.retryDelaySec) || 60, 5), 3600)
  const mode = opts.mode === 'live' ? 'live' : 'dry_run'
  let attempt = 1
  let parentRunId = null
  let lastRun = null

  while (attempt <= maxRetries + 1) {
    const trigger =
      attempt === 1 ? opts.trigger || 'manual' : 'retry'
    lastRun = await runJob(workspaceId, jobId, {
      mode,
      trigger,
      attempt,
      parentRunId,
    })
    if (lastRun.status === 'succeeded') {
      return { run: lastRun, attempts: attempt, ok: true }
    }
    if (attempt > maxRetries) break
    void recordAuditEvent({
      workspaceId,
      actorUserId: opts.actorUserId || null,
      action: 'job.retry',
      resourceType: 'job',
      resourceId: jobId,
      summary: `Retry attempt ${attempt + 1} after failed run`,
      meta: {
        parentRunId: lastRun.id,
        attempt: attempt + 1,
        previousStatus: lastRun.status,
      },
    })
    parentRunId = lastRun.id
    attempt += 1
    await sleep(delaySec * 1000)
  }
  return { run: lastRun, attempts: attempt, ok: false }
}

/**
 * @param {{ workspaceId?: string, limit?: number, actorUserId?: string|null, force?: boolean }} [opts]
 */
export async function runScheduledJobsTick(opts = {}) {
  if (!scheduledJobsEnabled() && !opts.force) {
    return { ok: true, skipped: true, reason: 'disabled', results: [] }
  }
  const due = await listDueScheduledJobs({
    workspaceId: opts.workspaceId,
    limit: opts.limit,
  })
  const results = []
  for (const row of due) {
    const started = Date.now()
    try {
      const { shouldRouteJobViaWorker, enqueueScheduledJobRun } = await import(
        './warehouseWorker.js'
      )
      const viaWorker = await shouldRouteJobViaWorker(row.workspace_id)
      if (viaWorker) {
        const enq = await enqueueScheduledJobRun(row.workspace_id, row.id, {
          mode: row.run_mode || 'live',
          maxRetries: row.max_retries,
          retryDelaySec: row.retry_delay_sec,
          trigger: 'schedule',
        })
        const bump = await bumpJobScheduleAfterRun(row.id, row.run_schedule)
        void recordAuditEvent({
          workspaceId: row.workspace_id,
          actorUserId: opts.actorUserId || null,
          action: 'job.scheduled_queued',
          resourceType: 'job',
          resourceId: row.id,
          summary: `Scheduled run queued for warehouse worker: ${row.title}`,
          meta: {
            schedule: row.run_schedule,
            queueId: enq.id,
            mode: row.run_mode || 'live',
          },
        })
        results.push({
          jobId: row.id,
          workspaceId: row.workspace_id,
          title: row.title,
          ok: true,
          queued: true,
          queueId: enq.id,
          nextAt: bump.nextAt,
        })
        continue
      }

      const out = await runJobWithRetries(row.workspace_id, row.id, {
        mode: row.run_mode || 'dry_run',
        maxRetries: row.max_retries ?? 2,
        retryDelaySec: row.retry_delay_sec ?? 60,
        trigger: 'schedule',
        actorUserId: opts.actorUserId || null,
      })
      const bump = await bumpJobScheduleAfterRun(row.id, row.run_schedule)
      void recordAuditEvent({
        workspaceId: row.workspace_id,
        actorUserId: opts.actorUserId || null,
        action: out.ok ? 'job.scheduled_run' : 'job.scheduled_run_failed',
        resourceType: 'job',
        resourceId: row.id,
        summary: out.ok
          ? `Scheduled ${row.run_schedule} run: ${row.title}`
          : `Scheduled run failed: ${row.title}`,
        meta: {
          schedule: row.run_schedule,
          runId: out.run?.id,
          attempts: out.attempts,
          status: out.run?.status,
          durationMs: Date.now() - started,
        },
      })
      if (out.run) {
        try {
          const { triggerOrchestrator } = await import('./orchestratorTrigger.js')
          await triggerOrchestrator(row.workspace_id, {
            jobId: row.id,
            runId: out.run.id,
            status: out.run.status,
            title: row.title,
          })
        } catch {
          /* soft-fail */
        }
      }
      results.push({
        jobId: row.id,
        workspaceId: row.workspace_id,
        title: row.title,
        ok: out.ok,
        nextAt: bump.nextAt,
        runId: out.run?.id,
        status: out.run?.status,
        attempts: out.attempts,
      })
    } catch (err) {
      const bump = await bumpJobScheduleAfterRun(row.id, row.run_schedule)
      void recordAuditEvent({
        workspaceId: row.workspace_id,
        actorUserId: opts.actorUserId || null,
        action: 'job.scheduled_run_failed',
        resourceType: 'job',
        resourceId: row.id,
        summary: `Scheduled run crashed: ${row.title}`,
        meta: {
          schedule: row.run_schedule,
          error: String(err.message || err).slice(0, 500),
        },
      })
      results.push({
        jobId: row.id,
        workspaceId: row.workspace_id,
        title: row.title,
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

export function startScheduledJobsLoop() {
  if (_timer) return { started: false, already: true }
  if (!scheduledJobsEnabled()) {
    console.log('[Que] scheduled jobs: OFF (QUE_SCHEDULED_JOBS_ENABLED)')
    return { started: false, enabled: false }
  }
  const ms = tickMs()
  console.log(`[Que] scheduled jobs: ON · tick every ${ms}ms · Wave 4.2`)
  _timer = setInterval(() => {
    if (_running) return
    _running = true
    runScheduledJobsTick()
      .catch((err) => {
        console.warn('[Que] scheduled jobs tick failed:', err.message || err)
      })
      .finally(() => {
        _running = false
      })
  }, ms)
  if (typeof _timer.unref === 'function') _timer.unref()
  return { started: true, tickMs: ms }
}

export function stopScheduledJobsLoop() {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}
