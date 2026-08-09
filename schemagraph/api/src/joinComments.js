/**
 * Multiplayer join review comments (PR-style discussion) with threads.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

function mapComment(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    relationshipId: r.relationship_id,
    parentId: r.parent_id || null,
    authorUserId: r.author_user_id,
    authorEmail: r.author_email || null,
    authorName: r.author_name || null,
    body: r.body,
    createdAt: r.created_at,
    replies: [],
  }
}

export async function listJoinComments(workspaceId, relationshipId) {
  const { rows } = await query(
    `SELECT c.*, u.email AS author_email, u.display_name AS author_name
     FROM join_review_comments c
     LEFT JOIN users u ON u.id = c.author_user_id
     WHERE c.workspace_id = $1 AND c.relationship_id = $2
     ORDER BY c.created_at ASC
     LIMIT 300`,
    [workspaceId, relationshipId],
  )
  const flat = rows.map(mapComment)
  const byId = new Map(flat.map((c) => [c.id, c]))
  const roots = []
  for (const c of flat) {
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId).replies.push(c)
    } else {
      roots.push(c)
    }
  }
  return roots
}

export async function addJoinComment(
  workspaceId,
  relationshipId,
  body,
  userId = null,
  { parentId = null } = {},
) {
  const text = String(body || '').trim()
  if (!text) {
    const err = new Error('body required')
    err.status = 400
    throw err
  }
  const { rows: rel } = await query(
    `SELECT id FROM relationships WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, relationshipId],
  )
  if (!rel[0]) {
    const err = new Error('relationship not found')
    err.status = 404
    throw err
  }
  if (parentId) {
    const { rows: parents } = await query(
      `SELECT id FROM join_review_comments
       WHERE workspace_id = $1 AND relationship_id = $2 AND id = $3`,
      [workspaceId, relationshipId, parentId],
    )
    if (!parents[0]) {
      const err = new Error('parent comment not found')
      err.status = 404
      throw err
    }
  }
  const id = randomUUID()
  await query(
    `INSERT INTO join_review_comments (
       id, workspace_id, relationship_id, author_user_id, body, parent_id
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, workspaceId, relationshipId, userId, text.slice(0, 4000), parentId],
  )
  const list = await listJoinComments(workspaceId, relationshipId)
  const find = (nodes) => {
    for (const n of nodes) {
      if (n.id === id) return n
      const nested = find(n.replies || [])
      if (nested) return nested
    }
    return null
  }
  return find(list)
}
