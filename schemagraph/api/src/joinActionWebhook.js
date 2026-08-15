/**
 * Apply Promote/Reject from Slack/Teams signed link (no browser session).
 */
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import { learnRuleFromPromote } from './workspaceRules.js'
import { verifyJoinActionToken } from './joinActionTokens.js'
import { notifyJoinPromoted } from './teamNotify.js'

export async function applyJoinActionFromToken(token, { actorLabel = 'slack' } = {}) {
  const parsed = verifyJoinActionToken(token)
  if (!parsed) {
    const err = new Error('invalid or expired action token')
    err.status = 401
    throw err
  }
  const { workspaceId, relationshipId, action } = parsed

  const { rows: beforeRows } = await query(
    `SELECT r.id, r.status, r.relation_type, r.confidence, r.evidence_json,
            fo.name AS from_table, fc.name AS from_column,
            tto.name AS to_table, tc.name AS to_column
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects tto ON tto.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.id = $1 AND r.workspace_id = $2`,
    [relationshipId, workspaceId],
  )
  if (!beforeRows[0]) {
    const err = new Error('relationship not found')
    err.status = 404
    throw err
  }
  const before = beforeRows[0]
  if (before.status !== 'suggested') {
    return {
      ok: true,
      already: true,
      status: before.status,
      action,
      workspaceId,
      relationshipId,
      message: `Join already ${before.status}`,
    }
  }

  const nextStatus = action === 'promote' ? 'accepted' : 'rejected'
  const nextType = action === 'promote' ? 'explicit' : before.relation_type
  const nextConfidence = action === 'promote' ? 1 : before.confidence
  const prevEvidence =
    before.evidence_json && typeof before.evidence_json === 'object'
      ? before.evidence_json
      : {}
  const nextEvidence =
    action === 'promote'
      ? {
          ...prevEvidence,
          prePromoteConfidence: Number(before.confidence),
          promotedAt: new Date().toISOString(),
          promotedVia: actorLabel,
        }
      : { ...prevEvidence, rejectedVia: actorLabel }

  await query(
    `UPDATE relationships SET
       status = $3,
       relation_type = $4,
       confidence = $5,
       evidence_json = $6::jsonb,
       updated_at = now()
     WHERE id = $1 AND workspace_id = $2`,
    [
      relationshipId,
      workspaceId,
      nextStatus,
      nextType,
      nextConfidence,
      JSON.stringify(nextEvidence),
    ],
  )

  try {
    await query(
      `INSERT INTO relationship_review_events (
         workspace_id, relationship_id, action, actor_user_id,
         previous_status, previous_type, previous_confidence, evidence_json
       ) VALUES ($1,$2,$3,NULL,$4,$5,$6,$7::jsonb)`,
      [
        workspaceId,
        relationshipId,
        action === 'promote' ? 'promote_chat' : 'reject_chat',
        before.status,
        before.relation_type,
        before.confidence,
        JSON.stringify({ via: actorLabel }),
      ],
    )
  } catch {
    /* optional */
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: null,
    action: action === 'promote' ? 'relationship.promote' : 'relationship.reject',
    resourceType: 'relationship',
    resourceId: relationshipId,
    summary: `${action} via ${actorLabel}: ${before.from_table}.${before.from_column} → ${before.to_table}.${before.to_column}`,
  })

  if (action === 'promote') {
    try {
      await learnRuleFromPromote(workspaceId, {
        fromTable: before.from_table,
        fromColumn: before.from_column,
        toTable: before.to_table,
        toColumn: before.to_column,
        userId: null,
      })
    } catch {
      /* optional */
    }
    void notifyJoinPromoted(workspaceId, {
      summary: `${before.from_table}.${before.from_column} → ${before.to_table}.${before.to_column} (chat approve)`,
    })
  }

  return {
    ok: true,
    already: false,
    status: nextStatus,
    action,
    workspaceId,
    relationshipId,
    join: `${before.from_table}.${before.from_column} → ${before.to_table}.${before.to_column}`,
    message:
      action === 'promote'
        ? 'Promoted from chat. Rule memory updated when new.'
        : 'Rejected from chat.',
  }
}

/**
 * Slack interactive payload handler (form field `payload`).
 */
export async function handleSlackInteractionPayload(rawPayload) {
  let data
  try {
    data = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload
  } catch {
    const err = new Error('invalid Slack payload')
    err.status = 400
    throw err
  }
  const action = data?.actions?.[0]
  const token = action?.value || data?.token
  if (!token) {
    const err = new Error('missing action token')
    err.status = 400
    throw err
  }
  return applyJoinActionFromToken(token, { actorLabel: 'slack' })
}
