/**
 * Persist export attestation audit (best-effort if migration applied).
 * Wave 2.4 — list / get / verify-pack for diligence download story.
 */
import { query } from '../db.js'
import {
  attestationFingerprint,
  verifyAttestationSignature,
} from './attestation.js'

export async function recordExportAudit({
  workspaceId,
  jobId,
  actorUserId = null,
  format,
  attestation,
  githubOpened = false,
  githubPrUrl = null,
  meta = {},
}) {
  const fingerprint = attestationFingerprint(attestation || {})
  try {
    await query(
      `INSERT INTO export_audit_events (
         workspace_id, job_id, actor_user_id, format,
         attestation_json, fingerprint, github_opened, github_pr_url, meta_json
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb)`,
      [
        workspaceId,
        jobId,
        actorUserId,
        format,
        JSON.stringify(attestation || {}),
        fingerprint,
        Boolean(githubOpened),
        githubPrUrl,
        JSON.stringify(meta || {}),
      ],
    )
  } catch (err) {
    console.warn(
      '[Que] export_audit_events insert skipped:',
      err.message || err,
    )
  }
  return fingerprint
}

function mapExportRow(r, { includeAttestation = false } = {}) {
  const attestation =
    r.attestation_json && typeof r.attestation_json === 'object'
      ? r.attestation_json
      : {}
  const meta =
    r.meta_json && typeof r.meta_json === 'object' ? r.meta_json : {}
  const out = {
    id: r.id,
    workspaceId: r.workspace_id,
    jobId: r.job_id,
    jobTitle: r.job_title || null,
    format: r.format,
    fingerprint: r.fingerprint,
    githubOpened: Boolean(r.github_opened),
    githubPrUrl: r.github_pr_url || null,
    meta,
    createdAt: r.created_at,
    actor: r.actor_user_id
      ? {
          id: r.actor_user_id,
          email: r.actor_email || null,
          displayName: r.actor_display_name || null,
        }
      : null,
    policy: attestation.policy || null,
    signed:
      Boolean(attestation?.signature?.sig) &&
      attestation?.signature?.alg !== 'none',
  }
  if (includeAttestation) out.attestation = attestation
  return out
}

/**
 * @param {string} workspaceId
 * @param {{ jobId?: string, limit?: number }} [opts]
 */
export async function listExportAttestations(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100)
  const params = [workspaceId]
  let jobSql = ''
  if (opts.jobId) {
    params.push(String(opts.jobId))
    jobSql = ` AND e.job_id = $${params.length}`
  }
  params.push(limit)
  const { rows } = await query(
    `SELECT e.id, e.workspace_id, e.job_id, e.actor_user_id, e.format,
            e.attestation_json, e.fingerprint, e.github_opened, e.github_pr_url,
            e.meta_json, e.created_at,
            j.title AS job_title,
            u.email AS actor_email, u.display_name AS actor_display_name
     FROM export_audit_events e
     LEFT JOIN jobs j ON j.id = e.job_id
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.workspace_id = $1${jobSql}
     ORDER BY e.created_at DESC
     LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => mapExportRow(r, { includeAttestation: false }))
}

/**
 * @param {string} workspaceId
 * @param {string} eventId
 */
export async function getExportAttestation(workspaceId, eventId) {
  const { rows } = await query(
    `SELECT e.id, e.workspace_id, e.job_id, e.actor_user_id, e.format,
            e.attestation_json, e.fingerprint, e.github_opened, e.github_pr_url,
            e.meta_json, e.created_at,
            j.title AS job_title,
            u.email AS actor_email, u.display_name AS actor_display_name
     FROM export_audit_events e
     LEFT JOIN jobs j ON j.id = e.job_id
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.workspace_id = $1 AND e.id = $2
     LIMIT 1`,
    [workspaceId, eventId],
  )
  if (!rows[0]) {
    const err = new Error('Export attestation not found')
    err.status = 404
    err.code = 'EXPORT_ATTESTATION_NOT_FOUND'
    throw err
  }
  return mapExportRow(rows[0], { includeAttestation: true })
}

/**
 * Diligence verify pack — attestation + how to re-verify.
 * @param {string} workspaceId
 * @param {string} eventId
 * @param {{ verifyUiUrl?: string, apiBase?: string }} [opts]
 */
export async function buildAttestationVerifyPack(
  workspaceId,
  eventId,
  opts = {},
) {
  const event = await getExportAttestation(workspaceId, eventId)
  const verify = verifyAttestationSignature(event.attestation)
  const apiBase = String(opts.apiBase || '').replace(/\/$/, '')
  const verifyUiUrl =
    opts.verifyUiUrl ||
    process.env.QUE_ATTESTATION_VERIFY_UI_URL ||
    'http://localhost:5174/verify'
  return {
    version: 1,
    brand: 'Que',
    purpose:
      'Schema-only export attestation verify pack for security / diligence review.',
    exportedAt: event.createdAt,
    export: {
      id: event.id,
      workspaceId: event.workspaceId,
      jobId: event.jobId,
      jobTitle: event.jobTitle,
      format: event.format,
      fingerprint: event.fingerprint,
      githubPrUrl: event.githubPrUrl,
      actor: event.actor,
    },
    verify: {
      ok: verify.ok,
      reason: verify.reason || null,
      uiUrl: verifyUiUrl,
      apiPath: 'POST /auth/attestation/verify',
      apiUrl: apiBase
        ? `${apiBase}/auth/attestation/verify`
        : '/auth/attestation/verify',
    },
    instructions: [
      'Open the Que verify page (uiUrl) and paste the attestation object below, or',
      'POST the attestation JSON to POST /auth/attestation/verify (public, no auth).',
      'Expect { "ok": true } when the HMAC signature matches Que’s signing key.',
      'Tampering with claim, joins, snapshot, or signature must yield ok: false.',
    ],
    attestation: event.attestation,
  }
}
