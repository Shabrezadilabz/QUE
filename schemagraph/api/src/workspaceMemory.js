/**
 * Workspace memory — learn from steward approvals (Phase 4).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

/**
 * @param {string} workspaceId
 * @param {{ kind: string, key: string, value?: object, source?: string, userId?: string|null }} entry
 */
export async function recordWorkspaceMemory(workspaceId, entry) {
  const kind = String(entry.kind || 'hint').slice(0, 64)
  const key = String(entry.key || '').slice(0, 200)
  if (!key) return null

  const { rows } = await query(
    `INSERT INTO workspace_memory_entries (
       workspace_id, entry_kind, entry_key, value_json, source, created_by
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
     ON CONFLICT (workspace_id, entry_kind, entry_key)
     DO UPDATE SET
       value_json = EXCLUDED.value_json,
       source = EXCLUDED.source,
       updated_at = now()
     RETURNING id, entry_kind, entry_key, value_json, source, created_at`,
    [
      workspaceId,
      kind,
      key,
      JSON.stringify(entry.value || {}),
      entry.source || 'monk_mode',
      entry.userId ?? null,
    ],
  )
  return rows[0] || null
}

export async function listWorkspaceMemory(workspaceId, opts = {}) {
  const kind = opts.kind ? String(opts.kind) : null
  const limit = Math.min(Number(opts.limit) || 50, 200)
  const params = [workspaceId]
  let sql = `SELECT * FROM workspace_memory_entries WHERE workspace_id = $1`
  if (kind) {
    params.push(kind)
    sql += ` AND entry_kind = $${params.length}`
  }
  sql += ` ORDER BY updated_at DESC LIMIT ${limit}`
  const { rows } = await query(sql, params)
  return rows.map((r) => ({
    id: r.id,
    kind: r.entry_kind,
    key: r.entry_key,
    value: r.value_json || {},
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

/** Record steward approval as workspace memory for future join/KPI hints. */
export async function recordStewardApprovalMemory(
  workspaceId,
  issue,
  status,
  userId = null,
) {
  if (!issue || (status !== 'approved' && status !== 'resolved')) return null
  return recordWorkspaceMemory(workspaceId, {
    kind: 'quality_fix',
    key: `${issue.issueKind}:${issue.title}`.slice(0, 200),
    value: {
      issueId: issue.id,
      tableName: issue.tableName,
      columnName: issue.columnName,
      status,
      approvedAt: new Date().toISOString(),
    },
    source: 'steward_inbox',
    userId,
  })
}

/** Summarize memory for chat / join assist. */
export async function getWorkspaceMemoryHints(workspaceId, limit = 12) {
  const items = await listWorkspaceMemory(workspaceId, { limit })
  return items.map((m) => ({
    kind: m.kind,
    key: m.key,
    hint: m.value?.hint || m.value?.title || m.key,
  }))
}
