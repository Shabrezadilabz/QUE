/**
 * Steward inbox — quality / join / mapping issues with approve workflow.
 */
import { query } from './db.js'

function mapIssue(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    runId: r.run_id,
    issueKind: r.issue_kind,
    severity: r.severity,
    status: r.status,
    title: r.title,
    description: r.description,
    tableName: r.table_name,
    columnName: r.column_name,
    proposalSql: r.proposal_sql,
    proposal: r.proposal_json || {},
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listStewardInboxIssues(workspaceId, opts = {}) {
  const status = opts.status ? String(opts.status) : null
  const limit = Math.min(Number(opts.limit) || 100, 200)
  const params = [workspaceId]
  let sql = `SELECT * FROM steward_inbox_issues WHERE workspace_id = $1`
  if (status && status !== 'all') {
    if (status === 'open') {
      sql += ` AND status IN ('open', 'in_review')`
    } else {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }
  }
  sql += ` ORDER BY
    CASE severity
      WHEN 'critical' THEN 0 WHEN 'high' THEN 1
      WHEN 'medium' THEN 2 ELSE 3 END,
    updated_at DESC
    LIMIT ${limit}`
  const { rows } = await query(sql, params)
  return rows.map(mapIssue)
}

export async function getStewardInboxSummary(workspaceId) {
  const { rows } = await query(
    `SELECT status, severity, COUNT(*)::int AS n
     FROM steward_inbox_issues
     WHERE workspace_id = $1
     GROUP BY status, severity`,
    [workspaceId],
  )
  let open = 0
  let high = 0
  let resolved = 0
  for (const r of rows) {
    if (r.status === 'open' || r.status === 'in_review') open += r.n
    if (
      (r.status === 'open' || r.status === 'in_review') &&
      (r.severity === 'high' || r.severity === 'critical')
    ) {
      high += r.n
    }
    if (r.status === 'resolved' || r.status === 'approved') resolved += r.n
  }
  return { open, high, resolved, breakdown: rows }
}

export async function updateStewardIssueStatus(
  workspaceId,
  issueId,
  status,
  userId = null,
) {
  const allowed = new Set([
    'open',
    'in_review',
    'approved',
    'rejected',
    'resolved',
  ])
  if (!allowed.has(status)) {
    const err = new Error('invalid status')
    err.status = 400
    throw err
  }
  const resolvedAt =
    status === 'resolved' || status === 'approved' ? new Date() : null
  const { rows } = await query(
    `UPDATE steward_inbox_issues
     SET status = $3, resolved_by = $4, resolved_at = COALESCE($5, resolved_at),
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [workspaceId, issueId, status, userId, resolvedAt],
  )
  if (!rows[0]) {
    const err = new Error('issue not found')
    err.status = 404
    throw err
  }
  const issue = mapIssue(rows[0])
  try {
    const { recordStewardApprovalMemory } = await import('./workspaceMemory.js')
    await recordStewardApprovalMemory(workspaceId, issue, status, userId)
  } catch {
    /* non-fatal */
  }
  return issue
}

export async function createStewardInboxIssue(
  workspaceId,
  {
    issueKind = 'quality',
    severity = 'medium',
    title,
    description = '',
    tableName = null,
    columnName = null,
    proposalSql = null,
    proposal = {},
    runId = null,
    userId = null,
  } = {},
) {
  const t = String(title || '').trim()
  if (!t) {
    const err = new Error('title required')
    err.status = 400
    throw err
  }
  const { rows } = await query(
    `INSERT INTO steward_inbox_issues (
       workspace_id, run_id, issue_kind, severity, status,
       title, description, table_name, column_name,
       proposal_sql, proposal_json, created_by
     ) VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING *`,
    [
      workspaceId,
      runId,
      issueKind,
      severity,
      t.slice(0, 400),
      description?.slice(0, 2000) || null,
      tableName,
      columnName,
      proposalSql,
      JSON.stringify(proposal || {}),
      userId,
    ],
  )
  return mapIssue(rows[0])
}
