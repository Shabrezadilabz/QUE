/**
 * Offer A — warehouse / external run digests (failures + cost hints).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { listJobRunsWithTarget } from './jobStatusBridge.js'
import { recordAuditEvent } from './auditLog.js'

function mapDigest(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    jobId: r.job_id,
    source: r.source,
    summary: r.summary,
    failedCount: Number(r.failed_count || 0),
    succeededCount: Number(r.succeeded_count || 0),
    runs: Array.isArray(r.runs_json) ? r.runs_json : [],
    createdAt: r.created_at,
  }
}

/**
 * Build digest from Que-tracked external/customer runs (+ optional pushed events).
 */
export async function buildWarehouseRunDigest(
  workspaceId,
  { jobId = null, limit = 40 } = {},
) {
  let runs = []
  if (jobId) {
    runs = await listJobRunsWithTarget(workspaceId, jobId, { limit })
  } else {
    const { rows } = await query(
      `SELECT r.*, j.title AS job_title
       FROM job_runs r
       JOIN jobs j ON j.id = r.job_id
       WHERE r.workspace_id = $1
         AND (
           r.execution_target IN ('customer', 'private_runner', 'databricks', 'snowflake')
           OR r.external_status IS NOT NULL
           OR r.trigger = 'webhook'
         )
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [workspaceId, Math.min(100, Math.max(1, Number(limit) || 40))],
    )
    runs = rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      jobTitle: row.job_title,
      status: row.status,
      executionTarget: row.execution_target || 'que',
      externalRef: row.external_ref,
      externalStatus: row.external_status,
      summary: row.summary,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
    }))
  }

  const failed = runs.filter((r) =>
    ['failed', 'cancelled'].includes(String(r.status || '').toLowerCase()),
  )
  const succeeded = runs.filter(
    (r) => String(r.status || '').toLowerCase() === 'succeeded',
  )

  const byTarget = {}
  for (const r of runs) {
    const t = r.executionTarget || 'que'
    byTarget[t] = byTarget[t] || { total: 0, failed: 0 }
    byTarget[t].total += 1
    if (['failed', 'cancelled'].includes(String(r.status || '').toLowerCase())) {
      byTarget[t].failed += 1
    }
  }

  const summary =
    failed.length === 0
      ? `Offer A digest · ${succeeded.length} succeeded · 0 failed (last ${runs.length})`
      : `Offer A digest · ${failed.length} failed / ${runs.length} runs · targets: ${Object.keys(byTarget).join(', ')}`

  const digest = {
    summary,
    failedCount: failed.length,
    succeededCount: succeeded.length,
    byTarget,
    failures: failed.slice(0, 20).map((r) => ({
      runId: r.id,
      jobId: r.jobId,
      jobTitle: r.jobTitle || null,
      status: r.status,
      executionTarget: r.executionTarget,
      externalRef: r.externalRef,
      externalStatus: r.externalStatus,
      summary: r.summary,
      finishedAt: r.finishedAt || r.createdAt,
    })),
    generatedAt: new Date().toISOString(),
  }

  const id = randomUUID()
  await query(
    `INSERT INTO warehouse_run_digests (
       id, workspace_id, job_id, source, summary,
       failed_count, succeeded_count, runs_json
     ) VALUES ($1,$2,$3,'external',$4,$5,$6,$7::jsonb)`,
    [
      id,
      workspaceId,
      jobId,
      summary,
      failed.length,
      succeeded.length,
      JSON.stringify(digest.failures),
    ],
  )

  void recordAuditEvent({
    workspaceId,
    action: 'warehouse.digest',
    resourceType: 'workspace',
    resourceId: workspaceId,
    summary,
    meta: { failed: failed.length, succeeded: succeeded.length },
  })

  return { id, ...digest }
}

export async function listWarehouseDigests(workspaceId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT * FROM warehouse_run_digests
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(50, Math.max(1, Number(limit) || 20))],
  )
  return rows.map(mapDigest)
}

/**
 * Ingest a push digest from customer Databricks/Snowflake automation.
 */
export async function ingestExternalWarehouseDigest(
  workspaceId,
  body = {},
  { userId = null } = {},
) {
  const runs = Array.isArray(body.runs) ? body.runs.slice(0, 100) : []
  const failed = runs.filter((r) =>
    ['failed', 'error', 'cancelled'].includes(
      String(r.status || '').toLowerCase(),
    ),
  )
  const succeeded = runs.filter(
    (r) => String(r.status || '').toLowerCase() === 'succeeded',
  )
  const source = String(body.source || 'databricks').slice(0, 40)
  const summary =
    body.summary ||
    `${source} digest · ${failed.length} failed · ${succeeded.length} succeeded`
  const id = randomUUID()
  await query(
    `INSERT INTO warehouse_run_digests (
       id, workspace_id, job_id, source, summary,
       failed_count, succeeded_count, runs_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      id,
      workspaceId,
      body.jobId || null,
      source,
      String(summary).slice(0, 2000),
      failed.length,
      succeeded.length,
      JSON.stringify(runs),
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'warehouse.digest_ingest',
    resourceType: 'workspace',
    resourceId: workspaceId,
    summary,
  })
  return {
    id,
    summary,
    failedCount: failed.length,
    succeededCount: succeeded.length,
    runs,
  }
}
