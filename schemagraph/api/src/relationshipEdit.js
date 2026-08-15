/**
 * Production — create / edit join column endpoints (HITL canvas + Join Review).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import {
  getPinnedColumnValues,
  scorePinnedOverlap,
} from './pinnedSamples.js'

function mapRelationship(r) {
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

async function loadColumns(workspaceId, fromColumnId, toColumnId) {
  const { rows: cols } = await query(
    `SELECT c.id, c.name, c.data_type, c.schema_object_id, c.sample_values,
            o.name AS table_name
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
  if (fromCol.schema_object_id === toCol.schema_object_id) {
    const err = new Error('join endpoints must be on different tables')
    err.status = 400
    throw err
  }
  return { fromCol, toCol }
}

/**
 * Retarget join endpoints (any tables/columns in workspace) — canvas pull-thread edit.
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
  const { fromCol, toCol } = await loadColumns(
    workspaceId,
    fromColumnId,
    toColumnId,
  )

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
      weight:
        overlap.band === 'high' ? 0.12 : overlap.band === 'medium' ? 0.06 : 0.02,
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
       from_object_id = $3,
       from_column_id = $4,
       to_object_id = $5,
       to_column_id = $6,
       label = $7,
       join_criteria = $8,
       confidence = $9,
       evidence_json = $10::jsonb,
       ai_notes = $11,
       edited_at = now(),
       edited_by = $12,
       updated_at = now()
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [
      relationshipId,
      workspaceId,
      fromCol.schema_object_id,
      fromColumnId,
      toCol.schema_object_id,
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

  return mapRelationship(rows[0])
}

/**
 * Create a join from canvas Edit mode (drag column → column).
 * Status suggested; Promote still HITL unless caller promotes later.
 */
export async function createManualRelationship(
  workspaceId,
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

  const { fromCol, toCol } = await loadColumns(
    workspaceId,
    fromColumnId,
    toColumnId,
  )

  const { rows: existing } = await query(
    `SELECT id FROM relationships
     WHERE workspace_id = $1
       AND status <> 'rejected'
       AND (
         (from_column_id = $2 AND to_column_id = $3)
         OR (from_column_id = $3 AND to_column_id = $2)
       )
     LIMIT 1`,
    [workspaceId, fromColumnId, toColumnId],
  )
  if (existing[0]) {
    const err = new Error('join already exists between these columns')
    err.status = 409
    err.relationshipId = existing[0].id
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
  const overlap = scorePinnedOverlap(
    fromPinned.length ? fromPinned : fromCol.sample_values,
    toPinned.length ? toPinned : toCol.sample_values,
  )

  const label = `${fromCol.table_name}.${fromCol.name} → ${toCol.table_name}.${toCol.name}`
  const signals = [
    {
      code: 'human_drawn',
      label: 'Drawn on Workspace canvas (Edit mode)',
      weight: 0.2,
    },
  ]
  if (overlap.ratio != null) {
    signals.push({
      code: 'pinned_overlap',
      label: overlap.label,
      weight:
        overlap.band === 'high' ? 0.12 : overlap.band === 'medium' ? 0.06 : 0.02,
    })
  }

  let confidence = 0.55
  if (overlap.band === 'high') confidence = 0.88
  else if (overlap.band === 'medium') confidence = 0.72
  else if (overlap.band === 'low' || overlap.band === 'none') confidence = 0.4

  const evidence = {
    summary: `Human-drawn join · ${overlap.label || 'verify samples before Promote'}`,
    signals,
    pinnedOverlap: overlap,
    drawnAt: new Date().toISOString(),
    scoredAt: new Date().toISOString(),
  }

  const id = randomUUID()
  const { rows } = await query(
    `INSERT INTO relationships (
       id, workspace_id, from_object_id, from_column_id,
       to_object_id, to_column_id, relation_type, status, confidence,
       join_criteria, label, ai_notes, evidence_json, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,'ai-inferred','suggested',$7,$8,$9,$10,$11::jsonb,now(),now()
     )
     RETURNING *`,
    [
      id,
      workspaceId,
      fromCol.schema_object_id,
      fromColumnId,
      toCol.schema_object_id,
      toColumnId,
      confidence,
      `${label} (canvas)`,
      label,
      `Canvas Edit · ${overlap.label || 'HITL Promote required'}`,
      JSON.stringify(evidence),
    ],
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'relationship.create_manual',
    resourceType: 'relationship',
    resourceId: id,
    summary: `Canvas join → ${label}`,
    meta: { fromColumnId, toColumnId, overlapBand: overlap.band },
  })

  return mapRelationship(rows[0])
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
