/**
 * P2 — HTTP heartbeat presence (multiplayer without WebSocket).
 */
import { query } from './db.js'

const ACTIVE_MS = 2 * 60 * 1000

export async function heartbeatPresence(
  workspaceId,
  {
    userId,
    displayName = '',
    email = '',
    pagePath = '',
    status = 'active',
  } = {},
) {
  if (!userId) {
    const err = new Error('user required for presence')
    err.status = 400
    throw err
  }
  await query(
    `INSERT INTO workspace_presence (
       workspace_id, user_id, display_name, email, page_path, status, last_seen_at
     ) VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       email = EXCLUDED.email,
       page_path = EXCLUDED.page_path,
       status = EXCLUDED.status,
       last_seen_at = now()`,
    [
      workspaceId,
      userId,
      String(displayName || '').slice(0, 120),
      String(email || '').slice(0, 200),
      String(pagePath || '').slice(0, 200),
      String(status || 'active').slice(0, 40),
    ],
  )
  return listPresence(workspaceId)
}

export async function listPresence(workspaceId) {
  const { rows } = await query(
    `SELECT workspace_id, user_id, display_name, email, page_path, status, last_seen_at
     FROM workspace_presence
     WHERE workspace_id = $1
       AND last_seen_at > now() - interval '5 minutes'
     ORDER BY last_seen_at DESC
     LIMIT 50`,
    [workspaceId],
  )
  const now = Date.now()
  return rows.map((r) => {
    const seen = new Date(r.last_seen_at).getTime()
    const active = now - seen <= ACTIVE_MS
    return {
      userId: r.user_id,
      displayName: r.display_name || r.email || 'member',
      email: r.email,
      pagePath: r.page_path,
      status: active ? r.status || 'active' : 'away',
      lastSeenAt: r.last_seen_at,
      active,
    }
  })
}
