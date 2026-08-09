/**
 * Production — edit join column endpoints before Promote (HITL).
 */
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import {
  getPinnedColumnValues,
  scorePinnedOverlap,
} from './pinnedSamples.js'

/**
 * @param {string} workspaceId
 * @param {string} relationshipId
 * @param {{ fromColumnId: string, toColumnId: string, userId?: string|null }} body
 */
export async function editRelationshipColumns(
  workspaceId,
  relationshipId,
  { fromColumnId, toColumnId, userId = null } = {},
) {
  if (!fromColumnId || !toColumnId) {
    const err = new Error('fromColumnId and toColumnId required')
    err.status = 400
    throw err
  }
  if (fromColumnId === toColumnId) {
    const err = new Error('from and to columns must differ')
    err.status = 400
    throw err
  }

  const { rows: rels } = await query(
    `SELECT * FROM relationships WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, relationshipId],
  )
  if (!rels[0]) {
    const err = new Error('relationship not found')
    err.status = 404
    throw err
  }
  const rel = rels[0]

  const { rows: cols } = await query(
    `SELECT c.id, c.name, c.data_type, c.schema_object_id, o.name AS table_name
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     WHERE c.workspace_id = $1 AND c.id = ANY($2::uuid[])`,
    [workspaceId, [fromColumnId, toColumnId]],
  )
  const fromCol = cols.find((c) => c.id === fromColumnId)
  const toCol = cols.find((c) => c.id === toColumnId)
  if (!fromCol || !toCol) {
    const err = new Error('column not found in workspace')
    err.status = 404
    throw err
  }
  if (fromCol.schema_object_id !== rel.from_object_id) {
    const err = new Error('fromColumnId must belong to the from table')
    err.status = 400
    throw err
  }
  if (toCol.schema_object_id !== rel.to_object_id) {
    const err = new Error('toColumnId must belong to the to table')
    err.status = 400
    throw err
  }

  const fromPinned = await getPinnedColumnValues(
    workspaceId,
    fromCol.table_name,
    fromCol.name,
  )
  const toPinned = await getPinnedColumnValues(
    workspaceId,
    toCol.table_name,
    toCol.name,
  )
  const overlap = scorePinnedOverlap(fromPinned, toPinned)

  const prevEvidence =
    rel.evidence_json && typeof rel.evidence_json === 'object'
      ? rel.evidence_json
      : {}
  const signals = Array.isArray(prevEvidence.signals)
    ? [...prevEvidence.signals]
    : []
  signals.push({
    code: 'human_edit',
    label: `Columns edited → ${fromCol.table_name}.${fromCol.name} = ${toCol.table_name}.${toCol.name}`,
    weight: 0.05,
  })
  if (overlap.ratio != null) {
    signals.push({
      code: 'pinned_overlap',
      label: overlap.label,
      weight: overlap.band === 'high' ? 0.12 : overlap.band === 'medium' ? 0.06 : 0.02,
    })
  }

  let confidence = Number(rel.confidence) || 0.5
  if (overlap.confidenceHint != null) {
    confidence = Math.min(
      0.95,
      Math.max(confidence, overlap.confidenceHint),
    )
  } else {
    confidence = Math.min(0.95, confidence + 0.03)
  }

  const label = `${fromCol.table_name}.${fromCol.name} → ${toCol.table_name}.${toCol.name}`
  const joinCriteria = `${label} (human-edited)`
  const evidence = {
    ...prevEvidence,
    summary: overlap.label || prevEvidence.summary || 'Human-edited join columns',
    signals,
    pinnedOverlap: overlap,
    editedAt: new Date().toISOString(),
    scoredAt: new Date().toISOString(),
  }

  const { rows } = await query(
    `UPDATE relationships SET
       from_column_id = $3,
       to_column_id = $4,
       label = $5,
       join_criteria = $6,
       confidence = $7,
       evidence_json = $8::jsonb,
       ai_notes = $9,
       edited_at = now(),
       edited_by = $10,
       updated_at = now()
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [
      relationshipId,
      workspaceId,
      fromColumnId,
      toColumnId,
      label,
      joinCriteria,
      confidence,
      JSON.stringify(evidence),
      `Edited join · ${overlap.label || 'review samples before Promote'}`,
      userId,
    ],
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'relationship.edit',
    resourceType: 'relationship',
    resourceId: relationshipId,
    summary: `Edited join columns → ${label}`,
    meta: { fromColumnId, toColumnId, overlapBand: overlap.band },
  })

  const r = rows[0]
  return {
    id: r.id,
    fromTableId: r.from_object_id,
    fromColumnId: r.from_column_id,
    toTableId: r.to_object_id,
    toColumnId: r.to_column_id,
    type: r.relation_type,
    kind: r.relation_type === 'ai-inferred' ? 'inferred' : 'fk',
    status: r.status,
    confidence: Number(r.confidence),
    fromId: r.from_column_id,
    toId: r.to_column_id,
    joinCriteria: r.join_criteria ?? undefined,
    label: r.label ?? undefined,
    aiNotes: r.ai_notes ?? undefined,
    evidence:
      r.evidence_json && typeof r.evidence_json === 'object'
        ? r.evidence_json
        : undefined,
  }
}

/**
 * Columns available for join edit on a table.
 */
export async function listTableColumns(workspaceId, schemaObjectId) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.data_type, c.key_kind, o.name AS table_name
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     WHERE c.workspace_id = $1 AND c.schema_object_id = $2
     ORDER BY c.ordinal, c.name`,
    [workspaceId, schemaObjectId],
  )
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    dataType: c.data_type,
    keyKind: c.key_kind,
    tableName: c.table_name,
  }))
}
