/**
 * Wave 4.5 — private runner MVP (HMAC work-order + callback).
 * Not a VPC agent / Docker BYOC image.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'
import { getJob } from './jobs.js'
import { recordAuditEvent } from './auditLog.js'

function mapConfig(row) {
  return {
    enabled: Boolean(row.private_runner_enabled),
    runnerUrl: row.private_runner_url || '',
    secretConfigured: Boolean(row.private_runner_secret),
  }
}

export async function getPrivateRunnerConfig(workspaceId) {
  const { rows } = await query(
    `SELECT private_runner_enabled, private_runner_url, private_runner_secret
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (!rows[0]) {
    const err = new Error('workspace not found')
    err.status = 404
    throw err
  }
  return mapConfig(rows[0])
}

export async function updatePrivateRunnerConfig(workspaceId, patch = {}) {
  const { rows: curRows } = await query(
    `SELECT private_runner_enabled, private_runner_url, private_runner_secret
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (!curRows[0]) {
    const err = new Error('workspace not found')
    err.status = 404
    throw err
  }
  const cur = curRows[0]
  const enabled =
    patch.enabled != null ? Boolean(patch.enabled) : cur.private_runner_enabled
  let url =
    patch.runnerUrl != null || patch.runner_url != null
      ? String(patch.runnerUrl ?? patch.runner_url).trim()
      : cur.private_runner_url || ''
  let secret = cur.private_runner_secret
  let newSecret = null
  if (patch.clearSecret) {
    secret = null
  } else if (patch.rotateSecret || (!secret && url)) {
    secret = randomBytes(24).toString('hex')
    newSecret = secret
  } else if (typeof patch.runnerSecret === 'string' && patch.runnerSecret) {
    secret = String(patch.runnerSecret).trim()
    newSecret = secret
  }
  await query(
    `UPDATE workspaces SET
       private_runner_enabled = $2,
       private_runner_url = $3,
       private_runner_secret = $4
     WHERE id = $1`,
    [workspaceId, enabled, url || null, secret],
  )
  const cfg = await getPrivateRunnerConfig(workspaceId)
  return { ...cfg, runnerSecret: newSecret }
}

function sign(secret, bodyText) {
  return createHmac('sha256', secret).update(bodyText).digest('hex')
}

export function verifyRunnerSignature(secret, bodyText, signatureHeader) {
  if (!secret || !signatureHeader) return false
  const expected = `sha256=${sign(secret, bodyText)}`
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signatureHeader))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Queue a private-runner work order instead of in-process runJob.
 */
export async function enqueuePrivateRunnerJob(workspaceId, jobId, opts = {}) {
  const job = await getJob(workspaceId, jobId)
  if (!job) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }
  const { rows: ws } = await query(
    `SELECT private_runner_enabled, private_runner_url, private_runner_secret
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  const row = ws[0]
  if (!row?.private_runner_enabled || !row.private_runner_url) {
    const err = new Error(
      'Private runner not configured — enable in Settings or set executionTarget=que',
    )
    err.status = 400
    err.code = 'PRIVATE_RUNNER_UNSET'
    throw err
  }

  const runId = randomUUID()
  const mode = opts.mode === 'live' ? 'live' : 'dry_run'
  const logs = [
    {
      ts: new Date().toISOString(),
      level: 'info',
      message: `Queued for private runner · mode=${mode}`,
    },
  ]
  await query(
    `INSERT INTO job_runs (
       id, workspace_id, job_id, status, scope, mode, logs_json,
       started_at, trigger, attempt
     ) VALUES ($1,$2,$3,'queued','all',$4,$5::jsonb, now(), $6, 1)`,
    [
      runId,
      workspaceId,
      jobId,
      mode,
      JSON.stringify(logs),
      opts.trigger || 'manual',
    ],
  )

  const callbackBase =
    process.env.QUE_PUBLIC_URL ||
    process.env.QUE_API_PUBLIC_URL ||
    `http://localhost:${process.env.PORT || 8787}`
  const workOrder = {
    event: 'que.private_runner.work_order',
    schemaVersion: 2,
    agentHint: 'vpc_callback',
    workspaceId,
    jobId,
    runId,
    mode,
    title: job.title,
    sqlText: job.sqlText,
    notebook: job.notebook,
    schemaSnapshotId: job.schemaSnapshotId,
    callbackUrl: `${callbackBase.replace(/\/$/, '')}/runner/callback`,
    heartbeatHint: 'POST callback with status=running to avoid soft timeout',
    ts: new Date().toISOString(),
  }
  const bodyText = JSON.stringify(workOrder)
  const secret = row.private_runner_secret || ''
  const sig = secret ? sign(secret, bodyText) : ''

  async function postWorkOrder() {
    return fetch(row.private_runner_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Que-Signature': sig ? `sha256=${sig}` : '',
        'X-Que-Idempotency-Key': runId,
        'User-Agent': 'Que-Private-Runner/3.0',
      },
      body: bodyText,
      signal: AbortSignal.timeout(15000),
    })
  }

  try {
    let res
    try {
      res = await postWorkOrder()
    } catch (firstErr) {
      // One retry on transient network failure (Phase 3 maturity)
      await new Promise((r) => setTimeout(r, 400))
      try {
        res = await postWorkOrder()
      } catch {
        throw firstErr
      }
    }
    if (!res.ok) {
      await failRun(runId, `Private runner HTTP ${res.status}`)
      const err = new Error(`Private runner rejected work order (${res.status})`)
      err.status = 502
      throw err
    }
  } catch (err) {
    if (err.status === 502) throw err
    await failRun(runId, String(err.message || err))
    const e = new Error(
      `Private runner unreachable: ${String(err.message || err).slice(0, 300)}`,
    )
    e.status = 502
    throw e
  }

  // Soft timeout: mark failed if still queued after N ms (best-effort timer)
  const timeoutMs = Math.min(
    Math.max(Number(process.env.QUE_PRIVATE_RUNNER_TIMEOUT_MS) || 120000, 15000),
    600000,
  )
  setTimeout(() => {
    void query(
      `UPDATE job_runs SET
         status = 'failed',
         summary = COALESCE(summary, 'Private runner timeout'),
         finished_at = now(),
         logs_json = logs_json || $2::jsonb
       WHERE id = $1 AND status IN ('queued', 'running')`,
      [
        runId,
        JSON.stringify([
          {
            ts: new Date().toISOString(),
            level: 'error',
            message: `Timed out waiting for private runner callback (${timeoutMs}ms)`,
          },
        ]),
      ],
    ).catch(() => {})
  }, timeoutMs).unref?.()

  void recordAuditEvent({
    workspaceId,
    action: 'job.private_runner_enqueue',
    resourceType: 'job',
    resourceId: jobId,
    summary: `Enqueued private runner work order`,
    meta: { runId, mode },
  })

  const { rows: runRows } = await query(`SELECT * FROM job_runs WHERE id = $1`, [
    runId,
  ])
  return mapRunLite(runRows[0])
}

async function failRun(runId, message) {
  await query(
    `UPDATE job_runs SET
       status = 'failed',
       summary = $2,
       finished_at = now(),
       logs_json = logs_json || $3::jsonb
     WHERE id = $1`,
    [
      runId,
      message,
      JSON.stringify([
        {
          ts: new Date().toISOString(),
          level: 'error',
          message,
        },
      ]),
    ],
  )
}

function mapRunLite(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    jobId: row.job_id,
    status: row.status,
    scope: row.scope,
    cellId: row.cell_id ?? null,
    mode: row.mode,
    summary: row.summary ?? null,
    logs: Array.isArray(row.logs_json) ? row.logs_json : [],
    output:
      row.output_json && typeof row.output_json === 'object'
        ? row.output_json
        : {},
    trigger: row.trigger || 'manual',
    attempt: row.attempt ?? 1,
    parentRunId: row.parent_run_id ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  }
}

/**
 * Callback from customer runner.
 * Body: { runId, workspaceId, status, summary?, logs?, output? }
 * Auth: X-Que-Signature HMAC of raw body with private_runner_secret
 */
export async function handleRunnerCallback(rawBody, signatureHeader) {
  let body
  try {
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
  } catch {
    const err = new Error('invalid JSON body')
    err.status = 400
    throw err
  }
  const workspaceId = body.workspaceId
  const runId = body.runId
  if (!workspaceId || !runId) {
    const err = new Error('workspaceId and runId required')
    err.status = 400
    throw err
  }
  const { rows: ws } = await query(
    `SELECT private_runner_secret FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (!ws[0]) {
    const err = new Error('workspace not found')
    err.status = 404
    throw err
  }
  const secret = ws[0].private_runner_secret || ''
  const text =
    typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)
  if (secret && !verifyRunnerSignature(secret, text, signatureHeader)) {
    const err = new Error('invalid signature')
    err.status = 401
    throw err
  }
  const status = ['succeeded', 'failed', 'cancelled', 'running'].includes(
    body.status,
  )
    ? body.status
    : 'failed'
  const logs = Array.isArray(body.logs) ? body.logs : []
  const output =
    body.output && typeof body.output === 'object' ? body.output : {}
  const { rows } = await query(
    `UPDATE job_runs SET
       status = $3,
       summary = COALESCE($4, summary),
       logs_json = CASE WHEN $5::jsonb = '[]'::jsonb THEN logs_json
                        ELSE logs_json || $5::jsonb END,
       output_json = CASE WHEN $6::jsonb = '{}'::jsonb THEN output_json
                          ELSE $6::jsonb END,
       finished_at = CASE WHEN $3 IN ('succeeded','failed','cancelled')
                          THEN now() ELSE finished_at END
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [
      runId,
      workspaceId,
      status,
      body.summary != null ? String(body.summary) : null,
      JSON.stringify(logs),
      JSON.stringify(output),
    ],
  )
  if (!rows[0]) {
    const err = new Error('run not found')
    err.status = 404
    throw err
  }
  void recordAuditEvent({
    workspaceId,
    action: 'job.private_runner_callback',
    resourceType: 'job_run',
    resourceId: runId,
    summary: `Private runner callback: ${status}`,
    meta: { jobId: rows[0].job_id, status },
  })
  return mapRunLite(rows[0])
}
