/**
 * Phase 5 — Customer-managed key (CMK) envelope for workspace secrets.
 * Platform key wraps a workspace DEK; secrets can be re-encrypted under DEK.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { query } from './db.js'
import { encryptBlob, decryptBlob } from './secrets.js'

function platformKek() {
  const raw = String(
    process.env.QUE_SECRETS_KEY || process.env.STITCH_SECRETS_KEY || '',
  ).trim()
  if (!raw) {
    return createHash('sha256').update('que-local-dev-cmk-kek').digest()
  }
  return createHash('sha256').update(`cmk-kek:${raw}`).digest()
}

function wrapDek(dekBuf) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', platformKek(), iv)
  const enc = Buffer.concat([cipher.update(dekBuf), cipher.final()])
  const tag = cipher.getAuthTag()
  return `cmk1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

function unwrapDek(wrapped) {
  const parts = String(wrapped || '').split(':')
  if (parts[0] !== 'cmk1' || parts.length !== 4) {
    throw new Error('invalid wrapped DEK')
  }
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const data = Buffer.from(parts[3], 'base64')
  const decipher = createDecipheriv('aes-256-gcm', platformKek(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

export async function getCmkStatus(workspaceId) {
  const { rows } = await query(
    `SELECT enabled, key_id, algorithm, rotated_at, created_at, updated_at,
            (wrapped_dek IS NOT NULL) AS has_dek
     FROM workspace_cmk WHERE workspace_id = $1`,
    [workspaceId],
  )
  if (!rows[0]) {
    return {
      enabled: false,
      keyId: null,
      algorithm: 'aes-256-gcm',
      hasDek: false,
      rotatedAt: null,
    }
  }
  const r = rows[0]
  return {
    enabled: Boolean(r.enabled),
    keyId: r.key_id || null,
    algorithm: r.algorithm,
    hasDek: Boolean(r.has_dek),
    rotatedAt: r.rotated_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * Enable CMK: generate workspace DEK, wrap with platform KEK.
 * Optional customerKeyMaterial is hashed into key_id for audit (not stored raw).
 */
export async function enableCmk(workspaceId, body = {}) {
  const customerHint = String(body.customerKeyId || body.keyId || '').trim()
  const keyId =
    customerHint ||
    `que-cmk-${randomUUID().slice(0, 8)}`
  const dek = randomBytes(32)
  const wrapped = wrapDek(dek)

  await query(
    `INSERT INTO workspace_cmk (
       workspace_id, enabled, key_id, wrapped_dek, algorithm, rotated_at, updated_at
     ) VALUES ($1, true, $2, $3, 'aes-256-gcm', now(), now())
     ON CONFLICT (workspace_id) DO UPDATE SET
       enabled = true,
       key_id = EXCLUDED.key_id,
       wrapped_dek = EXCLUDED.wrapped_dek,
       rotated_at = now(),
       updated_at = now()`,
    [workspaceId, keyId, wrapped],
  )

  return getCmkStatus(workspaceId)
}

export async function disableCmk(workspaceId) {
  await query(
    `UPDATE workspace_cmk SET enabled = false, updated_at = now()
     WHERE workspace_id = $1`,
    [workspaceId],
  )
  return getCmkStatus(workspaceId)
}

export async function rotateCmk(workspaceId) {
  const status = await getCmkStatus(workspaceId)
  if (!status.enabled) {
    const err = new Error('CMK not enabled')
    err.status = 400
    throw err
  }
  return enableCmk(workspaceId, { keyId: `${status.keyId}-r${Date.now()}` })
}

/**
 * Encrypt plaintext under workspace DEK when CMK enabled; else platform blob.
 */
export async function encryptWithCmk(workspaceId, plaintext) {
  const { rows } = await query(
    `SELECT enabled, wrapped_dek FROM workspace_cmk WHERE workspace_id = $1`,
    [workspaceId],
  )
  if (!rows[0]?.enabled || !rows[0].wrapped_dek) {
    return encryptBlob(plaintext)
  }
  const dek = unwrapDek(rows[0].wrapped_dek)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', dek, iv)
  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `cmkv:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export async function decryptWithCmk(workspaceId, blob) {
  if (String(blob || '').startsWith('cmkv:')) {
    const { rows } = await query(
      `SELECT wrapped_dek FROM workspace_cmk WHERE workspace_id = $1`,
      [workspaceId],
    )
    if (!rows[0]?.wrapped_dek) throw new Error('CMK DEK missing')
    const dek = unwrapDek(rows[0].wrapped_dek)
    const parts = String(blob).split(':')
    const iv = Buffer.from(parts[1], 'base64')
    const tag = Buffer.from(parts[2], 'base64')
    const data = Buffer.from(parts[3], 'base64')
    const decipher = createDecipheriv('aes-256-gcm', dek, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    )
  }
  return decryptBlob(blob)
}
