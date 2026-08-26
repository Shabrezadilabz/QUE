/**
 * Column-level entity mapping editor (Pack Studio).
 */
import { query } from './db.js'
import { listEntityMappings } from './templateMapper.js'
import { applyTablePlaceholders } from './templateMapper.js'

export async function updateEntityColumnMap(
  workspaceId,
  packId,
  entity,
  columnMap,
) {
  const map =
    columnMap && typeof columnMap === 'object' ? columnMap : {}
  const { rows } = await query(
    `UPDATE entity_mappings
     SET column_map = $4::jsonb
     WHERE workspace_id = $1 AND pack_id = $2 AND entity = $3
     RETURNING *`,
    [workspaceId, packId, entity, JSON.stringify(map)],
  )
  if (!rows[0]) {
    const err = new Error('entity mapping not found')
    err.status = 404
    throw err
  }
  return {
    entity: rows[0].entity,
    tableName: rows[0].table_name,
    columnMap: rows[0].column_map || {},
  }
}

export async function bulkUpdateColumnMaps(workspaceId, packId, mappings) {
  const out = []
  for (const m of mappings || []) {
    if (!m.entity) continue
    out.push(
      await updateEntityColumnMap(workspaceId, packId, m.entity, m.columnMap),
    )
  }
  return out
}

/**
 * Rewrite KPI SQL using column_map aliases on entity mappings.
 * e.g. { order_total: 'revenue_amt' } on FactOrder entity.
 */
export async function applyColumnMapsToKpiSql(
  workspaceId,
  packId,
  sqlTemplate,
  matches,
) {
  const entities = await listEntityMappings(workspaceId, packId)
  let sql = applyTablePlaceholders(sqlTemplate, matches)
  for (const ent of entities) {
    const colMap = ent.columnMap || {}
    for (const [logical, physical] of Object.entries(colMap)) {
      if (!logical || !physical) continue
      const re = new RegExp(`\\b${logical}\\b`, 'gi')
      sql = sql.replace(re, physical)
    }
  }
  return sql
}
