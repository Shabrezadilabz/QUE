/**
 * Schema-only attestation — attached to every Que export (json/sql/dbt/dbt-pr).
 * Cryptographically signed (HMAC-SHA256) for audit / diligence.
 */
import {
  attestationFingerprint,
  signAttestation,
  verifyAttestationSignature,
  payloadHash,
} from './attestationCrypto.js'

export {
  attestationFingerprint,
  signAttestation,
  verifyAttestationSignature,
  payloadHash,
}

/**
 * @param {{
 *   workspaceId: string,
 *   job: object,
 *   joins?: Array<{ id: string }>,
 *   format?: string,
 *   extras?: Record<string, unknown>,
 *   sign?: boolean,
 * }} args
 */
export function buildSchemaOnlyAttestation({
  workspaceId,
  job,
  joins = [],
  format = 'json',
  extras = {},
  sign = true,
}) {
  const approvedRelationshipIds = (joins || [])
    .map((j) => j?.id)
    .filter(Boolean)

  const base = {
    version: 2,
    brand: 'Que',
    policy: 'schema-only',
    claim:
      'Que used schema metadata and capped column samples only; raw warehouse rows are not centralized for model training or chat prompts.',
    guarantees: [
      'No full-table extracts stored for AI training',
      'Chat prompts use schema context packs only',
      'Live validate / dry-run respect hard row caps',
      'Human promote/reject owns join truth',
      'Export attestation is HMAC-signed for non-repudiation (MVP)',
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

  if (!sign) return base
  try {
    return signAttestation(base)
  } catch (err) {
    // Dev without keys: return unsigned but mark status
    return {
      ...base,
      signature: {
        alg: 'none',
        error: String(err.message || err),
        signedAt: null,
      },
    }
  }
}
