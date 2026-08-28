/**
 * Phase 5 — SCIM 2.0 Users subset (Okta/Entra/Google directory sync).
 * Auth: Bearer workspace SCIM token.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { query } from './db.js'
import { hashPassword } from './auth.js'

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

/** Parse SCIM filter subset for smoke tests and listUsers. */
export function parseScimFilter(filter) {
  if (!filter) return null
  const m = /userName eq "([^"]+)"/i.exec(String(filter))
  if (!m) return null
  return { field: 'userName', value: m[1].toLowerCase() }
}

/** Normalize SCIM role to workspace member role. */
export function normalizeScimMemberRole(role) {
  const r = String(role || 'member').toLowerCase()
  return ['viewer', 'member', 'admin'].includes(r) ? r : 'member'
}

/**
 * Idempotent provision plan — same email twice should upsert, not duplicate.
 * @returns {{ action: 'create_user'|'reuse_user'|'upsert_member', email: string, role: string, active: boolean }}
 */
export function planScimIdempotentProvision({
  email,
  existingUserId = null,
  active = true,
  role = 'member',
}) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase()
  return {
    action: existingUserId ? 'reuse_user' : 'create_user',
    email: normalized,
    role: normalizeScimMemberRole(role),
    active: active !== false,
    memberAction: active !== false ? 'upsert_member' : 'remove_member',
  }
}

export async function createScimToken(workspaceId, userId = null, name = 'scim') {
  const raw = `scim_${randomBytes(24).toString('hex')}`
  const id = randomUUID()
  await query(
    `INSERT INTO workspace_scim_tokens (
       id, workspace_id, name, token_hash, token_prefix, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, workspaceId, name, hashToken(raw), raw.slice(0, 12), userId],
  )
  return {
    id,
    name,
    token: raw,
    tokenPrefix: raw.slice(0, 12),
    note: 'Copy now — SCIM bearer shown once. Base URL: /scim/v2',
  }
}

export async function listScimTokens(workspaceId) {
  const { rows } = await query(
    `SELECT id, name, token_prefix, created_at, revoked_at
     FROM workspace_scim_tokens
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    tokenPrefix: r.token_prefix,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }))
}

export async function revokeScimToken(workspaceId, tokenId) {
  await query(
    `UPDATE workspace_scim_tokens SET revoked_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, tokenId],
  )
  return { ok: true }
}

export async function resolveScimToken(bearer) {
  if (!bearer || !String(bearer).startsWith('scim_')) return null
  const { rows } = await query(
    `SELECT id, workspace_id FROM workspace_scim_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(bearer)],
  )
  if (!rows[0]) return null
  return { tokenId: rows[0].id, workspaceId: rows[0].workspace_id }
}

function toScimUser(row, workspaceId) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: row.id,
    userName: row.email,
    name: {
      formatted: row.display_name || row.email,
    },
    displayName: row.display_name || row.email,
    emails: [{ value: row.email, primary: true, type: 'work' }],
    active: row.active !== false,
    meta: {
      resourceType: 'User',
      location: `/scim/v2/Users/${row.id}`,
    },
    'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
      department: workspaceId,
    },
  }
}

export async function scimListUsers(workspaceId, { filter, startIndex = 1, count = 100 } = {}) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, true AS active
     FROM users u
     JOIN workspace_members m ON m.user_id = u.id
     WHERE m.workspace_id = $1
     ORDER BY u.email
     LIMIT $2 OFFSET $3`,
    [
      workspaceId,
      Math.min(200, Math.max(1, Number(count) || 100)),
      Math.max(0, Number(startIndex) - 1),
    ],
  )
  let resources = rows.map((r) => toScimUser(r, workspaceId))
  if (filter) {
    const parsed = parseScimFilter(filter)
    if (parsed?.field === 'userName') {
      resources = resources.filter((u) => u.userName.toLowerCase() === parsed.value)
    }
  }
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: resources.length,
    startIndex: Number(startIndex) || 1,
    itemsPerPage: resources.length,
    Resources: resources,
  }
}

export async function scimGetUser(workspaceId, userId) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, true AS active
     FROM users u
     JOIN workspace_members m ON m.user_id = u.id
     WHERE m.workspace_id = $1 AND u.id = $2`,
    [workspaceId, userId],
  )
  if (!rows[0]) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }
  return toScimUser(rows[0], workspaceId)
}

export async function scimCreateUser(workspaceId, body = {}) {
  const email = String(
    body.userName || body.emails?.[0]?.value || '',
  )
    .trim()
    .toLowerCase()
  if (!email) {
    const err = new Error('userName required')
    err.status = 400
    throw err
  }
  const displayName =
    body.displayName || body.name?.formatted || email.split('@')[0]
  const active = body.active !== false
  const safeRole = normalizeScimMemberRole(body.roles?.[0]?.value || 'member')

  let userId
  const { rows: existing } = await query(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  if (existing[0]) {
    userId = existing[0].id
  } else {
    userId = randomUUID()
    // Placeholder password — IdP owns auth when SSO enforced
    const placeholder = hashPassword(randomBytes(24).toString('hex'))
    await query(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1,$2,$3,$4)`,
      [userId, email, displayName, placeholder],
    )
  }

  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1,$2,$3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, userId, safeRole],
  )

  if (!active) {
    await query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    )
  }

  return scimGetUser(workspaceId, userId)
}

export async function scimPatchUser(workspaceId, userId, body = {}) {
  const ops = Array.isArray(body.Operations) ? body.Operations : []
  for (const op of ops) {
    const path = String(op.path || '').toLowerCase()
    const value = op.value
    if (path === 'active' || (op.op === 'Replace' && value?.active != null)) {
      const active = path === 'active' ? Boolean(value) : Boolean(value.active)
      if (!active) {
        await query(
          `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
          [workspaceId, userId],
        )
      } else {
        await query(
          `INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1,$2,'member')
           ON CONFLICT (workspace_id, user_id) DO NOTHING`,
          [workspaceId, userId],
        )
      }
    }
    if (path === 'displayname' || value?.displayName) {
      const name = path === 'displayname' ? String(value) : String(value.displayName)
      await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [
        userId,
        name.slice(0, 120),
      ])
    }
  }
  // Also support PUT-style full replace fields
  if (body.displayName) {
    await query(`UPDATE users SET display_name = $2 WHERE id = $1`, [
      userId,
      String(body.displayName).slice(0, 120),
    ])
  }
  if (body.active === false) {
    await query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    )
  }
  return scimGetUser(workspaceId, userId)
}

export async function scimDeleteUser(workspaceId, userId) {
  await query(
    `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  )
  return { ok: true }
}
