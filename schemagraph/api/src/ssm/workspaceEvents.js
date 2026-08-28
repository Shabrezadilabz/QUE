/**
 * Phase 2 — append-only workspace event stream for SSM-B lite routing.
 * Never stores row payloads — event types, table names, ids only.
 */
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'

export const WORKSPACE_EVENT_TYPES = [
  'connector_added',
  'sync_completed',
  'monk_started',
  'join_inferred',
  'join_promoted',
  'job_created',
  'job_run_completed',
  'dataset_certified',
  'chat_query',
  'board_published',
  'schema_drift',
]

/**
 * @param {string} workspaceId
 * @param {string} eventType
 * @param {object} [meta]
 * @param {string|null} [actorUserId]
 */
export async function emitWorkspaceEvent(
  workspaceId,
  eventType,
  meta = {},
  actorUserId = null,
) {
  const id = randomUUID()
  await query(
    `INSERT INTO workspace_event_log (id, workspace_id, event_type, meta_json, actor_user_id)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, workspaceId, eventType, JSON.stringify(meta || {}), actorUserId],
  )
  return { id, workspaceId, eventType, meta, createdAt: new Date().toISOString() }
}

/**
 * @param {string} workspaceId
 * @param {number} [limit]
 */
export async function listRecentWorkspaceEvents(workspaceId, limit = 50) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const { rows } = await query(
    `SELECT id, workspace_id, event_type, meta_json, actor_user_id, created_at
     FROM workspace_event_log
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, cap],
  )
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    eventType: r.event_type,
    meta: r.meta_json || {},
    actorUserId: r.actor_user_id,
    createdAt: r.created_at,
  }))
}
