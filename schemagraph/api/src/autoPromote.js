/**
 * Phase 3 — Optional low-risk auto-Promote (default OFF).
 * Only promotes suggested joins that meet a strict confidence + evidence bar.
 * Never used unless workspace settings.enableAutoPromoteLowRisk === true.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'

const LOW_RISK_MIN_CONFIDENCE = 0.92

function isLowRiskEvidence(evidence, confidence) {
  const conf = Number(confidence)
  if (!Number.isFinite(conf) || conf < LOW_RISK_MIN_CONFIDENCE) return false
  const ev = evidence && typeof evidence === 'object' ? evidence : {}
  const reasons = [
    ...(Array.isArray(ev.reasons) ? ev.reasons : []),
    ...(Array.isArray(ev.signals) ? ev.signals : []),
    String(ev.reason || ''),
    String(ev.method || ''),
  ]
    .join(' ')
    .toLowerCase()
  // Prefer exact/name/FK style evidence — refuse purely opaque AI scores
  const hasSafeSignal =
    /exact|name.?match|fk|primary.?key|foreign.?key|same.?name|query.?history/.test(
      reasons,
    ) ||
    ev.nameMatch === true ||
    ev.fk === true ||
    Number(ev.nameSimilarity) >= 0.95
  return hasSafeSignal
}

/**
 * Auto-promote qualifying suggested joins. Returns count promoted.
 */
export async function maybeAutoPromoteLowRisk(workspaceId, userId = null) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings
  if (settings?.enableAutoPromoteLowRisk !== true) {
    return { enabled: false, promoted: 0, skipped: 0 }
  }

  const { rows } = await query(
    `SELECT r.id, r.confidence, r.evidence_json,
            fo.name AS from_table, fc.name AS from_column,
            tto.name AS to_table, tc.name AS to_column
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects tto ON tto.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1 AND r.status = 'suggested'
     ORDER BY r.confidence DESC NULLS LAST
     LIMIT 40`,
    [workspaceId],
  )

  let promoted = 0
  let skipped = 0
  for (const row of rows) {
    if (!isLowRiskEvidence(row.evidence_json, row.confidence)) {
      skipped += 1
      continue
    }
    await query(
      `UPDATE relationships SET
         status = 'accepted',
         relation_type = 'explicit',
         confidence = 1,
         updated_at = now()
       WHERE id = $1 AND workspace_id = $2 AND status = 'suggested'`,
      [row.id, workspaceId],
    )
    try {
      await query(
        `INSERT INTO relationship_review_events (
           workspace_id, relationship_id, action, actor_user_id,
           previous_status, previous_type, previous_confidence, evidence_json
         ) VALUES ($1,$2,'auto_promote_low_risk',$3,'suggested',NULL,$4,$5::jsonb)`,
        [
          workspaceId,
          row.id,
          userId,
          row.confidence,
          JSON.stringify(row.evidence_json || {}),
        ],
      )
    } catch {
      /* audit optional */
    }
    try {
      await query(
        `INSERT INTO join_memory (
           id, workspace_id, from_table, from_column, to_table, to_column,
           relationship_id, accepted_by, note
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (workspace_id, from_table, from_column, to_table, to_column)
         DO UPDATE SET relationship_id = EXCLUDED.relationship_id,
                       accepted_by = EXCLUDED.accepted_by`,
        [
          randomUUID(),
          workspaceId,
          row.from_table,
          row.from_column || '',
          row.to_table,
          row.to_column || '',
          row.id,
          userId || null,
          'Auto-promoted (low-risk policy)',
        ],
      )
    } catch {
      /* optional */
    }
    promoted += 1
  }

  return {
    enabled: true,
    promoted,
    skipped,
    minConfidence: LOW_RISK_MIN_CONFIDENCE,
  }
}
