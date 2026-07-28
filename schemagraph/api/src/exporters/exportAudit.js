/**
 * Persist export attestation audit (best-effort if migration applied).
 */
import { query } from '../db.js'
import { attestationFingerprint } from './attestation.js'

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
