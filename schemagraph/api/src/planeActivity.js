/**
 * Managed Plane activity — server-side feed for chat handoffs, runs, lands.
 * Stores SQL text + metadata only — never warehouse row payloads.
 */
import { createHash, randomUUID } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'

function hashSql(sql) {
  if (!sql) return null
  return createHash('sha256').update(String(sql).trim()).digest('hex').slice(0, 16)
}

function mapRow(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    kind: r.kind,
    source: r.source,
    actor: r.actor,
    title: r.title,
    detail: r.detail || undefined,
    sql: r.sql_text || undefined,
    sqlHash: r.sql_hash || undefined,
    datasetId: r.dataset_id || null,
    connectionId: r.connection_id || null,
    rowCount: r.row_count != null ? Number(r.row_count) : null,
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : null,
    read: Boolean(r.read_at),
    createdAt: r.created_at,
  }
}

/**
 * @param {string} workspaceId
 * @param {{ limit?: number, offset?: number, source?: string }} [opts]
 */
export async function listPlaneActivityEvents(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200)
  const offset = Math.max(Number(opts.offset) || 0, 0)
  const params = [workspaceId]
  let where = 'workspace_id = $1'
  if (opts.source) {
    params.push(String(opts.source))
    where += ` AND source = $${params.length}`
  }
  params.push(limit)
  const limIdx = params.length
  params.push(offset)
  const offIdx = params.length

  const { rows } = await query(
    `SELECT id, workspace_id, kind, source, actor, title, detail,
            sql_text, sql_hash, dataset_id, connection_id,
            row_count, duration_ms, read_at, created_at
     FROM plane_activity_events
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  )
  return rows.map(mapRow)
}

/** @param {string} workspaceId */
export async function countUnreadPlaneActivityEvents(workspaceId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
     FROM plane_activity_events
     WHERE workspace_id = $1 AND read_at IS NULL`,
    [workspaceId],
  )
  return rows[0]?.n || 0
}

/**
 * @param {string} workspaceId
 * @param {object} input
 * @param {string|null} [actorUserId]
 */
export async function createPlaneActivityEvent(
  workspaceId,
  input,
  actorUserId = null,
) {
  const id = randomUUID()
  const sqlText = input.sql ? String(input.sql) : null
  const sqlHash = sqlText ? hashSql(sqlText) : input.sqlHash || null

  const { rows } = await query(
    `INSERT INTO plane_activity_events (
       id, workspace_id, kind, source, actor, title, detail,
       sql_text, sql_hash, dataset_id, connection_id,
       row_count, duration_ms
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, workspace_id, kind, source, actor, title, detail,
               sql_text, sql_hash, dataset_id, connection_id,
               row_count, duration_ms, read_at, created_at`,
    [
      id,
      workspaceId,
      String(input.kind),
      String(input.source),
      String(input.actor || 'system'),
      String(input.title),
      input.detail ? String(input.detail) : null,
      sqlText,
      sqlHash,
      input.datasetId || null,
      input.connectionId || null,
      input.rowCount != null ? Number(input.rowCount) : null,
      input.durationMs != null ? Number(input.durationMs) : null,
    ],
  )

  const event = mapRow(rows[0])

  void recordAuditEvent({
    workspaceId,
    actorUserId,
    action: `plane.${input.kind}`,
    resourceType: 'plane_activity',
    resourceId: event.id,
    summary: input.title,
    meta: {
      source: input.source,
      actor: input.actor,
      sqlHash,
      datasetId: input.datasetId || null,
    },
  })

  return event
}

/** Mark all plane activity as read for a workspace. */
export async function markPlaneActivityEventsRead(workspaceId) {
  const { rowCount } = await query(
    `UPDATE plane_activity_events
     SET read_at = COALESCE(read_at, now())
     WHERE workspace_id = $1 AND read_at IS NULL`,
    [workspaceId],
  )
  return { marked: rowCount ?? 0 }
}
