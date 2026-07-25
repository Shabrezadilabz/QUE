/**
 * Chat feedback (RLHF-lite) + durable turns for limited memory.
 */
import crypto from 'crypto'
import { query } from '../db.js'

export function hashMessage(content) {
  return crypto
    .createHash('sha256')
    .update(String(content || ''))
    .digest('hex')
    .slice(0, 32)
}

/**
 * @param {{
 *   workspaceId: string,
 *   messageId?: string,
 *   content?: string,
 *   rating: 1 | -1,
 *   note?: string,
 *   modelId?: string,
 *   sourceRefs?: string[],
 * }} payload
 */
export async function saveFeedback(payload) {
  const messageHash = hashMessage(
    payload.content || payload.messageId || String(Date.now()),
  )
  const { rows } = await query(
    `INSERT INTO ai_chat_feedback (
       workspace_id, message_id, message_hash, rating, note, model_id, source_refs
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, created_at`,
    [
      payload.workspaceId,
      payload.messageId || null,
      messageHash,
      payload.rating,
      payload.note || null,
      payload.modelId || null,
      JSON.stringify(payload.sourceRefs || []),
    ],
  )
  return rows[0]
}

/** Map source_ref → net positive score for soft retrieval boost. */
export async function getBoostedSourceRefs(workspaceId) {
  const { rows } = await query(
    `SELECT jsonb_array_elements_text(source_refs) AS ref, SUM(rating)::int AS net
     FROM ai_chat_feedback
     WHERE workspace_id = $1
       AND created_at > now() - interval '90 days'
       AND jsonb_array_length(source_refs) > 0
     GROUP BY ref
     HAVING SUM(rating) > 0`,
    [workspaceId],
  )
  const map = new Map()
  for (const r of rows) {
    map.set(r.ref, Number(r.net) || 0)
  }
  return map
}

export async function appendTurn(workspaceId, turn) {
  await query(
    `INSERT INTO ai_chat_turns (
       workspace_id, session_id, role, content, model_id, mode, metadata_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      workspaceId,
      turn.sessionId || 'default',
      turn.role,
      turn.content,
      turn.modelId || null,
      turn.mode || null,
      JSON.stringify(turn.metadata || {}),
    ],
  )
}

export async function recentTurns(workspaceId, sessionId = 'default', limit = 16) {
  const { rows } = await query(
    `SELECT role, content, model_id, mode, created_at
     FROM ai_chat_turns
     WHERE workspace_id = $1 AND session_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [workspaceId, sessionId, limit],
  )
  return rows.reverse()
}

export async function feedbackStats(workspaceId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE rating = 1)::int AS up,
       COUNT(*) FILTER (WHERE rating = -1)::int AS down
     FROM ai_chat_feedback WHERE workspace_id = $1`,
    [workspaceId],
  )
  return { up: rows[0]?.up || 0, down: rows[0]?.down || 0 }
}
