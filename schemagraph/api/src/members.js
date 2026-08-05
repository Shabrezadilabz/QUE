/**
 * Workspace members — list / role change / remove.
 * Wave 1.4 — last-owner protection + clearer error codes for Settings UI.
 */
import { query } from './db.js'

const ROLE_RANK = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
}

const ROLES = ['viewer', 'member', 'admin', 'owner']

function httpError(message, status, code) {
  const err = new Error(message)
  err.status = status
  if (code) err.code = code
  return err
}

export async function listMembers(workspaceId) {
  const ownerCount = await countOwners(workspaceId)
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
    isLastOwner: r.role === 'owner' && ownerCount <= 1,
  }))
}

export function getMembershipSummary(members) {
  const list = Array.isArray(members) ? members : []
  const owners = list.filter((m) => m.role === 'owner')
  return {
    memberCount: list.length,
    ownerCount: owners.length,
    hasSingleOwner: owners.length === 1,
    lastOwnerId: owners.length === 1 ? owners[0].id : null,
  }
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
    throw httpError('role must be viewer|member|admin|owner', 400, 'BAD_ROLE')
  }
  if (String(targetUserId) === String(actorUserId)) {
    throw httpError(
      'You cannot change your own role — ask another owner',
      403,
      'SELF_ROLE',
    )
  }
  const { rows } = await query(
    `SELECT role FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId],
  )
  if (!rows.length) {
    throw httpError('member not found', 404, 'NOT_FOUND')
  }
  const prev = rows[0].role
  // Only owners can grant/revoke owner; admins can set up to admin
  if (nextRole === 'owner' && actorRole !== 'owner') {
    throw httpError('Only owners can grant the owner role', 403, 'OWNER_ONLY')
  }
  if (
    actorRole === 'admin' &&
    (ROLE_RANK[nextRole] >= ROLE_RANK.admin || ROLE_RANK[prev] >= ROLE_RANK.admin)
  ) {
    // admin may set viewer/member; may not change other admins/owners
    if (ROLE_RANK[prev] >= ROLE_RANK.admin || ROLE_RANK[nextRole] > ROLE_RANK.member) {
      throw httpError(
        'Admins cannot change admin or owner membership',
        403,
        'ADMIN_LIMIT',
      )
    }
  }
  if (prev === 'owner' && nextRole !== 'owner') {
    const n = await countOwners(workspaceId)
    if (n <= 1) {
      throw httpError(
        'Cannot demote the last owner — promote another owner first',
        409,
        'LAST_OWNER',
      )
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

export async function removeMember(
  workspaceId,
  targetUserId,
  actorRole,
  actorUserId,
) {
  if (String(targetUserId) === String(actorUserId)) {
    throw httpError(
      'You cannot remove yourself — ask another owner',
      403,
      'SELF_REMOVE',
    )
  }
  const { rows } = await query(
    `SELECT role FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId],
  )
  if (!rows.length) {
    throw httpError('member not found', 404, 'NOT_FOUND')
  }
  const prev = rows[0].role
  if (ROLE_RANK[prev] >= ROLE_RANK.admin && actorRole !== 'owner') {
    throw httpError('Only owners can remove admin or owner', 403, 'OWNER_ONLY')
  }
  if (prev === 'owner') {
    const n = await countOwners(workspaceId)
    if (n <= 1) {
      throw httpError(
        'Cannot remove the last owner — promote another owner first',
        409,
        'LAST_OWNER',
      )
    }
  }
  await query(
    `DELETE FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, targetUserId],
  )
  return true
}
