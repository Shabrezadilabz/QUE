/**
 * Phase 3 — register materialized / warehouse objects on the workspace graph.
 */
import { randomUUID } from 'node:crypto'
import { query, pool } from './db.js'
import { quoteIdent, warehouseSchemaName } from './queWarehouse.js'

/** @param {string|null} schema @param {string} objectName */
export function materializedGraphObjectName(schema, objectName) {
  const n = String(objectName || '').trim()
  const s = schema ? String(schema).trim() : ''
  return s ? `${s}.${n}` : n
}

/**
 * Introspect column metadata from Postgres (source or Que Warehouse schema).
 */
export async function fetchPostgresTableColumns(config, schema, tableName) {
  const { withSourceClient } = await import('./connectors/postgres.js')
  const sch = schema || 'public'
  const tbl = String(tableName || '').trim()
  if (!tbl) return []

  if (config?.queWarehouse && config?.workspaceId) {
    const whSchema = config.schema || warehouseSchemaName(config.workspaceId)
    const client = await pool.connect()
    try {
      await client.query(
        `SET search_path TO ${quoteIdent(whSchema)}, public`,
      )
      const { rows } = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [whSchema, tbl],
      )
      return rows.map((r) => ({
        name: r.column_name,
        dataType: r.data_type,
        isNullable: r.is_nullable === 'YES',
      }))
    } finally {
      client.release()
    }
  }

  return withSourceClient(config, async (client) => {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [sch, tbl],
    )
    return rows.map((r) => ({
      name: r.column_name,
      dataType: r.data_type,
      isNullable: r.is_nullable === 'YES',
    }))
  })
}

/**
 * Upsert a materialized table/view on the workspace schema graph.
 * @param {string} workspaceId
 * @param {object} connection resolved live target (real connection UUID)
 * @param {{ kind: string, schema: string|null, objectName: string, qualifiedName: string, jobId: string, materializationId?: string }} details
 */
export async function registerMaterializedObjectOnGraph(
  workspaceId,
  connection,
  details,
) {
  const connId = connection?.id
  if (!connId || String(connId).startsWith('que-wh-')) {
    return { registered: false, reason: 'virtual_connection' }
  }

  const name =
    details.qualifiedName ||
    materializedGraphObjectName(details.schema, details.objectName)
  const entityKind = details.kind === 'view' ? 'VIEW' : 'TABLE'
  const sourceLabel = `materialized:job:${details.jobId}`

  let objectId = randomUUID()
  await query(
    `INSERT INTO schema_objects (
       id, workspace_id, connection_id, name, entity_kind, source_label
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (connection_id, name) DO UPDATE SET
       entity_kind = EXCLUDED.entity_kind,
       source_label = EXCLUDED.source_label,
       updated_at = now()`,
    [objectId, workspaceId, connId, name, entityKind, sourceLabel],
  )

  const { rows: objRows } = await query(
    `SELECT id FROM schema_objects WHERE connection_id = $1 AND name = $2`,
    [connId, name],
  )
  objectId = objRows[0]?.id || objectId

  let columnsSynced = 0
  if (connection.type === 'postgresql') {
    try {
      const cols = await fetchPostgresTableColumns(
        connection.config,
        details.schema,
        details.objectName,
      )
      const { rows: existingCols } = await query(
        `SELECT id, name FROM schema_columns WHERE schema_object_id = $1`,
        [objectId],
      )
      const existingByName = new Map(existingCols.map((c) => [c.name, c.id]))
      const seen = new Set()

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]
        seen.add(col.name)
        const colId = existingByName.get(col.name) ?? randomUUID()
        await query(
          `INSERT INTO schema_columns (
             id, workspace_id, schema_object_id, name, data_type, key_kind,
             is_nullable, ordinal
           ) VALUES ($1,$2,$3,$4,$5,'none',$6,$7)
           ON CONFLICT (schema_object_id, name) DO UPDATE SET
             data_type = EXCLUDED.data_type,
             is_nullable = EXCLUDED.is_nullable,
             ordinal = EXCLUDED.ordinal`,
          [
            colId,
            workspaceId,
            objectId,
            col.name,
            col.dataType || 'text',
            col.isNullable !== false,
            i,
          ],
        )
        columnsSynced += 1
      }

      for (const [colName, colId] of existingByName) {
        if (!seen.has(colName)) {
          await query(`DELETE FROM schema_columns WHERE id = $1`, [colId])
        }
      }
    } catch (err) {
      console.warn('[Que] materialize graph columns skipped:', err.message || err)
    }
  }

  try {
    const { emitWorkspaceEvent } = await import('./ssm/workspaceEvents.js')
    await emitWorkspaceEvent(workspaceId, 'job_run_completed', {
      jobId: details.jobId,
      materializationId: details.materializationId,
      tableName: name,
      kind: details.kind,
      columnsSynced,
    })
  } catch {
    /* event log optional */
  }

  return {
    registered: true,
    objectId,
    name,
    entityKind,
    columnsSynced,
  }
}
