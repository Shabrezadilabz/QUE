/**
 * Sync a workspace connection: introspect source → upsert Stitch metadata.
 * Schema truth only — never copies full customer tables into Stitch.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { introspectPostgres, withSourceClient } from './connectors/postgres.js'
import { introspectSpreadsheet } from './connectors/spreadsheet.js'
import { introspectMongo } from './connectors/mongo.js'
import { introspectDatabricks } from './connectors/databricks.js'
import { inferCrossSourceJoins } from './inferJoins.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { buildSyncDrift, capturePreSyncDrift } from './syncDrift.js'

/**
 * @param {string} workspaceId
 * @param {string} connectionId
 */
export async function syncConnection(workspaceId, connectionId) {
  const { rows: connRows } = await query(
    `SELECT id, workspace_id, name, source_type, config_json, status
     FROM connections
     WHERE id = $1 AND workspace_id = $2`,
    [connectionId, workspaceId],
  )
  if (connRows.length === 0) {
    const err = new Error('connection not found')
    err.status = 404
    throw err
  }

  const connection = connRows[0]
  const config = { ...(connection.config_json ?? {}) }
  const wsSettings = await getWorkspaceSettings(workspaceId)
  const prefs = wsSettings?.settings
  if (config.includeSamples == null && prefs) {
    config.includeSamples = prefs.includeSamplesDefault
  }

  let introspected
  try {
    introspected = await runIntrospect(connection.source_type, config)
  } catch (e) {
    await query(
      `UPDATE connections SET status = 'error', updated_at = now()
       WHERE id = $1`,
      [connectionId],
    )
    const err = new Error(`introspect failed: ${e.message || e}`)
    err.status = e.status || 502
    throw err
  }

  const before = await capturePreSyncDrift(workspaceId, connectionId)

  const sourceLabel = `${connection.name} · ${introspected.schema}`
  const applied = await applyIntrospection({
    workspaceId,
    connectionId,
    connectionName: connection.name,
    sourceLabel,
    introspected,
  })

  await query(
    `UPDATE connections SET status = 'active', updated_at = now()
     WHERE id = $1`,
    [connectionId],
  )

  await query(
    `INSERT INTO schema_snapshots (workspace_id, label, graph_json)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, label, created_at`,
    [
      workspaceId,
      `sync:${connection.name}:${new Date().toISOString()}`,
      JSON.stringify({
        connectionId,
        sourceType: connection.source_type,
        schema: introspected.schema,
        tables: introspected.tables.map((t) => ({
          name: t.name,
          entityKind: t.entityKind,
          columns: t.columns.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            keyKind: c.keyKind,
            isNullable: c.isNullable,
          })),
        })),
        foreignKeys: introspected.foreignKeys,
      }),
    ],
  )

  // Capture snapshot id for contract pinning
  const { rows: snapRows } = await query(
    `SELECT id, label, created_at FROM schema_snapshots
     WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  )
  const snapshot = snapRows[0]
    ? {
        id: snapRows[0].id,
        label: snapRows[0].label,
        createdAt: snapRows[0].created_at,
      }
    : null

  const suggestedJoins =
    prefs?.inferJoinsOnSync === false
      ? 0
      : await inferCrossSourceJoins(workspaceId, connectionId)

  const drift = await buildSyncDrift(
    workspaceId,
    connectionId,
    before,
    suggestedJoins,
  )

  return {
    connectionId,
    sourceType: connection.source_type,
    schema: introspected.schema,
    tablesSynced: applied.tablesSynced,
    columnsSynced: applied.columnsSynced,
    relationshipsSynced: applied.relationshipsSynced,
    suggestedJoins,
    drift,
    snapshot,
  }
}

async function runIntrospect(sourceType, config) {
  if (sourceType === 'postgresql') {
    if (!config.host && !config.database) {
      const err = new Error(
        'connection.config_json missing host/database — set Postgres target first',
      )
      err.status = 400
      throw err
    }
    return withSourceClient(config, (client) =>
      introspectPostgres(client, config),
    )
  }

  if (sourceType === 'excel' || sourceType === 'csv') {
    return introspectSpreadsheet(config)
  }

  if (sourceType === 'mongodb') {
    if (!config.uri && !config.host && !config.database) {
      const err = new Error(
        'connection.config_json missing uri/host/database — set Mongo target first',
      )
      err.status = 400
      throw err
    }
    return introspectMongo(config)
  }

  if (sourceType === 'databricks') {
    return introspectDatabricks(config)
  }

  const err = new Error(
    `connector not implemented for source_type=${sourceType}`,
  )
  err.status = 400
  throw err
}

async function applyIntrospection({
  workspaceId,
  connectionId,
  sourceLabel,
  introspected,
}) {
  const objectIdByName = new Map()
  const columnIdByKey = new Map()

  const { rows: existingObjects } = await query(
    `SELECT id, name FROM schema_objects
     WHERE workspace_id = $1 AND connection_id = $2`,
    [workspaceId, connectionId],
  )
  const existingObjectByName = new Map(
    existingObjects.map((o) => [o.name, o.id]),
  )
  const seenObjectNames = new Set()

  for (let i = 0; i < introspected.tables.length; i++) {
    const table = introspected.tables[i]
    seenObjectNames.add(table.name)
    let objectId = existingObjectByName.get(table.name) ?? randomUUID()

    await query(
      `INSERT INTO schema_objects (
         id, workspace_id, connection_id, name, entity_kind, source_label
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (connection_id, name) DO UPDATE SET
         entity_kind = EXCLUDED.entity_kind,
         source_label = EXCLUDED.source_label,
         updated_at = now()`,
      [
        objectId,
        workspaceId,
        connectionId,
        table.name,
        table.entityKind,
        sourceLabel,
      ],
    )

    const { rows: objRows } = await query(
      `SELECT id FROM schema_objects WHERE connection_id = $1 AND name = $2`,
      [connectionId, table.name],
    )
    objectId = objRows[0].id
    objectIdByName.set(table.name, objectId)

    const { rows: existingCols } = await query(
      `SELECT id, name FROM schema_columns WHERE schema_object_id = $1`,
      [objectId],
    )
    const existingColByName = new Map(existingCols.map((c) => [c.name, c.id]))
    const seenColNames = new Set()

    for (const col of table.columns) {
      seenColNames.add(col.name)
      const colId = existingColByName.get(col.name) ?? randomUUID()
      await query(
        `INSERT INTO schema_columns (
           id, workspace_id, schema_object_id, name, data_type, key_kind,
           is_nullable, sample_values, references_label, ordinal
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
         ON CONFLICT (schema_object_id, name) DO UPDATE SET
           data_type = EXCLUDED.data_type,
           key_kind = EXCLUDED.key_kind,
           is_nullable = EXCLUDED.is_nullable,
           sample_values = EXCLUDED.sample_values,
           references_label = EXCLUDED.references_label,
           ordinal = EXCLUDED.ordinal`,
        [
          colId,
          workspaceId,
          objectId,
          col.name,
          col.dataType,
          col.keyKind,
          col.isNullable,
          JSON.stringify(col.sampleValues ?? []),
          col.referencesLabel,
          col.ordinal,
        ],
      )
      const { rows: colRows } = await query(
        `SELECT id FROM schema_columns
         WHERE schema_object_id = $1 AND name = $2`,
        [objectId, col.name],
      )
      columnIdByKey.set(`${table.name}.${col.name}`, colRows[0].id)
    }

    for (const [name, id] of existingColByName) {
      if (!seenColNames.has(name)) {
        await query(`DELETE FROM schema_columns WHERE id = $1`, [id])
      }
    }

    await ensureLayoutPosition(workspaceId, objectId, i)
  }

  for (const [name, id] of existingObjectByName) {
    if (!seenObjectNames.has(name)) {
      await query(`DELETE FROM schema_objects WHERE id = $1`, [id])
    }
  }

  const objectIds = [...objectIdByName.values()]
  if (objectIds.length > 0) {
    await query(
      `DELETE FROM relationships
       WHERE workspace_id = $1
         AND relation_type = 'explicit'
         AND from_object_id = ANY($2::uuid[])
         AND to_object_id = ANY($2::uuid[])`,
      [workspaceId, objectIds],
    )
  }

  let relationshipsSynced = 0
  for (const fk of introspected.foreignKeys ?? []) {
    const fromObjectId = objectIdByName.get(fk.fromTable)
    const toObjectId = objectIdByName.get(fk.toTable)
    const fromColumnId = columnIdByKey.get(`${fk.fromTable}.${fk.fromColumn}`)
    const toColumnId = columnIdByKey.get(`${fk.toTable}.${fk.toColumn}`)
    if (!fromObjectId || !toObjectId || !fromColumnId || !toColumnId) continue

    const label = `${fk.fromTable}.${fk.fromColumn} → ${fk.toTable}.${fk.toColumn}`
    await query(
      `INSERT INTO relationships (
         id, workspace_id, from_object_id, from_column_id,
         to_object_id, to_column_id, relation_type, status, confidence,
         join_criteria, label
       ) VALUES ($1,$2,$3,$4,$5,$6,'explicit','accepted',1,$7,$8)`,
      [
        randomUUID(),
        workspaceId,
        fromObjectId,
        fromColumnId,
        toObjectId,
        toColumnId,
        label,
        label,
      ],
    )
    relationshipsSynced += 1
  }

  return {
    tablesSynced: introspected.tables.length,
    columnsSynced: introspected.tables.reduce(
      (n, t) => n + t.columns.length,
      0,
    ),
    relationshipsSynced,
  }
}

async function ensureLayoutPosition(workspaceId, objectId, index) {
  const { rows } = await query(
    `SELECT positions FROM diagram_layouts WHERE workspace_id = $1`,
    [workspaceId],
  )
  const positions = rows[0]?.positions ?? {}
  if (positions[objectId]) return

  const col = index % 3
  const row = Math.floor(index / 3)
  const next = {
    ...positions,
    [objectId]: { x: 820 + col * 320, y: 80 + row * 280 },
  }

  await query(
    `INSERT INTO diagram_layouts (workspace_id, positions, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (workspace_id) DO UPDATE SET
       positions = diagram_layouts.positions || EXCLUDED.positions,
       updated_at = now()`,
    [workspaceId, JSON.stringify(next)],
  )
}
