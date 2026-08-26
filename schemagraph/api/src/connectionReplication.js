/**
 * Lightweight ELT replication — Postgres source → que_replica schema (Fivetran-lite).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { unsealConnectionConfig } from './connectionCrypto.js'
import { withSourceClient } from './connectors/postgres.js'
import { recordAuditEvent } from './auditLog.js'

function mapPipeline(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    connectionId: r.connection_id,
    targetSchema: r.target_schema,
    tableNames: r.table_names || [],
    mode: r.mode,
    watermarkColumn: r.watermark_column,
    schedule: r.schedule,
    enabled: Boolean(r.enabled),
    lastRunAt: r.last_run_at,
    lastRowCount: r.last_row_count != null ? Number(r.last_row_count) : null,
    lastStatus: r.last_status,
    lastError: r.last_error,
    meta: r.meta_json || {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listReplicationPipelines(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM connection_replication_pipelines
     WHERE workspace_id = $1 ORDER BY updated_at DESC`,
    [workspaceId],
  )
  return rows.map(mapPipeline)
}

export async function upsertReplicationPipeline(workspaceId, body, userId = null) {
  const id = body.id || randomUUID()
  const tables = Array.isArray(body.tableNames) ? body.tableNames : []
  await query(
    `INSERT INTO connection_replication_pipelines (
       id, workspace_id, connection_id, target_schema, table_names,
       mode, watermark_column, schedule, enabled, meta_json
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       target_schema = EXCLUDED.target_schema,
       table_names = EXCLUDED.table_names,
       mode = EXCLUDED.mode,
       watermark_column = EXCLUDED.watermark_column,
       schedule = EXCLUDED.schedule,
       enabled = EXCLUDED.enabled,
       meta_json = EXCLUDED.meta_json,
       updated_at = now()`,
    [
      id,
      workspaceId,
      body.connectionId,
      body.targetSchema || 'que_replica',
      JSON.stringify(tables),
      body.mode || 'incremental',
      body.watermarkColumn || null,
      body.schedule || 'daily',
      body.enabled !== false,
      JSON.stringify(body.meta || { createdBy: 'pack_studio' }),
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'replication.pipeline_upsert',
    resourceType: 'connection',
    resourceId: body.connectionId,
    summary: `Replication pipeline ${tables.length} table(s) → ${body.targetSchema || 'que_replica'}`,
  })
  const { rows } = await query(
    `SELECT * FROM connection_replication_pipelines WHERE id = $1`,
    [id],
  )
  return mapPipeline(rows[0])
}

/** Run one replication pipeline (Postgres → same-db que_replica or managed staging). */
export async function runReplicationPipeline(workspaceId, pipelineId, userId = null) {
  const { rows } = await query(
    `SELECT p.*, c.source_type, c.config_json
     FROM connection_replication_pipelines p
     JOIN connections c ON c.id = p.connection_id
     WHERE p.workspace_id = $1 AND p.id = $2`,
    [workspaceId, pipelineId],
  )
  const pipe = rows[0]
  if (!pipe) {
    const err = new Error('pipeline not found')
    err.status = 404
    throw err
  }
  if (String(pipe.source_type).toLowerCase() !== 'postgresql') {
    const err = new Error('replication v1 supports postgresql only')
    err.status = 400
    throw err
  }

  const config = unsealConnectionConfig(pipe.config_json)
  const targetSchema = pipe.target_schema || 'que_replica'
  const tables = Array.isArray(pipe.table_names) ? pipe.table_names : []
  let totalRows = 0
  const results = []

  try {
    await withSourceClient(config, async (client) => {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(targetSchema)}`)
      for (const tableName of tables.slice(0, 20)) {
        const src = String(tableName).trim()
        if (!src) continue
        const parts = src.split('.')
        const schema = parts.length > 1 ? parts[0] : config.schema || 'public'
        const table = parts.length > 1 ? parts[1] : parts[0]
        const dest = `${targetSchema}.${quoteIdent(table.replace(/[^a-zA-Z0-9_]/g, '_'))}`
        const qualifiedSrc = `${quoteIdent(schema)}.${quoteIdent(table)}`

        if (pipe.mode === 'incremental' && pipe.watermark_column) {
          const wm = quoteIdent(pipe.watermark_column)
          await client.query(`
            CREATE TABLE IF NOT EXISTS ${dest} (LIKE ${qualifiedSrc} INCLUDING ALL)
          `)
          const { rows: maxRows } = await client.query(
            `SELECT COALESCE(MAX(${wm}), '1970-01-01'::timestamptz) AS mx FROM ${dest}`,
          )
          const since = maxRows[0]?.mx
          const insert = await client.query(`
            INSERT INTO ${dest}
            SELECT * FROM ${qualifiedSrc}
            WHERE ${wm} > $1
            ON CONFLICT DO NOTHING
          `, [since]).catch(async () => {
            await client.query(`DROP TABLE IF EXISTS ${dest}`)
            return client.query(
              `CREATE TABLE ${dest} AS SELECT * FROM ${qualifiedSrc} LIMIT 500000`,
            )
          })
          const n = insert.rowCount ?? 0
          totalRows += n
          results.push({ table: src, rows: n, mode: 'incremental' })
        } else {
          await client.query(`DROP TABLE IF EXISTS ${dest}`)
          const { rowCount } = await client.query(
            `CREATE TABLE ${dest} AS SELECT * FROM ${qualifiedSrc}`,
          )
          const n = rowCount ?? 0
          totalRows += n
          results.push({ table: src, rows: n, mode: 'full' })
        }
      }
    })

    await query(
      `UPDATE connection_replication_pipelines SET
         last_run_at = now(), last_row_count = $3, last_status = 'ok', last_error = NULL, updated_at = now()
       WHERE id = $1 AND workspace_id = $2`,
      [pipelineId, workspaceId, totalRows],
    )
    void recordAuditEvent({
      workspaceId,
      actorUserId: userId,
      action: 'replication.run',
      resourceType: 'pipeline',
      resourceId: pipelineId,
      summary: `Replicated ${totalRows} rows across ${results.length} table(s)`,
    })
    return { ok: true, totalRows, results }
  } catch (err) {
    await query(
      `UPDATE connection_replication_pipelines SET
         last_run_at = now(), last_status = 'failed', last_error = $3, updated_at = now()
       WHERE id = $1 AND workspace_id = $2`,
      [pipelineId, workspaceId, String(err.message || err).slice(0, 500)],
    )
    throw err
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

/** Create default pipeline from Monk pack matched tables. */
export async function seedReplicationFromPackTables(
  workspaceId,
  connectionId,
  tableNames,
  userId = null,
) {
  const tables = (tableNames || []).filter(Boolean).slice(0, 15)
  if (!tables.length) return { skipped: true }
  const { rows: existing } = await query(
    `SELECT id FROM connection_replication_pipelines
     WHERE workspace_id = $1 AND connection_id = $2 LIMIT 1`,
    [workspaceId, connectionId],
  )
  if (existing[0]) {
    await query(
      `UPDATE connection_replication_pipelines SET
         table_names = $3::jsonb, enabled = true, updated_at = now()
       WHERE id = $1`,
      [existing[0].id, workspaceId, JSON.stringify(tables)],
    )
    const { rows } = await query(
      `SELECT * FROM connection_replication_pipelines WHERE id = $1`,
      [existing[0].id],
    )
    return mapPipeline(rows[0])
  }
  return upsertReplicationPipeline(
    workspaceId,
    {
      connectionId,
      tableNames: tables,
      targetSchema: 'que_replica',
      mode: 'full',
      schedule: 'daily',
      enabled: true,
      meta: { source: 'monk_mode' },
    },
    userId,
  )
}

export async function runDueReplicationTick() {
  const { rows } = await query(
    `SELECT id, workspace_id FROM connection_replication_pipelines
     WHERE enabled = true AND schedule <> 'off'
       AND (last_run_at IS NULL OR last_run_at < now() - interval '23 hours')
     LIMIT 10`,
  )
  const results = []
  for (const r of rows) {
    try {
      const out = await runReplicationPipeline(r.workspace_id, r.id)
      results.push({ pipelineId: r.id, ok: true, ...out })
    } catch (err) {
      results.push({
        pipelineId: r.id,
        ok: false,
        error: String(err.message || err),
      })
    }
  }
  return { scanned: rows.length, results }
}
