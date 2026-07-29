/**
 * Workspace members — list / role change / remove.
 */
import { query } from './db.js'

const ROLE_RANK = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
}

const ROLES = ['viewer', 'member', 'admin', 'owner']

export async function listMembers(workspaceId) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, m.role, m.created_at
     FROM workspace_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = $1
     ORDER BY
       CASE m.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'member' THEN 3
         ELSE 4
       END,
       lower(u.email)`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role,
    joinedAt: r.created_at,
  }))
}

async function countOwners(workspaceId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM workspace_members
     WHERE workspace_id = $1 AND role = 'owner'`,
    [workspaceId],
  )
  return rows[0]?.n ?? 0
}

export async function updateMemberRole(
  workspaceId,
  targetUserId,
  nextRole,
  actorUserId,
  actorRole,
) {
  if (!ROLES.includes(nextRole)) {
    const err = new Error('role must be viewer|member|admin|owner')
    err.status = 400
    throw err
  }
  const { rows } = await query(
    `SELECT role FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId],
  )
  if (!rows.length) {
    const err = new Error('member not found')
    err.status = 404
    throw err
  }
  const prev = rows[0].role
  // Only owners can grant/revoke owner; admins can set up to admin
  if (nextRole === 'owner' && actorRole !== 'owner') {
    const err = new Error('only owners can grant owner role')
    err.status = 403
    throw err
  }
  if (
    actorRole === 'admin' &&
    (ROLE_RANK[nextRole] >= ROLE_RANK.admin || ROLE_RANK[prev] >= ROLE_RANK.admin)
  ) {
    // admin may set viewer/member; may not change other admins/owners
    if (ROLE_RANK[prev] >= ROLE_RANK.admin || ROLE_RANK[nextRole] > ROLE_RANK.member) {
      const err = new Error('admins cannot change admin/owner membership')
      err.status = 403
      throw err
    }
  }
  if (prev === 'owner' && nextRole !== 'owner') {
    const n = await countOwners(workspaceId)
    if (n <= 1) {
      const err = new Error('cannot demote the last owner')
      err.status = 409
      throw err
    }
  }
  await query(
    `UPDATE workspace_members SET role = $3
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId, nextRole],
  )
  return listMembers(workspaceId).then((all) =>
    all.find((m) => m.id === targetUserId),
  )
}

export async function removeMember(workspaceId, targetUserId, actorRole) {
  const { rows } = await query(
    `SELECT role FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId],
  )
  if (!rows.length) {
    const err = new Error('member not found')
    err.status = 404
    throw err
  }
  const prev = rows[0].role
  if (ROLE_RANK[prev] >= ROLE_RANK.admin && actorRole !== 'owner') {
    const err = new Error('only owners can remove admin/owner')
    err.status = 403
    throw err
  }
  if (prev === 'owner') {
    const n = await countOwners(workspaceId)
    if (n <= 1) {
      const err = new Error('cannot remove the last owner')
      err.status = 409
      throw err
    }
  }
  await query(
    `DELETE FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId],
  )
  return true
}
