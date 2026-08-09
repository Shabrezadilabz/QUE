/**
 * Phase 5 — Scoped workspace API keys (service accounts).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { query } from './db.js'

const VALID_SCOPES = new Set([
  'read',
  'write',
  'export',
  'admin',
  'scim',
  'audit',
])

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

function mapKey(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    tokenPrefix: r.token_prefix,
    scopes: Array.isArray(r.scopes_json) ? r.scopes_json : [],
    createdBy: r.created_by,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }
}

export async function listApiKeys(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM workspace_api_keys
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [workspaceId],
  )
  return rows.map(mapKey)
}

export async function createApiKey(workspaceId, body = {}, userId = null) {
  const name = String(body.name || 'api-key').trim().slice(0, 80)
  let scopes = (Array.isArray(body.scopes) ? body.scopes : ['read'])
    .map(String)
    .filter((s) => VALID_SCOPES.has(s))
    .slice(0, 10)
  if (!scopes.length) scopes = ['read']

  const raw = `que_${randomBytes(24).toString('hex')}`
  const id = randomUUID()
  const expiresAt =
    body.expiresInDays && Number(body.expiresInDays) > 0
      ? new Date(
          Date.now() + Number(body.expiresInDays) * 86400000,
        ).toISOString()
      : null

  await query(
    `INSERT INTO workspace_api_keys (
       id, workspace_id, name, token_hash, token_prefix, scopes_json,
       created_by, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
    [
      id,
      workspaceId,
      name,
      hashToken(raw),
      raw.slice(0, 12),
      JSON.stringify(scopes),
      userId,
      expiresAt,
    ],
  )

  return {
    ...(await listApiKeys(workspaceId)).find((k) => k.id === id),
    token: raw,
    note: 'Copy now — token is shown once',
  }
}

export async function revokeApiKey(workspaceId, keyId) {
  const { rowCount } = await query(
    `UPDATE workspace_api_keys SET revoked_at = now()
     WHERE workspace_id = $1 AND id = $2 AND revoked_at IS NULL`,
    [workspaceId, keyId],
  )
  if (!rowCount) {
    const err = new Error('api key not found')
    err.status = 404
    throw err
  }
  return { ok: true }
}

/**
 * Resolve Bearer token as API key. Returns { workspaceId, scopes, keyId } or null.
 */
export async function resolveApiKey(token) {
  if (!token || !String(token).startsWith('que_')) return null
  const { rows } = await query(
    `SELECT id, workspace_id, scopes_json, expires_at, revoked_at
     FROM workspace_api_keys WHERE token_hash = $1`,
    [hashToken(token)],
  )
  const row = rows[0]
  if (!row || row.revoked_at) return null
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return null
  }
  await query(
    `UPDATE workspace_api_keys SET last_used_at = now() WHERE id = $1`,
    [row.id],
  ).catch(() => {})
  return {
    keyId: row.id,
    workspaceId: row.workspace_id,
    scopes: Array.isArray(row.scopes_json) ? row.scopes_json : ['read'],
    isApiKey: true,
  }
}

export function apiKeyHasScope(apiKey, scope) {
  if (!apiKey?.scopes) return false
  if (apiKey.scopes.includes('admin')) return true
  return apiKey.scopes.includes(scope)
}
