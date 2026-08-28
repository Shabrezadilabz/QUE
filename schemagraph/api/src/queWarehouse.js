/**
 * Phase 1 — Que Warehouse per workspace.
 * Isolated Postgres schema (wh_{workspace}) + raw replicate from connectors.
 */
import { query, pool } from './db.js'
import { withSourceClient } from './connectors/postgres.js'

/** @param {string} workspaceId */
export function warehouseSchemaName(workspaceId) {
  const compact = String(workspaceId || '')
    .replace(/-/g, '')
    .toLowerCase()
  return `wh_${compact.slice(0, 48)}`
}

/** @param {string} name */
export function connectionSlug(name) {
  return (
    String(name || 'conn')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32) || 'conn'
  )
}

/** @param {string} connSlug @param {string} tableName */
export function rawTableName(connSlug, tableName) {
  const t = String(tableName || 'table')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .slice(0, 48)
  return `raw_${connSlug}_${t}`.slice(0, 63)
}

/** @param {string} id */
export function quoteIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`
}

function mapRegistry(row) {
  if (!row) return null
  return {
    workspaceId: row.workspace_id,
    schemaName: row.schema_name,
    status: row.status,
    provisionedAt: row.provisioned_at,
    meta: row.meta_json || {},
  }
}

/** Provision isolated schema + registry row. */
export async function provisionQueWarehouse(workspaceId) {
  const schemaName = warehouseSchemaName(workspaceId)
  await query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`)
  await query(
    `INSERT INTO que_warehouse_registry (workspace_id, schema_name, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (workspace_id) DO UPDATE SET
       schema_name = EXCLUDED.schema_name,
       status = 'active'`,
    [workspaceId, schemaName],
  )
  return { workspaceId, schemaName, status: 'active' }
}

export async function getWarehouseRegistry(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM que_warehouse_registry WHERE workspace_id = $1`,
    [workspaceId],
  )
  return mapRegistry(rows[0])
}

export async function ensureQueWarehouse(workspaceId) {
  const existing = await getWarehouseRegistry(workspaceId)
  if (existing) return existing
  return provisionQueWarehouse(workspaceId)
}

/** Cap table list for warehouse replicate (Postgres + sample paths). */
export function sliceTablesForReplicate(tables, max = 40) {
  return (tables || []).slice(0, max)
}

/** @param {object} prefs workspace settings */
export function shouldReplicateToWarehouse(prefs, connectionRow, config = {}) {
  if (prefs?.enableQueWarehouse === false) return false
  if (prefs?.replicateToWarehouseDefault === false) return false
  if (connectionRow?.replicate_to_warehouse === false) return false
  if (config.replicateToWarehouse === false) return false
  return true
}

/** Phase 1 prod — readiness for Load hub / exit criteria. */
export function summarizePhase1Readiness(input = {}) {
  const provisioned = Boolean(input.provisioned)
  const rawTableCount = input.rawTableCount ?? 0
  const connectorCount = input.connectorCount ?? 0
  const replicateDefaultOn = input.replicateDefaultOn !== false

  let status = 'empty'
  if (provisioned && rawTableCount >= 1) status = 'ready'
  else if (provisioned || connectorCount > 0) status = 'review'

  return {
    status,
    provisioned,
    rawTableCount,
    connectorCount,
    replicateDefaultOn,
    label:
      status === 'ready'
        ? 'Warehouse ready — raw replicate active'
        : provisioned
          ? 'Sync a connector to land raw tables'
          : connectorCount > 0
            ? 'Provision Que Warehouse'
            : 'Add a connector to begin',
  }
}

/** Whether UI should show Monk prompt for this connection after sync. */
export function shouldShowMonkPrompt(connectionRow) {
  if (!connectionRow) return false
  if (connectionRow.monk_prompt_dismissed) return false
  return true
}

function pgTypeFromDataType(dataType) {
  const t = String(dataType || 'text').toLowerCase()
  if (t.includes('int')) return 'BIGINT'
  if (t.includes('bool')) return 'BOOLEAN'
  if (t.includes('numeric') || t.includes('decimal') || t.includes('money'))
    return 'NUMERIC'
  if (t.includes('float') || t.includes('double') || t.includes('real'))
    return 'DOUBLE PRECISION'
  if (t.includes('timestamp') || t.includes('datetime')) return 'TIMESTAMPTZ'
  if (t.includes('date') && !t.includes('datetime')) return 'DATE'
  if (t.includes('json')) return 'JSONB'
  if (t.includes('uuid')) return 'UUID'
  return 'TEXT'
}

async function upsertWarehouseTableMeta(
  workspaceId,
  connectionId,
  sourceTable,
  rawName,
  rowCount,
) {
  await query(
    `INSERT INTO que_warehouse_tables (
       workspace_id, connection_id, source_table, raw_table_name,
       row_count, last_replicated_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,now(),now())
     ON CONFLICT (workspace_id, raw_table_name) DO UPDATE SET
       connection_id = EXCLUDED.connection_id,
       source_table = EXCLUDED.source_table,
       row_count = EXCLUDED.row_count,
       last_replicated_at = now(),
       updated_at = now()`,
    [workspaceId, connectionId, sourceTable, rawName, rowCount],
  )
}

/**
 * Copy introspected tables into workspace warehouse (Postgres sources).
 * @param {object} opts
 */
export async function replicateConnectionToWarehouse(opts) {
  const {
    workspaceId,
    connectionId,
    connectionName,
    sourceType,
    sourceConfig,
    tables,
    maxRowsPerTable = 100_000,
  } = opts

  const reg = await ensureQueWarehouse(workspaceId)
  const slug = connectionSlug(connectionName)
  const whSchema = reg.schemaName
  const tableList = sliceTablesForReplicate(tables)
  const cap = Math.min(Math.max(Number(maxRowsPerTable) || 100_000, 100), 500_000)

  if (String(sourceType).toLowerCase() !== 'postgresql') {
    return replicateSampleTablesToWarehouse({
      workspaceId,
      connectionId,
      connectionName,
      tables: tableList,
      whSchema,
      slug,
    })
  }

  const srcSchema = sourceConfig.schema || 'public'
  const results = []
  let totalRows = 0
  const whSchemaQ = quoteIdent(whSchema)

  await withSourceClient(sourceConfig, async (srcClient) => {
    for (const table of tableList) {
      const srcTable = table.name
      if (!srcTable) continue
      const destName = rawTableName(slug, srcTable)
      const fqDest = `${whSchemaQ}.${quoteIdent(destName)}`
      const fqSrc = `${quoteIdent(srcSchema)}.${quoteIdent(srcTable)}`

      try {
        const countRes = await srcClient.query(
          `SELECT COUNT(*)::bigint AS n FROM ${fqSrc}`,
        )
        const srcCount = Number(countRes.rows[0]?.n || 0)
        const limit = Math.min(srcCount, cap)

        const colRes = await srcClient.query(
          `SELECT column_name, data_type
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [srcSchema, srcTable],
        )
        const cols = colRes.rows.length
          ? colRes.rows
          : (table.columns || []).map((c) => ({
              column_name: c.name,
              data_type: c.dataType || 'text',
            }))

        if (cols.length === 0) continue

        const colDefs = cols
          .map(
            (c) =>
              `${quoteIdent(c.column_name)} ${pgTypeFromDataType(c.data_type)}`,
          )
          .join(', ')

        await query(`DROP TABLE IF EXISTS ${fqDest}`)
        await query(`CREATE TABLE ${fqDest} (${colDefs})`)

        if (limit > 0) {
          const sel = await srcClient.query(
            `SELECT * FROM ${fqSrc} LIMIT $1`,
            [limit],
          )
          const colNames = cols.map((c) => c.column_name)
          for (const row of sel.rows) {
            const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ')
            const values = colNames.map((n) => row[n])
            await query(
              `INSERT INTO ${fqDest} (${colNames.map(quoteIdent).join(', ')})
               VALUES (${placeholders})`,
              values,
            )
          }
        }

        totalRows += limit
        results.push({
          sourceTable: srcTable,
          rawTableName: destName,
          rowCount: limit,
          capped: srcCount > cap,
        })
        await upsertWarehouseTableMeta(
          workspaceId,
          connectionId,
          srcTable,
          destName,
          limit,
        )
      } catch (err) {
        results.push({
          sourceTable: srcTable,
          rawTableName: destName,
          error: String(err.message || err).slice(0, 240),
        })
      }
    }
  })

  await query(
    `UPDATE connections SET monk_prompt_last_sync_at = now() WHERE id = $1`,
    [connectionId],
  )

  return {
    replicated: true,
    schemaName: whSchema,
    tables: results,
    totalRows,
    showMonkPrompt: true,
  }
}

export async function listWarehouseTables(workspaceId) {
  const { rows } = await query(
    `SELECT raw_table_name, source_table, row_count, last_replicated_at, connection_id
     FROM que_warehouse_tables
     WHERE workspace_id = $1
     ORDER BY last_replicated_at DESC NULLS LAST`,
    [workspaceId],
  )
  return rows.map((r) => ({
    rawTableName: r.raw_table_name,
    sourceTable: r.source_table,
    rowCount: Number(r.row_count || 0),
    lastReplicatedAt: r.last_replicated_at,
    connectionId: r.connection_id,
  }))
}

/**
 * Sample replicate for non-Postgres connectors (scrubbed introspection rows).
 */
async function replicateSampleTablesToWarehouse(opts) {
  const {
    workspaceId,
    connectionId,
    connectionName,
    tables,
    whSchema,
    slug,
  } = opts
  const whSchemaQ = quoteIdent(whSchema)
  const connSlug = slug || connectionSlug(connectionName)
  const tableList = sliceTablesForReplicate(tables)
  const results = []
  let totalRows = 0

  for (const table of tableList) {
    const cols = table.columns || []
    if (!cols.length || !table.name) continue
    const destName = rawTableName(connSlug, table.name)
    const fqDest = `${whSchemaQ}.${quoteIdent(destName)}`
    const colDefs = cols
      .map(
        (c) =>
          `${quoteIdent(c.name)} ${pgTypeFromDataType(c.dataType)}`,
      )
      .join(', ')
    try {
      await query(`DROP TABLE IF EXISTS ${fqDest}`)
      await query(`CREATE TABLE ${fqDest} (${colDefs})`)
      const maxSamples = Math.max(
        ...cols.map((c) => (c.sampleValues || []).length),
        0,
      )
      const rowCount = Math.min(maxSamples, 100)
      for (let i = 0; i < rowCount; i += 1) {
        const values = cols.map((c) => (c.sampleValues || [])[i] ?? null)
        const placeholders = values.map((_, j) => `$${j + 1}`).join(', ')
        await query(
          `INSERT INTO ${fqDest} (${cols.map((c) => quoteIdent(c.name)).join(', ')})
           VALUES (${placeholders})`,
          values,
        )
      }
      totalRows += rowCount
      results.push({
        sourceTable: table.name,
        rawTableName: destName,
        rowCount,
        mode: 'sample_replicate',
      })
      await upsertWarehouseTableMeta(
        workspaceId,
        connectionId,
        table.name,
        destName,
        rowCount,
      )
    } catch (err) {
      results.push({
        sourceTable: table.name,
        rawTableName: destName,
        error: String(err.message || err).slice(0, 240),
      })
    }
  }

  await query(
    `UPDATE connections SET monk_prompt_last_sync_at = now() WHERE id = $1`,
    [connectionId],
  )

  return {
    replicated: results.some((r) => !r.error),
    schemaName: whSchema,
    tables: results,
    totalRows,
    mode: 'sample_replicate',
    showMonkPrompt: true,
  }
}

export async function getWarehouseStatus(workspaceId, opts = {}) {
  const autoProvision = opts.autoProvision !== false
  const reg = autoProvision
    ? await ensureQueWarehouse(workspaceId)
    : await getWarehouseRegistry(workspaceId)
  const tables = reg ? await listWarehouseTables(workspaceId) : []

  let replicateDefaultOn = true
  let connectorCount = 0
  try {
    const { getWorkspaceSettings } = await import('./workspaceSettings.js')
    const ws = await getWorkspaceSettings(workspaceId)
    const prefs = ws?.settings || {}
    replicateDefaultOn =
      prefs.enableQueWarehouse !== false &&
      prefs.replicateToWarehouseDefault !== false
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM connections WHERE workspace_id = $1`,
      [workspaceId],
    )
    connectorCount = rows[0]?.n ?? 0
  } catch {
    /* optional */
  }

  const readiness = summarizePhase1Readiness({
    provisioned: Boolean(reg),
    rawTableCount: tables.length,
    connectorCount,
    replicateDefaultOn,
  })

  return {
    provisioned: Boolean(reg),
    registry: reg,
    tableCount: tables.length,
    totalRows: tables.reduce((s, t) => s + t.rowCount, 0),
    tables: tables.slice(0, 50),
    replicateDefaultOn,
    connectorCount,
    readiness,
  }
}

/** Live SQL target — Que Warehouse schema on metadata Postgres. */
export async function getWarehouseLiveConnection(workspaceId) {
  const reg = await getWarehouseRegistry(workspaceId)
  if (!reg) return null
  return {
    id: `que-wh-${workspaceId}`,
    name: 'Que Warehouse',
    type: 'postgresql',
    status: 'active',
    config: {
      queWarehouse: true,
      workspaceId,
      schema: reg.schemaName,
      internal: true,
    },
  }
}

/** Read-only SQL against workspace warehouse (search_path scoped). */
export async function executeWarehouseReadonlySql(workspaceId, sql, opts = {}) {
  const { prepareReadonlySql, prepareBiReadonlySql, LIVE_VALIDATE_MAX_ROWS } =
    await import('./liveExec.js')
  const reg = await ensureQueWarehouse(workspaceId)
  const prepared = opts.biWidget
    ? prepareBiReadonlySql(sql, opts.maxRows ?? 100)
    : prepareReadonlySql(sql, opts.maxRows ?? LIVE_VALIDATE_MAX_ROWS)
  const client = await pool.connect()
  const started = Date.now()
  try {
    await client.query(`SET search_path TO ${quoteIdent(reg.schemaName)}, public`)
    const result = await client.query(prepared)
    const rows = result.rows || []
    const maxRows = Math.min(
      Number(opts.maxRows ?? LIVE_VALIDATE_MAX_ROWS),
      LIVE_VALIDATE_MAX_ROWS,
    )
    const sliced = rows.slice(0, maxRows)
    return {
      engine: 'que_warehouse',
      schema: reg.schemaName,
      columns: (result.fields || []).map((f) => ({
        name: f.name,
        dataType: String(f.dataTypeID || 'unknown'),
      })),
      rows: sliced,
      rowCount: sliced.length,
      truncated: rows.length > maxRows,
      durationMs: Date.now() - started,
    }
  } finally {
    client.release()
  }
}

export async function dismissMonkPrompt(workspaceId, connectionId) {
  const { rowCount } = await query(
    `UPDATE connections
     SET monk_prompt_dismissed = true, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, connectionId],
  )
  return rowCount > 0
}
