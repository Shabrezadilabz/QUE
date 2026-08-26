/**
 * Map physical warehouse tables → industry pack ontology entities.
 */
import { query } from './db.js'
import { leafName } from './inferJoins.js'

/**
 * Build entity mappings from pack matcher results (no DB).
 * @param {object} pack
 * @param {{ matches: object[] }} matchResult
 */
export function buildEntityMappings(pack, matchResult) {
  const matches = matchResult?.matches || []
  return matches.map((m) => ({
    entity: m.entity || m.pattern,
    pattern: m.pattern,
    tableName: m.table,
    connection: m.connection || null,
    columnMap: {},
  }))
}

/**
 * Persist entity mappings for a Monk run (idempotent upsert per entity).
 */
export async function persistEntityMappings(
  workspaceId,
  runId,
  packId,
  mappings,
) {
  const saved = []
  for (const m of mappings || []) {
    const { rows } = await query(
      `INSERT INTO entity_mappings (
         workspace_id, run_id, pack_id, entity, pattern, table_name, connection, column_map
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (workspace_id, pack_id, entity)
       DO UPDATE SET
         run_id = EXCLUDED.run_id,
         pattern = EXCLUDED.pattern,
         table_name = EXCLUDED.table_name,
         connection = EXCLUDED.connection,
         column_map = EXCLUDED.column_map
       RETURNING id, entity, table_name`,
      [
        workspaceId,
        runId,
        packId,
        m.entity,
        m.pattern,
        m.tableName,
        m.connection,
        JSON.stringify(m.columnMap || {}),
      ],
    )
    if (rows[0]) saved.push(rows[0])
  }
  return saved
}

export async function listEntityMappings(workspaceId, packId = null) {
  const params = [workspaceId]
  let sql = `SELECT * FROM entity_mappings WHERE workspace_id = $1`
  if (packId) {
    params.push(packId)
    sql += ` AND pack_id = $${params.length}`
  }
  sql += ` ORDER BY entity ASC`
  const { rows } = await query(sql, params)
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    pattern: r.pattern,
    tableName: r.table_name,
    connection: r.connection,
    columnMap: r.column_map || {},
    packId: r.pack_id,
    runId: r.run_id,
  }))
}

/** Resolve physical table for a pack pattern. */
export function tableForPattern(matches, pattern) {
  const pat = String(pattern || '').toLowerCase()
  const hit = (matches || []).find(
    (m) =>
      String(m.pattern || '').toLowerCase() === pat ||
      leafName(m.table || '').toLowerCase() === pat,
  )
  return hit?.table || null
}

/** Replace `{orders}` style placeholders in SQL templates. */
export function applyTablePlaceholders(sql, matches) {
  let out = String(sql || '')
  for (const m of matches || []) {
    const pat = String(m.pattern || '').toLowerCase()
    const re = new RegExp(`\\{${pat}\\}`, 'gi')
    out = out.replace(re, m.table)
    const leaf = leafName(m.table || '')
    if (leaf && leaf.toLowerCase() !== pat) {
      const reLeaf = new RegExp(`\\{${leaf}\\}`, 'gi')
      out = out.replace(reLeaf, m.table)
    }
  }
  return out
}
