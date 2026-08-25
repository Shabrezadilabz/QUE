/**
 * Schema chat session metadata — list, archive, delete, load turns.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

function rowToSession(r) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    audience: r.audience === 'engineer' ? 'engineer' : 'ceo',
    preview: r.preview || null,
    messageCount: Number(r.message_count) || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function titleFromMessage(text) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return 'New chat'
  return t.length > 72 ? `${t.slice(0, 69)}…` : t
}

export async function listChatSessions(
  workspaceId,
  { status = 'active', limit = 40, userId = null } = {},
) {
  const params = [workspaceId]
  let statusClause = `AND status = 'active'`
  if (status === 'archived') {
    statusClause = `AND status = 'archived'`
  } else if (status === 'all') {
    statusClause = `AND status IN ('active', 'archived')`
  } else if (status === 'deleted') {
    statusClause = `AND status = 'deleted'`
  }
  const lim = Math.min(100, Math.max(1, Number(limit) || 40))
  params.push(lim)

  const { rows } = await query(
    `SELECT id, title, status, audience, preview, message_count, created_at, updated_at
     FROM ai_chat_sessions
     WHERE workspace_id = $1 ${statusClause}
     ORDER BY updated_at DESC
     LIMIT $2`,
    params,
  )
  return rows.map(rowToSession)
}

export async function getChatSession(workspaceId, sessionId) {
  const { rows } = await query(
    `SELECT id, title, status, audience, preview, message_count, created_at, updated_at
     FROM ai_chat_sessions
     WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted'`,
    [workspaceId, sessionId],
  )
  return rows[0] ? rowToSession(rows[0]) : null
}

export async function createChatSession(
  workspaceId,
  userId,
  { title = 'New chat', audience = 'ceo' } = {},
) {
  const id = randomUUID()
  const aud = audience === 'engineer' ? 'engineer' : 'ceo'
  const { rows } = await query(
    `INSERT INTO ai_chat_sessions (
       id, workspace_id, created_by, title, status, audience
     ) VALUES ($1, $2, $3, $4, 'active', $5)
     RETURNING id, title, status, audience, preview, message_count, created_at, updated_at`,
    [id, workspaceId, userId || null, title || 'New chat', aud],
  )
  return rowToSession(rows[0])
}

export async function updateChatSession(workspaceId, sessionId, patch = {}) {
  const sets = []
  const params = [workspaceId, sessionId]
  if (typeof patch.title === 'string' && patch.title.trim()) {
    params.push(patch.title.trim())
    sets.push(`title = $${params.length}`)
  }
  if (patch.status === 'active' || patch.status === 'archived' || patch.status === 'deleted') {
    params.push(patch.status)
    sets.push(`status = $${params.length}`)
  }
  if (patch.audience === 'ceo' || patch.audience === 'engineer') {
    params.push(patch.audience)
    sets.push(`audience = $${params.length}`)
  }
  if (!sets.length) {
    return getChatSession(workspaceId, sessionId)
  }
  sets.push('updated_at = now()')
  const { rows } = await query(
    `UPDATE ai_chat_sessions
     SET ${sets.join(', ')}
     WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted'
     RETURNING id, title, status, audience, preview, message_count, created_at, updated_at`,
    params,
  )
  return rows[0] ? rowToSession(rows[0]) : null
}

export async function deleteChatSession(workspaceId, sessionId) {
  return updateChatSession(workspaceId, sessionId, { status: 'deleted' })
}

export async function archiveChatSession(workspaceId, sessionId) {
  return updateChatSession(workspaceId, sessionId, { status: 'archived' })
}

export async function restoreChatSession(workspaceId, sessionId) {
  return updateChatSession(workspaceId, sessionId, { status: 'active' })
}

/**
 * Bump session metadata after a turn is persisted.
 */
export async function touchChatSession(
  workspaceId,
  sessionId,
  { userMessage, assistantMessage, audience } = {},
) {
  if (!sessionId || sessionId === 'default') return
  const preview = titleFromMessage(userMessage || assistantMessage || '')
  const aud = audience === 'engineer' ? 'engineer' : audience === 'ceo' ? 'ceo' : null
  const params = [workspaceId, sessionId, preview]
  let audClause = ''
  if (aud) {
    params.push(aud)
    audClause = `, audience = $${params.length}`
  }
  await query(
    `UPDATE ai_chat_sessions
     SET updated_at = now(),
         preview = COALESCE(NULLIF($3, ''), preview),
         message_count = message_count + 2,
         title = CASE
           WHEN title = 'New chat' AND $3 <> '' THEN LEFT($3, 72)
           ELSE title
         END
         ${audClause}
     WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted'`,
    params,
  )
}

export async function loadChatSessionTurns(workspaceId, sessionId, limit = 200) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 200))
  const { rows } = await query(
    `SELECT role, content, model_id, mode, metadata_json, created_at
     FROM ai_chat_turns
     WHERE workspace_id = $1 AND session_id = $2
     ORDER BY created_at ASC
     LIMIT $3`,
    [workspaceId, sessionId, lim],
  )
  return rows.map((r, idx) => {
    const meta =
      r.metadata_json && typeof r.metadata_json === 'object'
        ? r.metadata_json
        : {}
    return {
      id: `turn-${idx}`,
      role: r.role,
      content: r.content,
      model: r.model_id || null,
      mode: r.mode || null,
      sql: meta.sql || null,
      audience: meta.audience || null,
      at: r.created_at,
    }
  })
}

export async function ensureChatSession(workspaceId, sessionId, userId, audience = 'ceo') {
  const existing = await getChatSession(workspaceId, sessionId)
  if (existing) return existing
  return createChatSession(workspaceId, userId, { title: 'New chat', audience })
}
