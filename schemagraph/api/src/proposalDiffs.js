/**
 * PR-like approve/diff queue for joins, SQL, jobs, transforms.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'

function mapDiff(r) {
  const before =
    r.before_json && typeof r.before_json === 'object' ? r.before_json : {}
  const after =
    r.after_json && typeof r.after_json === 'object' ? r.after_json : {}
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    kind: r.kind,
    title: r.title,
    summary: r.summary || '',
    before,
    after,
    unifiedDiff: formatUnifiedDiff(before, after, r.title || 'proposal'),
    status: r.status,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    createdBy: r.created_by,
    reviewedBy: r.reviewed_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Lightweight unified-diff style view for PR UX. */
export function formatUnifiedDiff(before, after, label = 'proposal') {
  const a = JSON.stringify(before || {}, null, 2).split('\n')
  const b = JSON.stringify(after || {}, null, 2).split('\n')
  const lines = [`--- a/${label}`, `+++ b/${label}`]
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    const left = a[i]
    const right = b[i]
    if (left === right) {
      if (left != null) lines.push(` ${left}`)
    } else {
      if (left != null) lines.push(`-${left}`)
      if (right != null) lines.push(`+${right}`)
    }
  }
  return lines.join('\n')
}

export async function listProposalDiffs(
  workspaceId,
  { status = 'open', limit = 50 } = {},
) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 50))
  if (status && status !== 'all') {
    const { rows } = await query(
      `SELECT * FROM proposal_diffs
       WHERE workspace_id = $1 AND status = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [workspaceId, String(status), lim],
    )
    return rows.map(mapDiff)
  }
  const { rows } = await query(
    `SELECT * FROM proposal_diffs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, lim],
  )
  return rows.map(mapDiff)
}

export async function createProposalDiff(
  workspaceId,
  {
    kind,
    title,
    summary = '',
    before = {},
    after = {},
    resourceType = null,
    resourceId = null,
    userId = null,
  } = {},
) {
  const id = randomUUID()
  await query(
    `INSERT INTO proposal_diffs (
       id, workspace_id, kind, title, summary, before_json, after_json,
       status, resource_type, resource_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'open',$8,$9,$10)`,
    [
      id,
      workspaceId,
      String(kind || 'sql').slice(0, 40),
      String(title || 'Proposal').slice(0, 200),
      String(summary || '').slice(0, 2000),
      JSON.stringify(before || {}),
      JSON.stringify(after || {}),
      resourceType,
      resourceId,
      userId,
    ],
  )
  const { rows } = await query(`SELECT * FROM proposal_diffs WHERE id = $1`, [
    id,
  ])
  return mapDiff(rows[0])
}

export async function reviewProposalDiff(
  workspaceId,
  diffId,
  action,
  userId = null,
) {
  if (action !== 'approve' && action !== 'reject') {
    const err = new Error("action must be 'approve' or 'reject'")
    err.status = 400
    throw err
  }
  const next = action === 'approve' ? 'approved' : 'rejected'
  const { rows } = await query(
    `UPDATE proposal_diffs SET
       status = $3, reviewed_by = $4, updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [workspaceId, diffId, next, userId],
  )
  if (!rows[0]) {
    const err = new Error('proposal not found')
    err.status = 404
    throw err
  }
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: `proposal.${action}`,
    resourceType: 'proposal_diff',
    resourceId: diffId,
    summary: `${action} proposal “${rows[0].title}”`,
  })
  return mapDiff(rows[0])
}

/** Text diff for join edit/promote visibility */
export async function createJoinProposalDiff(
  workspaceId,
  {
    relationshipId,
    title,
    before,
    after,
    userId = null,
    summary = 'Join change pending HITL',
  } = {},
) {
  return createProposalDiff(workspaceId, {
    kind: 'join',
    title: title || 'Join proposal',
    summary,
    before,
    after,
    resourceType: 'relationship',
    resourceId: relationshipId,
    userId,
  })
}
