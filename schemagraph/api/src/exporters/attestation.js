/**
 * Schema-only attestation — attached to every Que export (json/sql/dbt/dbt-pr).
 * Machine-readable stub for CISO / Legal diligence.
 */

/**
 * @param {{
 *   workspaceId: string,
 *   job: object,
 *   joins?: Array<{ id: string }>,
 *   format?: string,
 *   extras?: Record<string, unknown>,
 * }} args
 */
export function buildSchemaOnlyAttestation({
  workspaceId,
  job,
  joins = [],
  format = 'json',
  extras = {},
}) {
  const approvedRelationshipIds = (joins || [])
    .map((j) => j?.id)
    .filter(Boolean)

  return {
    version: 1,
    brand: 'Que',
    policy: 'schema-only',
    claim:
      'Que used schema metadata and capped column samples only; raw warehouse rows are not centralized for model training or chat prompts.',
    guarantees: [
      'No full-table extracts stored for AI training',
      'Chat prompts use schema context packs only',
      'Live validate / dry-run respect hard row caps',
      'Human promote/reject owns join truth',
    ],
    format,
    jobId: job?.id ?? null,
    jobTitle: job?.title ?? null,
    workspaceId,
    schemaSnapshotId:
      job?.schemaSnapshotId || job?.contract?.schemaSnapshotId || null,
    schemaSnapshotLabel: job?.contract?.schemaSnapshotLabel || null,
    contractVersion: job?.contract?.version || null,
    approvedRelationshipIds,
    frozenFromJob:
      Array.isArray(job?.joinsSnapshot) && job.joinsSnapshot.length > 0,
    tables: job?.tables || [],
    sources: job?.sources || [],
    exportedAt: new Date().toISOString(),
    ...extras,
  }
}

/** Stable-ish fingerprint for audit (not a cryptographic seal). */
export function attestationFingerprint(attestation) {
  const core = {
    v: attestation.version,
    policy: attestation.policy,
    jobId: attestation.jobId,
    workspaceId: attestation.workspaceId,
    schemaSnapshotId: attestation.schemaSnapshotId,
    approvedRelationshipIds: [...(attestation.approvedRelationshipIds || [])].sort(),
    exportedAt: attestation.exportedAt,
  }
  return Buffer.from(JSON.stringify(core)).toString('base64url').slice(0, 32)
}
