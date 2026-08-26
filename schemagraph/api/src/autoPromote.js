/**
 * Phase 3 / CEO P0 — Optional Green-tier auto-Promote (default OFF).
 * Requires enableAutoPromoteLowRisk + golden-set recall threshold.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getWorkspaceSettings, updateWorkspaceSettings } from './workspaceSettings.js'
import {
  classifyRiskTier,
  effectiveTier,
  riskContextForWorkspace,
} from './riskTiers.js'

/**
 * Auto-promote qualifying green suggested joins. Returns count promoted.
 */
export async function maybeAutoPromoteLowRisk(workspaceId, userId = null) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings
  if (settings?.enableAutoPromoteLowRisk !== true) {
    return { enabled: false, promoted: 0, skipped: 0, reason: 'disabled' }
  }

  const riskCtx = await riskContextForWorkspace(workspaceId)
  const minRecall = riskCtx.autoPromoteMinRecall
  if (
    Number.isFinite(minRecall) &&
    minRecall > 0 &&
    (riskCtx.lastGoldenRecall == null ||
      riskCtx.lastGoldenRecall < minRecall)
  ) {
    return {
      enabled: true,
      promoted: 0,
      skipped: 0,
      reason: 'golden_recall_below_threshold',
      lastGoldenRecall: riskCtx.lastGoldenRecall,
      autoPromoteMinRecall: minRecall,
    }
  }

  const { rows } = await query(
    `SELECT r.id, r.confidence, r.evidence_json,
            fo.name AS from_table, fc.name AS from_column,
            tto.name AS to_table, tc.name AS to_column,
            c_from.name AS from_connection_name,
            c_to.name AS to_connection_name
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects tto ON tto.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     JOIN connections c_from ON c_from.id = fo.connection_id
     JOIN connections c_to ON c_to.id = tto.connection_id
     WHERE r.workspace_id = $1 AND r.status = 'suggested'
     ORDER BY r.confidence DESC NULLS LAST
     LIMIT 40`,
    [workspaceId],
  )

  let promoted = 0
  let skipped = 0
  const byTier = { green: 0, yellow: 0, red: 0 }

  for (const row of rows) {
    const classified = classifyRiskTier(row.evidence_json, row.confidence, {
      crossSource: row.from_connection_name !== row.to_connection_name,
      lastGoldenRecall: riskCtx.lastGoldenRecall,
      autoPromoteMinRecall: riskCtx.autoPromoteMinRecall,
    })
    const tier = effectiveTier(classified)
    byTier[tier] = (byTier[tier] || 0) + 1
    if (tier !== 'green') {
      skipped += 1
      continue
    }

    await query(
      `UPDATE relationships SET
         status = 'accepted',
         relation_type = 'explicit',
         confidence = 1,
         evidence_json = COALESCE(evidence_json, '{}'::jsonb) || $3::jsonb,
         updated_at = now()
       WHERE id = $1 AND workspace_id = $2 AND status = 'suggested'`,
      [
        row.id,
        workspaceId,
        JSON.stringify({
          riskTier: tier,
          autoPromoted: true,
          riskRationale: classified.rationale,
        }),
      ],
    )
    try {
      await query(
        `INSERT INTO relationship_review_events (
           workspace_id, relationship_id, action, actor_user_id,
           previous_status, previous_type, previous_confidence, evidence_json
         ) VALUES ($1,$2,'auto_promote_green',$3,'suggested',NULL,$4,$5::jsonb)`,
        [
          workspaceId,
          row.id,
          userId,
          row.confidence,
          JSON.stringify({
            ...(row.evidence_json || {}),
            riskTier: tier,
            rationale: classified.rationale,
          }),
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
          'Auto-promoted (green tier + golden gate)',
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
    byTier,
    lastGoldenRecall: riskCtx.lastGoldenRecall,
    autoPromoteMinRecall: minRecall,
  }
}

/**
 * Monk Mode Phase 5 — pack-aware auto-promote without pre-recall gate.
 * Healthcare: ≥95% confidence, same connection only.
 * Other packs: green-tier joins with pack min confidence.
 */
export async function maybeAutoPromoteForMonk(workspaceId, pack, userId = null) {
  const policies = pack?.policies || {}
  if (policies.disableMonkAutopilot) {
    return { enabled: false, promoted: 0, skipped: 0, reason: 'autopilot_disabled' }
  }

  const minConf =
    typeof policies.minJoinPromoteConfidence === 'number'
      ? policies.minJoinPromoteConfidence
      : policies.hipaaStrict
        ? 0.95
        : 0.92
  const allowCrossSource = !(policies.hipaaStrict && policies.noAutoPromoteJoins)

  const riskCtx = await riskContextForWorkspace(workspaceId)
  const recallBypass = {
    ...riskCtx,
    autoPromoteMinRecall: 0,
    lastGoldenRecall: 1,
  }

  const { rows } = await query(
    `SELECT r.id, r.confidence, r.evidence_json,
            fo.name AS from_table, fc.name AS from_column,
            tto.name AS to_table, tc.name AS to_column,
            c_from.name AS from_connection_name,
            c_to.name AS to_connection_name
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects tto ON tto.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     JOIN connections c_from ON c_from.id = fo.connection_id
     JOIN connections c_to ON c_to.id = tto.connection_id
     WHERE r.workspace_id = $1 AND r.status = 'suggested'
     ORDER BY r.confidence DESC NULLS LAST
     LIMIT 60`,
    [workspaceId],
  )

  let promoted = 0
  let skipped = 0
  const byTier = { green: 0, yellow: 0, red: 0 }

  for (const row of rows) {
    const conf = Number(row.confidence)
    const crossSource =
      row.from_connection_name !== row.to_connection_name

    if (!Number.isFinite(conf) || conf < minConf) {
      skipped += 1
      byTier.red += 1
      continue
    }
    if (crossSource && !allowCrossSource) {
      skipped += 1
      byTier.yellow += 1
      continue
    }

    const classified = classifyRiskTier(row.evidence_json, row.confidence, {
      crossSource,
      lastGoldenRecall: recallBypass.lastGoldenRecall,
      autoPromoteMinRecall: recallBypass.autoPromoteMinRecall,
    })
    const tier = effectiveTier(classified)
    byTier[tier] = (byTier[tier] || 0) + 1

    if (tier !== 'green' && conf < 0.96) {
      skipped += 1
      continue
    }

    await query(
      `UPDATE relationships SET
         status = 'accepted',
         relation_type = 'explicit',
         confidence = 1,
         evidence_json = COALESCE(evidence_json, '{}'::jsonb) || $3::jsonb,
         updated_at = now()
       WHERE id = $1 AND workspace_id = $2 AND status = 'suggested'`,
      [
        row.id,
        workspaceId,
        JSON.stringify({
          riskTier: tier,
          autoPromoted: true,
          monkAutopilot: true,
          packId: pack?.id || null,
          riskRationale: classified.rationale,
        }),
      ],
    )
    try {
      await query(
        `INSERT INTO relationship_review_events (
           workspace_id, relationship_id, action, actor_user_id,
           previous_status, previous_type, previous_confidence, evidence_json
         ) VALUES ($1,$2,'auto_promote_monk',$3,'suggested',NULL,$4,$5::jsonb)`,
        [
          workspaceId,
          row.id,
          userId,
          row.confidence,
          JSON.stringify({
            ...(row.evidence_json || {}),
            riskTier: tier,
            packId: pack?.id,
            rationale: classified.rationale,
          }),
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
          `Monk autopilot (${pack?.id || 'pack'})`,
        ],
      )
    } catch {
      /* optional */
    }
    promoted += 1
  }

  return {
    enabled: true,
    monkAutopilot: true,
    packId: pack?.id || null,
    promoted,
    skipped,
    byTier,
    minConfidence: minConf,
    allowCrossSource,
  }
}

/**
 * Persist last golden eval onto workspace settings for Green gating.
 */
export async function recordGoldenEvalScore(workspaceId, report) {
  if (!report || typeof report !== 'object') return
  const recall = Number(report.recall)
  const precision = Number(report.precision)
  await updateWorkspaceSettings(workspaceId, {
    lastGoldenEval: {
      recall: Number.isFinite(recall) ? recall : null,
      precision: Number.isFinite(precision) ? precision : null,
      at: new Date().toISOString(),
      pairCount: report.pairCount ?? report.matched ?? null,
    },
  })
}
