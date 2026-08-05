/**
 * Wave 4.3 — Airflow / Dagster / generic orchestrator trigger (webhook only).
 * Soft-fail: never block Que run completion.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'

const KINDS = new Set(['generic', 'airflow', 'dagster'])

function mapConfig(row) {
  return {
    enabled: Boolean(row.orchestrator_enabled),
    kind: row.orchestrator_kind || 'generic',
    webhookUrl: row.orchestrator_webhook_url || '',
    secretConfigured: Boolean(row.orchestrator_webhook_secret),
  }
}

export async function getOrchestratorConfig(workspaceId) {
  const { rows } = await query(
    `SELECT orchestrator_enabled, orchestrator_kind, orchestrator_webhook_url,
            orchestrator_webhook_secret
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

/**
 * @param {string} workspaceId
 * @param {{ enabled?: boolean, kind?: string, webhookUrl?: string, rotateSecret?: boolean, clearSecret?: boolean }} patch
 */
export async function updateOrchestratorConfig(workspaceId, patch = {}) {
  const { rows: curRows } = await query(
    `SELECT orchestrator_enabled, orchestrator_kind, orchestrator_webhook_url,
            orchestrator_webhook_secret
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (!curRows[0]) {
    const err = new Error('workspace not found')
    err.status = 404
    throw err
  }
  const cur = curRows[0]
  let enabled =
    patch.enabled != null ? Boolean(patch.enabled) : cur.orchestrator_enabled
  let kind = cur.orchestrator_kind || 'generic'
  if (patch.kind != null) {
    kind = String(patch.kind)
    if (!KINDS.has(kind)) {
      const err = new Error("kind must be 'generic', 'airflow', or 'dagster'")
      err.status = 400
      throw err
    }
  }
  let url =
    patch.webhookUrl != null || patch.webhook_url != null
      ? String(patch.webhookUrl ?? patch.webhook_url).trim()
      : cur.orchestrator_webhook_url || ''
  let secret = cur.orchestrator_webhook_secret
  let newSecret = null
  if (patch.clearSecret) {
    secret = null
  } else if (patch.rotateSecret || (!secret && url)) {
    secret = randomBytes(24).toString('hex')
    newSecret = secret
  } else if (typeof patch.webhookSecret === 'string' && patch.webhookSecret) {
    secret = String(patch.webhookSecret).trim()
    newSecret = secret
  }

  await query(
    `UPDATE workspaces SET
       orchestrator_enabled = $2,
       orchestrator_kind = $3,
       orchestrator_webhook_url = $4,
       orchestrator_webhook_secret = $5
     WHERE id = $1`,
    [workspaceId, enabled, kind, url || null, secret],
  )
  const cfg = await getOrchestratorConfig(workspaceId)
  return { ...cfg, webhookSecret: newSecret }
}

function signBody(secret, bodyText) {
  return createHmac('sha256', secret).update(bodyText).digest('hex')
}

/**
 * Fire orchestrator webhook after a Que run (soft-fail).
 * @param {string} workspaceId
 * @param {{ jobId: string, runId: string, status: string, title?: string, schemaSnapshotId?: string|null, sqlText?: string|null }} payload
 */
export async function triggerOrchestrator(workspaceId, payload) {
  const { rows } = await query(
    `SELECT orchestrator_enabled, orchestrator_kind, orchestrator_webhook_url,
            orchestrator_webhook_secret
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  const row = rows[0]
  if (!row?.orchestrator_enabled || !row.orchestrator_webhook_url) {
    return { skipped: true, reason: 'disabled_or_unset' }
  }
  const ts = new Date().toISOString()
  const body = {
    event: 'que.job.run',
    workspaceId,
    jobId: payload.jobId,
    runId: payload.runId,
    status: payload.status,
    title: payload.title || null,
    frozenContractId: payload.schemaSnapshotId || null,
    sqlArtifactRef: payload.sqlText
      ? { kind: 'inline_preview', chars: String(payload.sqlText).length }
      : null,
    kind: row.orchestrator_kind || 'generic',
    ts,
  }
  const bodyText = JSON.stringify(body)
  const secret = row.orchestrator_webhook_secret || ''
  const sig = secret ? signBody(secret, bodyText) : ''
  try {
    const res = await fetch(row.orchestrator_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Que-Signature': sig ? `sha256=${sig}` : '',
        'X-Que-Timestamp': ts,
        'User-Agent': 'Que-Orchestrator-Trigger/4.3',
      },
      body: bodyText,
      signal: AbortSignal.timeout(12000),
    })
    void recordAuditEvent({
      workspaceId,
      action: 'orchestrator.trigger',
      resourceType: 'job',
      resourceId: payload.jobId,
      summary: `Orchestrator webhook ${res.ok ? 'ok' : 'HTTP ' + res.status}`,
      meta: {
        runId: payload.runId,
        httpStatus: res.status,
        kind: row.orchestrator_kind,
      },
    })
    return { ok: res.ok, status: res.status, skipped: false }
  } catch (err) {
    void recordAuditEvent({
      workspaceId,
      action: 'orchestrator.trigger_failed',
      resourceType: 'job',
      resourceId: payload.jobId,
      summary: `Orchestrator webhook soft-fail: ${String(err.message || err).slice(0, 200)}`,
      meta: { runId: payload.runId },
    })
    return {
      ok: false,
      skipped: false,
      error: String(err.message || err).slice(0, 500),
    }
  }
}

export async function testOrchestratorPing(workspaceId) {
  return triggerOrchestrator(workspaceId, {
    jobId: '00000000-0000-0000-0000-000000000000',
    runId: '00000000-0000-0000-0000-000000000001',
    status: 'test',
    title: 'Que orchestrator test ping',
  })
}

/** Verify inbound HMAC (for future callbacks / docs). */
export function verifyQueSignature(secret, bodyText, signatureHeader) {
  if (!secret || !signatureHeader) return false
  const expected = `sha256=${signBody(secret, bodyText)}`
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signatureHeader))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
