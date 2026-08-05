/**
 * Workspace audit log — Wave 1.1
 * Best-effort writes (never fail the primary action if insert fails).
 */
import { query } from './db.js'

/**
 * @param {object} input
 * @param {string} input.workspaceId
 * @param {string|null} [input.actorUserId]
 * @param {string} input.action  e.g. connection.sync, relationship.promote
 * @param {string} [input.resourceType]
 * @param {string} [input.resourceId]
 * @param {string} [input.summary]
 * @param {object} [input.meta]
 */
export async function recordAuditEvent({
  workspaceId,
  actorUserId = null,
  action,
  resourceType = null,
  resourceId = null,
  summary = null,
  meta = {},
}) {
  if (!workspaceId || !action) return null
  try {
    const { rows } = await query(
      `INSERT INTO workspace_audit_events (
         workspace_id, actor_user_id, action, resource_type, resource_id, summary, meta_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING id, created_at`,
      [
        workspaceId,
        actorUserId,
        String(action),
        resourceType,
        resourceId != null ? String(resourceId) : null,
        summary,
        JSON.stringify(meta || {}),
      ],
    )
    return rows[0] || null
  } catch (err) {
    console.warn('[Que] audit insert skipped:', err.message || err)
    return null
  }
}

/**
 * @param {string} workspaceId
 * @param {{ limit?: number, offset?: number, action?: string }} [opts]
 */
export async function listAuditEvents(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const action = opts.action ? String(opts.action) : null

  const params = [workspaceId]
  let where = `e.workspace_id = $1`
  if (action) {
    params.push(action)
    where += ` AND e.action = $${params.length}`
  }
  params.push(limit)
  const limIdx = params.length
  params.push(offset)
  const offIdx = params.length

  const { rows } = await query(
    `SELECT e.id, e.action, e.resource_type, e.resource_id, e.summary,
            e.meta_json, e.created_at, e.actor_user_id,
            u.email AS actor_email, u.display_name AS actor_display_name
     FROM workspace_audit_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE ${where}
     ORDER BY e.created_at DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  )

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    summary: r.summary,
    meta: r.meta_json && typeof r.meta_json === 'object' ? r.meta_json : {},
    createdAt: r.created_at,
    actor: r.actor_user_id
      ? {
          id: r.actor_user_id,
          email: r.actor_email,
          displayName: r.actor_display_name,
        }
      : null,
  }))
}
