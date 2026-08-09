/**
 * Production — job status bridge for customer-hosted / private-runner runs.
 * External systems report progress via API key or runner callback.
 */
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'

const STATUSES = new Set([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

function mapRun(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    jobId: row.job_id,
    status: row.status,
    mode: row.mode,
    summary: row.summary,
    executionTarget: row.execution_target || 'que',
    externalRef: row.external_ref || null,
    externalStatus: row.external_status || null,
    trigger: row.trigger || 'manual',
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    logs: Array.isArray(row.logs_json) ? row.logs_json : [],
  }
}

/**
 * Report / update a hosted job run from customer env.
 * Body: { runId?, jobId, status, summary?, externalRef?, logs? }
 */
export async function reportExternalJobStatus(
  workspaceId,
  body = {},
  { actorLabel = 'external' } = {},
) {
  const status = String(body.status || '').toLowerCase()
  if (!STATUSES.has(status)) {
    const err = new Error(
      `status must be one of ${[...STATUSES].join(', ')}`,
    )
    err.status = 400
    throw err
  }
  const jobId = body.jobId
  if (!jobId && !body.runId) {
    const err = new Error('jobId or runId required')
    err.status = 400
    throw err
  }

  let runId = body.runId || null
  if (runId) {
    const { rows } = await query(
      `UPDATE job_runs SET
         status = $3,
         summary = COALESCE($4, summary),
         execution_target = COALESCE($5, execution_target),
         external_ref = COALESCE($6, external_ref),
         external_status = $3,
         finished_at = CASE WHEN $3 IN ('succeeded','failed','cancelled')
                            THEN now() ELSE finished_at END,
         logs_json = CASE WHEN $7::jsonb = '[]'::jsonb THEN logs_json
                          ELSE logs_json || $7::jsonb END
       WHERE workspace_id = $1 AND id = $2
       RETURNING *`,
      [
        workspaceId,
        runId,
        status,
        body.summary != null ? String(body.summary).slice(0, 2000) : null,
        body.executionTarget || 'customer',
        body.externalRef ? String(body.externalRef).slice(0, 200) : null,
        JSON.stringify(Array.isArray(body.logs) ? body.logs : []),
      ],
    )
    if (!rows[0]) {
      const err = new Error('run not found')
      err.status = 404
      throw err
    }
    void recordAuditEvent({
      workspaceId,
      action: 'job.external_status',
      resourceType: 'job_run',
      resourceId: runId,
      summary: `External status → ${status} (${actorLabel})`,
      meta: { jobId: rows[0].job_id, externalRef: body.externalRef },
    })
    return mapRun(rows[0])
  }

  // Create new run row for external execution
  const { randomUUID } = await import('node:crypto')
  runId = randomUUID()
  const { rows: jobRows } = await query(
    `SELECT id FROM jobs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, jobId],
  )
  if (!jobRows[0]) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }
  await query(
    `INSERT INTO job_runs (
       id, workspace_id, job_id, status, scope, mode, logs_json,
       started_at, trigger, attempt, execution_target, external_ref,
       external_status, summary
     ) VALUES (
       $1,$2,$3,$4,'all',$5,$6::jsonb, now(), 'webhook', 1,
       $7,$8,$4,$9
     )`,
    [
      runId,
      workspaceId,
      jobId,
      status,
      body.mode === 'live' ? 'live' : 'dry_run',
      JSON.stringify(Array.isArray(body.logs) ? body.logs : []),
      body.executionTarget || 'customer',
      body.externalRef ? String(body.externalRef).slice(0, 200) : null,
      body.summary != null ? String(body.summary).slice(0, 2000) : null,
    ],
  )
  if (['succeeded', 'failed', 'cancelled'].includes(status)) {
    await query(
      `UPDATE job_runs SET finished_at = now() WHERE id = $1`,
      [runId],
    )
  }
  const { rows } = await query(`SELECT * FROM job_runs WHERE id = $1`, [runId])
  void recordAuditEvent({
    workspaceId,
    action: 'job.external_status',
    resourceType: 'job_run',
    resourceId: runId,
    summary: `External run created → ${status}`,
    meta: { jobId, externalRef: body.externalRef },
  })
  return mapRun(rows[0])
}

export async function listJobRunsWithTarget(workspaceId, jobId, { limit = 30 } = {}) {
  const { rows } = await query(
    `SELECT * FROM job_runs
     WHERE workspace_id = $1 AND job_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [workspaceId, jobId, Math.min(100, Math.max(1, Number(limit) || 30))],
  )
  return rows.map(mapRun)
}
