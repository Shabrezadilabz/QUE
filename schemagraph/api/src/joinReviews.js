/**
 * Wave 2.1 — Join review inbox.
 * Queue of suggested (HITL) joins with evidence for Promote / Reject.
 */
import { query } from './db.js'
import {
  getPinnedColumnValues,
  scorePinnedOverlap,
} from './pinnedSamples.js'

/**
 * @param {string} workspaceId
 * @param {{ status?: string, limit?: number }} [opts]
 */
export async function listJoinReviews(workspaceId, opts = {}) {
  const status = opts.status ? String(opts.status) : 'suggested'
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 300)

  const allowed = ['suggested', 'accepted', 'rejected', 'all']
  const statusFilter = allowed.includes(status) ? status : 'suggested'

  const params = [workspaceId]
  let statusSql = `AND r.status = 'suggested' AND r.relation_type = 'ai-inferred'`
  if (statusFilter === 'accepted') {
    statusSql = `AND r.status = 'accepted'`
  } else if (statusFilter === 'rejected') {
    statusSql = `AND r.status = 'rejected'`
  } else if (statusFilter === 'all') {
    statusSql = ``
  }

  params.push(limit)
  const { rows } = await query(
    `SELECT
       r.id,
       r.status,
       r.relation_type,
       r.confidence,
       r.join_criteria,
       r.label,
       r.ai_notes,
       r.evidence_json,
       r.created_at,
       r.updated_at,
       fo.id AS from_table_id,
       fo.name AS from_table,
       fo.source_label AS from_source_label,
       fc.id AS from_column_id,
       fc.name AS from_column,
       fc.data_type AS from_data_type,
       fc.sample_values AS from_samples,
       too.id AS to_table_id,
       too.name AS to_table,
       too.source_label AS to_source_label,
       tc.id AS to_column_id,
       tc.name AS to_column,
       tc.data_type AS to_data_type,
       tc.sample_values AS to_samples,
       c_from.name AS from_connection_name,
       c_from.source_type AS from_source_type,
       c_to.name AS to_connection_name,
       c_to.source_type AS to_source_type
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects too ON too.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     JOIN connections c_from ON c_from.id = fo.connection_id
     JOIN connections c_to ON c_to.id = too.connection_id
     WHERE r.workspace_id = $1
       ${statusSql}
     ORDER BY
       CASE WHEN r.status = 'suggested' THEN 0 ELSE 1 END,
       r.confidence DESC NULLS LAST,
       r.created_at DESC
     LIMIT $2`,
    params,
  )

  const items = []
  for (const r of rows) {
    const evidence =
      r.evidence_json && typeof r.evidence_json === 'object'
        ? r.evidence_json
        : {}
    const signals = Array.isArray(evidence.signals) ? [...evidence.signals] : []
    let pinnedOverlap = evidence.pinnedOverlap || null
    let fromSamples = Array.isArray(r.from_samples)
      ? r.from_samples.slice(0, 10)
      : []
    let toSamples = Array.isArray(r.to_samples) ? r.to_samples.slice(0, 10) : []
    try {
      const fromPinned = await getPinnedColumnValues(
        workspaceId,
        r.from_table,
        r.from_column,
      )
      const toPinned = await getPinnedColumnValues(
        workspaceId,
        r.to_table,
        r.to_column,
      )
      if (fromPinned.length) fromSamples = fromPinned.slice(0, 10)
      if (toPinned.length) toSamples = toPinned.slice(0, 10)
      if (fromPinned.length && toPinned.length) {
        pinnedOverlap = scorePinnedOverlap(fromPinned, toPinned)
        if (!signals.some((s) => s.code === 'pinned_overlap')) {
          signals.push({
            code: 'pinned_overlap',
            label: pinnedOverlap.label,
            weight:
              pinnedOverlap.band === 'high'
                ? 0.12
                : pinnedOverlap.band === 'medium'
                  ? 0.06
                  : 0.02,
          })
        }
      }
    } catch {
      /* pins optional until migrate */
    }
    items.push({
      id: r.id,
      status: r.status,
      type: r.relation_type,
      confidence: Number(r.confidence),
      joinCriteria: r.join_criteria || null,
      label: r.label || null,
      aiNotes: r.ai_notes || null,
      evidence: {
        summary:
          pinnedOverlap?.label || evidence.summary || r.ai_notes || null,
        signals,
        scoredAt: evidence.scoredAt || null,
        pinnedOverlap,
        prePromoteConfidence: evidence.prePromoteConfidence ?? null,
      },
      risk: null, // filled below with workspace risk context
      from: {
        tableId: r.from_table_id,
        table: r.from_table,
        columnId: r.from_column_id,
        column: r.from_column,
        dataType: r.from_data_type,
        samples: fromSamples,
        connection: r.from_connection_name,
        sourceType: r.from_source_type,
        sourceLabel: r.from_source_label,
      },
      to: {
        tableId: r.to_table_id,
        table: r.to_table,
        columnId: r.to_column_id,
        column: r.to_column,
        dataType: r.to_data_type,
        samples: toSamples,
        connection: r.to_connection_name,
        sourceType: r.to_source_type,
        sourceLabel: r.to_source_label,
      },
      crossSource: r.from_connection_name !== r.to_connection_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })
  }

  const { classifyRiskTier, effectiveTier, riskContextForWorkspace } =
    await import('./riskTiers.js')
  const riskCtx = await riskContextForWorkspace(workspaceId)
  for (const item of items) {
    const classified = classifyRiskTier(item.evidence, item.confidence, {
      crossSource: item.crossSource,
      lastGoldenRecall: riskCtx.lastGoldenRecall,
      autoPromoteMinRecall: riskCtx.autoPromoteMinRecall,
    })
    item.risk = {
      ...classified,
      effectiveTier: effectiveTier(classified),
    }
  }

  const { rows: counts } = await query(
    `SELECT
       COUNT(*) FILTER (
         WHERE status = 'suggested' AND relation_type = 'ai-inferred'
       )::int AS pending,
       COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
       COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
     FROM relationships
     WHERE workspace_id = $1`,
    [workspaceId],
  )

  return {
    items,
    summary: {
      pending: counts[0]?.pending ?? 0,
      accepted: counts[0]?.accepted ?? 0,
      rejected: counts[0]?.rejected ?? 0,
    },
  }
}
