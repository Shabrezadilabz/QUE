/**
 * Phase 5 — Break-glass emergency access (audited SSO bypass window).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'

function mapEvent(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    actorUserId: r.actor_user_id,
    actorEmail: r.actor_email || null,
    reason: r.reason,
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    closedAt: r.closed_at,
  }
}

export async function listBreakGlass(workspaceId) {
  const { rows } = await query(
    `SELECT b.*, u.email AS actor_email
     FROM break_glass_events b
     LEFT JOIN users u ON u.id = b.actor_user_id
     WHERE b.workspace_id = $1
     ORDER BY b.created_at DESC
     LIMIT 50`,
    [workspaceId],
  )
  return rows.map(mapEvent)
}

export async function openBreakGlass(workspaceId, userId, reason, hours = 4) {
  const r = String(reason || '').trim()
  if (r.length < 8) {
    const err = new Error('reason required (min 8 chars)')
    err.status = 400
    throw err
  }
  const hrs = Math.min(Math.max(Number(hours) || 4, 1), 24)
  const id = randomUUID()
  const expires = new Date(Date.now() + hrs * 3600000).toISOString()
  await query(
    `INSERT INTO break_glass_events (
       id, workspace_id, actor_user_id, reason, status, expires_at
     ) VALUES ($1,$2,$3,$4,'active',$5)`,
    [id, workspaceId, userId, r.slice(0, 2000), expires],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'break_glass.open',
    resourceType: 'break_glass',
    resourceId: id,
    summary: `Break-glass opened for ${hrs}h`,
    meta: { reason: r.slice(0, 200), expires },
  })
  return (await listBreakGlass(workspaceId)).find((e) => e.id === id)
}

export async function closeBreakGlass(workspaceId, eventId, userId = null) {
  await query(
    `UPDATE break_glass_events
     SET status = 'closed', closed_at = now()
     WHERE workspace_id = $1 AND id = $2 AND status = 'active'`,
    [workspaceId, eventId],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'break_glass.close',
    resourceType: 'break_glass',
    resourceId: eventId,
    summary: 'Break-glass closed',
  })
  return { ok: true }
}

/**
 * Active break-glass for user in workspace (password login allowed when SSO enforced).
 */
export async function hasActiveBreakGlass(workspaceId, userId) {
  // expire stale
  await query(
    `UPDATE break_glass_events SET status = 'expired', closed_at = now()
     WHERE workspace_id = $1 AND status = 'active' AND expires_at < now()`,
    [workspaceId],
  )
  const { rows } = await query(
    `SELECT id FROM break_glass_events
     WHERE workspace_id = $1 AND actor_user_id = $2
       AND status = 'active' AND expires_at > now()
     LIMIT 1`,
    [workspaceId, userId],
  )
  return Boolean(rows[0])
}
