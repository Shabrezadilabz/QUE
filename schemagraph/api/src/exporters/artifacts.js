/**
 * Wave 3.3 — signed / tokenized export artifacts for external download.
 * Token is shown once at mint; only SHA-256 hash is stored.
 * Payload is schema/SQL/dbt files + attestation — never warehouse row dumps.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { exportJob } from '../jobs.js'
import { recordAuditEvent } from '../auditLog.js'

const DEFAULT_TTL_HOURS = 72
const MAX_TTL_HOURS = 24 * 30

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

function sha256Json(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
}

function resolveTtlHours(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_TTL_HOURS
  return Math.min(Math.max(Math.round(n), 1), MAX_TTL_HOURS)
}

function filenameFor(format, jobId, fingerprint) {
  const short = String(fingerprint || jobId || 'pack').slice(0, 12)
  if (format === 'sql') return `que-export-${short}.sql.json`
  if (format === 'dbt' || format === 'dbt-pr') return `que-dbt-${short}.json`
  return `que-export-${short}.json`
}

function publicBaseUrl(req) {
  const env = String(process.env.QUE_PUBLIC_API_URL || '').replace(/\/$/, '')
  if (env) return env
  if (req?.protocol && req?.get) {
    return `${req.protocol}://${req.get('host')}`
  }
  return 'http://localhost:8787'
}

function mapArtifact(row, { includePayload = false } = {}) {
  const meta =
    row.meta_json && typeof row.meta_json === 'object' ? row.meta_json : {}
  const out = {
    id: row.id,
    workspaceId: row.workspace_id,
    jobId: row.job_id,
    jobTitle: row.job_title || null,
    exportAuditId: row.export_audit_id || null,
    format: row.format,
    filename: row.filename,
    contentType: row.content_type,
    contentSha256: row.content_sha256,
    expiresAt: row.expires_at
      ? new Date(row.expires_at).toISOString()
      : null,
    revokedAt: row.revoked_at
      ? new Date(row.revoked_at).toISOString()
      : null,
    downloadCount: Number(row.download_count) || 0,
    lastDownloadedAt: row.last_downloaded_at
      ? new Date(row.last_downloaded_at).toISOString()
      : null,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : null,
    actor: row.actor_user_id
      ? {
          id: row.actor_user_id,
          email: row.actor_email || null,
          displayName: row.actor_display_name || null,
        }
      : null,
    active:
      !row.revoked_at &&
      row.expires_at &&
      new Date(row.expires_at).getTime() > Date.now(),
    meta,
  }
  if (includePayload) {
    out.payload =
      row.payload_json && typeof row.payload_json === 'object'
        ? row.payload_json
        : {}
  }
  return out
}

/**
 * Persist an export payload as a downloadable artifact.
 * @returns {{ artifact, token, downloadUrl, downloadPath }}
 */
export async function createExportArtifact({
  workspaceId,
  jobId = null,
  exportAuditId = null,
  actorUserId = null,
  format,
  payload,
  ttlHours = DEFAULT_TTL_HOURS,
  req = null,
  meta = {},
}) {
  if (!payload || typeof payload !== 'object') {
    const err = new Error('artifact payload required')
    err.status = 400
    throw err
  }
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const id = randomUUID()
  const ttl = resolveTtlHours(ttlHours)
  const expiresAt = new Date(Date.now() + ttl * 3600 * 1000)
  const contentSha256 = sha256Json(payload)
  const fingerprint =
    payload.attestationFingerprint ||
    payload.attestation?.signature?.payloadHash ||
    contentSha256.slice(0, 32)
  const filename = filenameFor(format, jobId, fingerprint)
  const contentType = 'application/json; charset=utf-8'

  await query(
    `INSERT INTO export_artifacts (
       id, workspace_id, job_id, export_audit_id, actor_user_id,
       format, filename, content_type, payload_json, content_sha256,
       token_hash, expires_at, meta_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb)`,
    [
      id,
      workspaceId,
      jobId,
      exportAuditId,
      actorUserId,
      String(format || 'json'),
      filename,
      contentType,
      JSON.stringify(payload),
      contentSha256,
      tokenHash,
      expiresAt.toISOString(),
      JSON.stringify({
        ...meta,
        policy: 'schema-only-artifact',
        claim:
          'Tokenized download of attested Que export pack; no warehouse row dumps.',
      }),
    ],
  )

  const downloadPath = `/artifacts/download/${token}`
  const downloadUrl = `${publicBaseUrl(req)}${downloadPath}`

  const { rows } = await query(
    `SELECT a.*, j.title AS job_title,
            u.email AS actor_email, u.display_name AS actor_display_name
     FROM export_artifacts a
     LEFT JOIN jobs j ON j.id = a.job_id
     LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE a.id = $1`,
    [id],
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId,
    action: 'artifact.create',
    resourceType: 'export_artifact',
    resourceId: id,
    summary: `Created signed download for ${format} export`,
    meta: { format, expiresAt: expiresAt.toISOString(), jobId },
  })

  return {
    artifact: mapArtifact(rows[0]),
    token,
    downloadPath,
    downloadUrl,
    expiresAt: expiresAt.toISOString(),
    note: 'Store the download URL now — the raw token is not shown again.',
  }
}

/**
 * Mint artifact by re-running export (or using provided payload).
 */
export async function mintJobArtifact(
  workspaceId,
  jobId,
  options = {},
  req = null,
) {
  const format = ['sql', 'dbt', 'dbt-pr'].includes(options.format)
    ? options.format
    : 'json'
  const result = await exportJob(workspaceId, jobId, format, {
    force: options.force === true,
    actorUserId: options.actorUserId || null,
    githubOwner: options.githubOwner,
    githubRepo: options.githubRepo,
    githubBaseBranch: options.githubBaseBranch,
    branchName: options.branchName,
  })
  if (!result?.export) {
    const err = new Error('job not found or export failed')
    err.status = 404
    throw err
  }

  // Prefer a compact pack for dbt-pr (files + attestation, drop huge PR body noise)
  let payload = result.export
  if (format === 'dbt' || format === 'dbt-pr') {
    payload = {
      format,
      exportedAt: result.export.exportedAt || new Date().toISOString(),
      attestation: result.export.attestation,
      attestationFingerprint: result.export.attestationFingerprint,
      files: result.export.files || [],
      github: result.export.github
        ? {
            opened: result.export.github.opened,
            prUrl: result.export.github.prUrl || null,
          }
        : undefined,
      job: result.export.job
        ? {
            id: result.export.job.id,
            title: result.export.job.title,
            status: result.export.job.status,
          }
        : { id: jobId },
    }
  }

  const minted = await createExportArtifact({
    workspaceId,
    jobId,
    actorUserId: options.actorUserId || null,
    format,
    payload,
    ttlHours: options.ttlHours,
    req,
    meta: { source: 'mint' },
  })

  return {
    ...minted,
    job: result.job,
  }
}

export async function listExportArtifacts(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100)
  const params = [workspaceId]
  let jobSql = ''
  if (opts.jobId) {
    params.push(String(opts.jobId))
    jobSql = ` AND a.job_id = $${params.length}`
  }
  params.push(limit)
  const { rows } = await query(
    `SELECT a.*, j.title AS job_title,
            u.email AS actor_email, u.display_name AS actor_display_name
     FROM export_artifacts a
     LEFT JOIN jobs j ON j.id = a.job_id
     LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE a.workspace_id = $1${jobSql}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => mapArtifact(r))
}

export async function revokeExportArtifact(workspaceId, artifactId) {
  const { rows } = await query(
    `UPDATE export_artifacts
     SET revoked_at = now()
     WHERE workspace_id = $1 AND id = $2 AND revoked_at IS NULL
     RETURNING id, revoked_at`,
    [workspaceId, artifactId],
  )
  if (!rows[0]) {
    const err = new Error('Artifact not found or already revoked')
    err.status = 404
    throw err
  }
  void recordAuditEvent({
    workspaceId,
    action: 'artifact.revoke',
    resourceType: 'export_artifact',
    resourceId: artifactId,
    summary: 'Revoked signed artifact download',
  })
  return {
    id: rows[0].id,
    revokedAt: new Date(rows[0].revoked_at).toISOString(),
  }
}

/**
 * Public download by bearer token (path param). Soft-fails with 404/410.
 */
export async function downloadExportArtifactByToken(token) {
  const tokenHash = hashToken(token)
  const { rows } = await query(
    `SELECT a.*, j.title AS job_title
     FROM export_artifacts a
     LEFT JOIN jobs j ON j.id = a.job_id
     WHERE a.token_hash = $1
     LIMIT 1`,
    [tokenHash],
  )
  const row = rows[0]
  if (!row) {
    const err = new Error('Artifact not found')
    err.status = 404
    err.code = 'ARTIFACT_NOT_FOUND'
    throw err
  }
  if (row.revoked_at) {
    const err = new Error('Artifact download revoked')
    err.status = 410
    err.code = 'ARTIFACT_REVOKED'
    throw err
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    const err = new Error('Artifact download expired')
    err.status = 410
    err.code = 'ARTIFACT_EXPIRED'
    throw err
  }

  await query(
    `UPDATE export_artifacts
     SET download_count = download_count + 1,
         last_downloaded_at = now()
     WHERE id = $1`,
    [row.id],
  )

  return {
    filename: row.filename,
    contentType: row.content_type || 'application/json; charset=utf-8',
    contentSha256: row.content_sha256,
    payload:
      row.payload_json && typeof row.payload_json === 'object'
        ? row.payload_json
        : {},
    artifact: mapArtifact({ ...row, download_count: Number(row.download_count) + 1 }),
  }
}
