/**
 * Workspace email invites — SSO / password users claim membership on login.
 */
import { query } from './db.js'

export async function listInvites(workspaceId) {
  const { rows } = await query(
    `SELECT id, email, role, invited_by, accepted_at, created_at
     FROM workspace_invites
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    invitedBy: r.invited_by,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
  }))
}

export async function createInvite(
  workspaceId,
  { email, role = 'member', invitedBy },
) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) {
    const err = new Error('valid email required')
    err.status = 400
    throw err
  }
  const allowed = ['viewer', 'member', 'admin', 'owner']
  const r = allowed.includes(role) ? role : 'member'
  const { rows } = await query(
    `INSERT INTO workspace_invites (workspace_id, email, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, email) DO UPDATE SET
       role = EXCLUDED.role,
       invited_by = EXCLUDED.invited_by,
       accepted_at = NULL,
       created_at = now()
     RETURNING id, email, role, invited_by, accepted_at, created_at`,
    [workspaceId, normalized, r, invitedBy || null],
  )
  const row = rows[0]
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  }
}

export async function revokeInvite(workspaceId, inviteId) {
  const { rowCount } = await query(
    `DELETE FROM workspace_invites
     WHERE workspace_id = $1 AND id = $2 AND accepted_at IS NULL`,
    [workspaceId, inviteId],
  )
  return rowCount > 0
}

/** Claim open invites for this email → workspace_members. */
export async function acceptPendingInvites(userId, email) {
  const { rows } = await query(
    `UPDATE workspace_invites
     SET accepted_at = now()
     WHERE lower(email) = lower($1) AND accepted_at IS NULL
     RETURNING workspace_id, role`,
    [email],
  )
  for (const inv of rows) {
    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [inv.workspace_id, userId, inv.role],
    )
  }
  return rows.length
}
