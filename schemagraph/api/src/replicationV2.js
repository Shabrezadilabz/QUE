/**
 * Sprint 8 — Replication v2 scoping (Snowflake or Databricks read replica MVP).
 * Planning-only — documents CDC path; execution remains v1 Postgres in connectionReplication.js.
 */
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import { upsertReplicationPipeline } from './connectionReplication.js'

export const REPLICATION_V2_WAREHOUSES = ['snowflake', 'databricks']

const WAREHOUSE_DOCS = {
  snowflake: {
    title: 'Snowflake → que_replica (CDC scope)',
    cdcNote:
      'Use Snowflake Streams + Tasks or Fivetran/Hevo landing tables as source; Que maps schema_objects after sync.',
    limitations: [
      'S9: fixture-backed E2E run simulates row counts from synced schema_objects',
      'Requires existing warehouse connection with schema sync completed',
      'Incremental watermark column recommended on fact tables',
    ],
  },
  databricks: {
    title: 'Databricks → que_replica (Delta CDC scope)',
    cdcNote:
      'Use Delta Change Data Feed or Unity Catalog synced tables; Que ingests metadata via connector sync.',
    limitations: [
      'S9: fixture-backed E2E run simulates row counts from synced schema_objects',
      'Requires Databricks SQL warehouse connection',
      'Large tables should use partition watermark columns',
    ],
  },
}

function mapConnection(r) {
  return {
    id: r.id,
    name: r.name,
    sourceType: r.source_type,
    lastSyncAt: r.last_sync_at,
  }
}

/**
 * @param {string} workspaceId
 * @param {{ warehouse?: string, maxTables?: number }} opts
 */
export async function scopeReplicationV2(workspaceId, opts = {}) {
  const warehouse = String(opts.warehouse || 'snowflake').toLowerCase()
  if (!REPLICATION_V2_WAREHOUSES.includes(warehouse)) {
    const err = new Error(`warehouse must be one of: ${REPLICATION_V2_WAREHOUSES.join(', ')}`)
    err.status = 400
    throw err
  }

  const maxTables = Math.min(Number(opts.maxTables) || 30, 50)
  const doc = WAREHOUSE_DOCS[warehouse]

  const { rows: connections } = await query(
    `SELECT id, name, source_type, last_sync_at
     FROM connections
     WHERE workspace_id = $1 AND lower(source_type) = $2
     ORDER BY last_sync_at DESC NULLS LAST`,
    [workspaceId, warehouse],
  )

  let recommendedTables = []
  if (connections[0]) {
    const { rows: objects } = await query(
      `SELECT o.name, o.entity_kind, c.name AS connection_name
       FROM schema_objects o
       JOIN connections c ON c.id = o.connection_id
       WHERE o.workspace_id = $1 AND c.id = $2
       ORDER BY o.name
       LIMIT $3`,
      [workspaceId, connections[0].id, maxTables],
    )
    recommendedTables = objects.map((o) => ({
      name: o.name,
      entityKind: o.entity_kind,
      connection: o.connection_name,
    }))
  }

  const targetSchema = `que_replica_${warehouse}`

  return {
    schemaVersion: 1,
    kind: 'que.replication_v2_scope',
    warehouse,
    status: connections.length ? 'ready_to_plan' : 'connection_required',
    title: doc.title,
    connections: connections.map(mapConnection),
    recommendedTables,
    plan: {
      mode: 'incremental_cdc',
      targetSchema,
      schedule: 'daily',
      watermarkStrategy: 'updated_at or _fivetran_synced when present',
      steps: [
        `Sync ${warehouse} connection (schema_objects populated)`,
        `Select up to ${maxTables} tables for replica scope`,
        `Create pipeline targeting schema ${targetSchema}`,
        'Run initial full refresh, then incremental watermark pulls',
        'Trigger post-sync Monk on que_replica marts',
      ],
      cdcNote: doc.cdcNote,
      limitations: doc.limitations,
    },
    documentationPath: `docs/replication-v2-${warehouse}.md`,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Pure plan object for unit tests and UI preview.
 * @param {object} scope from scopeReplicationV2
 */
export function planReplicationV2Run(scope) {
  const tables = (scope.recommendedTables || []).map((t) => t.name)
  return {
    schemaVersion: 1,
    kind: 'que.replication_v2_run_plan',
    warehouse: scope.warehouse,
    targetSchema: scope.plan?.targetSchema || `que_replica_${scope.warehouse}`,
    tableCount: tables.length,
    tables: tables.slice(0, 20),
    mode: 'incremental_cdc',
    simulated: true,
    steps: [
      'Ensure warehouse connection synced',
      `Create/update pipeline → ${scope.plan?.targetSchema}`,
      'Simulate initial full refresh row counts from schema metadata',
      'Mark pipeline last_status=ok for E2E evidence',
    ],
  }
}

/**
 * S9 E2E — fixture/simulated replication run for Snowflake or Databricks.
 * Creates or updates a pipeline and records simulated row counts.
 */
export async function runReplicationV2(workspaceId, opts = {}, userId = null) {
  const warehouse = String(opts.warehouse || 'snowflake').toLowerCase()
  const scope = await scopeReplicationV2(workspaceId, {
    warehouse,
    maxTables: opts.maxTables,
  })
  if (scope.status !== 'ready_to_plan' || !scope.connections[0]) {
    const err = new Error(`Connect and sync ${warehouse} before replication v2 run`)
    err.status = 400
    throw err
  }

  const plan = planReplicationV2Run(scope)
  const connectionId = scope.connections[0].id
  const tableNames = plan.tables
  const simulatedRows = tableNames.length * 1000

  const pipeline = await upsertReplicationPipeline(
    workspaceId,
    {
      connectionId,
      targetSchema: plan.targetSchema,
      tableNames,
      mode: 'incremental',
      watermarkColumn: opts.watermarkColumn || 'updated_at',
      schedule: 'daily',
      enabled: true,
      meta: {
        replicationV2: true,
        warehouse,
        simulated: true,
        runAt: new Date().toISOString(),
      },
    },
    userId,
  )

  await query(
    `UPDATE connection_replication_pipelines SET
       last_run_at = now(),
       last_row_count = $3,
       last_status = 'ok',
       last_error = NULL,
       meta_json = meta_json || $4::jsonb,
       updated_at = now()
     WHERE id = $1 AND workspace_id = $2`,
    [
      pipeline.id,
      workspaceId,
      simulatedRows,
      JSON.stringify({
        replicationV2Run: true,
        warehouse,
        tableCount: tableNames.length,
        simulatedRows,
      }),
    ],
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'replication.v2_run',
    resourceType: 'pipeline',
    resourceId: pipeline.id,
    summary: `${warehouse} v2 E2E — ${tableNames.length} table(s), ~${simulatedRows} rows (simulated)`,
  })

  return {
    ok: true,
    warehouse,
    pipelineId: pipeline.id,
    plan,
    totalRows: simulatedRows,
    results: tableNames.map((t) => ({ table: t, rows: 1000, mode: 'simulated' })),
    note: 'Simulated E2E — live JDBC pull planned for production hardening',
  }
}
