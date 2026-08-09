/**
 * Wave 3.1 — opt-in materialize (CTAS / VIEW) in the *customer* warehouse.
 * Que never stores result rows — only metadata + audit.
 */
import { createHash, randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getJob, updateJob } from './jobs.js'
import { primarySqlFromNotebook } from './jobNotebook.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import {
  countUnreviewedJoinsForTables,
  validateContract,
} from './contracts/contractFreeze.js'
import { columnImpactBlockingExport } from './contracts/columnImpact.js'
import { resolveLiveTarget } from './liveExec.js'
import { runWriteSql as runPgWrite } from './connectors/postgres.js'
import { runWriteSql as runDatabricksWrite } from './connectors/databricks.js'
import { runWriteSql as runSnowflakeWrite } from './connectors/snowflake.js'
import { recordAuditEvent } from './auditLog.js'
import { buildSchemaOnlyAttestation } from './exporters/attestation.js'

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
const WRITE_IN_SELECT_RE =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|call|copy)\b/i

/**
 * @param {string} raw
 */
export function sanitizeIdent(raw, label = 'identifier') {
  const s = String(raw || '').trim()
  if (!IDENT_RE.test(s)) {
    const err = new Error(
      `Invalid ${label}: use letters, numbers, underscore (max 63), starting with a letter/_`,
    )
    err.status = 400
    err.code = 'INVALID_IDENT'
    throw err
  }
  return s
}

/**
 * Extract / harden the SELECT that feeds CTAS — no LIMIT cap (runs in their warehouse).
 * @param {string} sql
 */
export function prepareMaterializeSelect(sql) {
  let text = String(sql || '').trim()
  if (!text) {
    const err = new Error('Job has no SQL to materialize')
    err.status = 400
    throw err
  }
  text = text.replace(/;+\s*$/g, '').trim()
  if (/;/.test(text)) {
    const err = new Error('Materialize allows a single SELECT/WITH statement only')
    err.status = 400
    throw err
  }
  if (WRITE_IN_SELECT_RE.test(text)) {
    const err = new Error(
      'Source SQL must be read-only SELECT/WITH — write/DDL keywords are not allowed in the query body',
    )
    err.status = 400
    throw err
  }
  if (!/^\s*(with|select)\b/i.test(text)) {
    const err = new Error('Materialize requires a SELECT or WITH query')
    err.status = 400
    throw err
  }
  if (/que_notebook_stub/i.test(text)) {
    const err = new Error('Replace stub SQL before materializing')
    err.status = 400
    throw err
  }
  return text
}

function defaultObjectName(job) {
  const base = String(job?.title || 'stitch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'stitch'
  const suffix = String(job?.id || randomUUID()).replace(/-/g, '').slice(0, 8)
  return `que_${base}_${suffix}`.replace(/_+/g, '_').slice(0, 63)
}

function quotePg(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`
}

function quoteDbx(ident) {
  return `\`${String(ident).replace(/`/g, '')}\``
}

function quoteSf(ident) {
  return `"${String(ident).replace(/"/g, '""').toUpperCase()}"`
}

/**
 * Build CREATE TABLE/VIEW AS … for the target engine.
 */
export function buildMaterializeDdl({
  engine,
  kind,
  schema,
  name,
  selectSql,
  replace,
  catalog,
}) {
  const select = prepareMaterializeSelect(selectSql)
  if (engine === 'postgresql') {
    const qSchema = schema ? quotePg(schema) : null
    const qName = quotePg(name)
    const fq = qSchema ? `${qSchema}.${qName}` : qName
    if (kind === 'view') {
      return {
        statements: [`CREATE OR REPLACE VIEW ${fq} AS\n${select}`],
        qualifiedName: schema ? `${schema}.${name}` : name,
      }
    }
    const stmts = []
    if (replace) stmts.push(`DROP TABLE IF EXISTS ${fq}`)
    stmts.push(`CREATE TABLE ${fq} AS\n${select}`)
    return {
      statements: stmts,
      qualifiedName: schema ? `${schema}.${name}` : name,
    }
  }

  if (engine === 'databricks') {
    const parts = []
    if (catalog) parts.push(quoteDbx(catalog))
    if (schema) parts.push(quoteDbx(schema))
    parts.push(quoteDbx(name))
    const fq = parts.join('.')
    if (kind === 'view') {
      return {
        statements: [`CREATE OR REPLACE VIEW ${fq} AS\n${select}`],
        qualifiedName: [catalog, schema, name].filter(Boolean).join('.'),
      }
    }
    const stmts = []
    if (replace) stmts.push(`DROP TABLE IF EXISTS ${fq}`)
    stmts.push(`CREATE TABLE ${fq} AS\n${select}`)
    return {
      statements: stmts,
      qualifiedName: [catalog, schema, name].filter(Boolean).join('.'),
    }
  }

  if (engine === 'snowflake') {
    const qSchema = schema ? quoteSf(schema) : null
    const qName = quoteSf(name)
    const fq = qSchema ? `${qSchema}.${qName}` : qName
    if (kind === 'view') {
      return {
        statements: [`CREATE OR REPLACE VIEW ${fq} AS\n${select}`],
        qualifiedName: schema
          ? `${schema.toUpperCase()}.${name.toUpperCase()}`
          : name.toUpperCase(),
      }
    }
    const stmts = []
    if (replace) stmts.push(`DROP TABLE IF EXISTS ${fq}`)
    stmts.push(`CREATE TABLE ${fq} AS\n${select}`)
    return {
      statements: stmts,
      qualifiedName: schema
        ? `${schema.toUpperCase()}.${name.toUpperCase()}`
        : name.toUpperCase(),
    }
  }

  const err = new Error(`Materialize not supported for engine “${engine}”`)
  err.status = 400
  throw err
}

async function assertMaterializeAllowed(workspaceId, job, options = {}) {
  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings ?? {}
  if (settings.enableMaterialize === false) {
    const err = new Error(
      'Materialize is disabled for this workspace (Settings → AI & Policy)',
    )
    err.status = 403
    throw err
  }
  const blockOnDrift = settings.blockExportOnDrift !== false
  const blockOnUnreviewed = settings.blockExportOnUnreviewedJoins === true

  if (!job.contract || !job.joinsSnapshot?.length) {
    // soft: try freeze first via caller
  }

  const validation = await validateContract(workspaceId, job.contract, {
    blockOnHigh: blockOnDrift,
  })
  if (validation.blocking && !options.force) {
    const err = new Error(
      `Materialize blocked by contract/drift: ${validation.errors.join('; ')}`,
    )
    err.status = 409
    err.validation = validation
    throw err
  }

  if (blockOnUnreviewed && !options.force) {
    const pending = await countUnreviewedJoinsForTables(
      workspaceId,
      job.tables || [],
    )
    if (pending > 0) {
      const err = new Error(
        `Materialize blocked: ${pending} suggested join(s) still need Promote/Reject`,
      )
      err.status = 409
      throw err
    }
  }

  if (settings.blockPrOnColumnDrift !== false && !options.force) {
    const impacts = await columnImpactBlockingExport(workspaceId, job)
    if (impacts.length > 0) {
      const err = new Error(
        `Materialize blocked by column-level drift (${impacts.length})`,
      )
      err.status = 409
      err.validation = { blocking: true, errors: impacts.map((i) => i.summary) }
      throw err
    }
  }

  return { settings, validation }
}

async function executeWrite(connection, statements) {
  const started = Date.now()
  if (connection.type === 'postgresql') {
    const result = await runPgWrite(connection.config, statements)
    return { ...result, durationMs: Date.now() - started }
  }
  if (connection.type === 'databricks') {
    const result = await runDatabricksWrite(connection.config, statements)
    return { ...result, durationMs: Date.now() - started }
  }
  if (connection.type === 'snowflake') {
    const result = await runSnowflakeWrite(connection.config, statements)
    return { ...result, durationMs: Date.now() - started }
  }
  const err = new Error(`Unsupported materialize engine: ${connection.type}`)
  err.status = 400
  throw err
}

/**
 * @param {string} workspaceId
 * @param {string} jobId
 * @param {{
 *   connectionId?: string,
 *   objectName?: string,
 *   schema?: string,
 *   kind?: 'table'|'view',
 *   replace?: boolean,
 *   confirm?: boolean,
 *   force?: boolean,
 *   actorUserId?: string|null,
 * }} options
 */
export async function materializeJob(workspaceId, jobId, options = {}) {
  if (options.confirm !== true) {
    const err = new Error(
      'Materialize requires confirm:true — writes into the customer warehouse',
    )
    err.status = 400
    err.code = 'CONFIRM_REQUIRED'
    throw err
  }

  let job = await getJob(workspaceId, jobId)
  if (!job) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }

  if (!job.contract || !job.contract.version || !job.joinsSnapshot?.length) {
    job = await updateJob(workspaceId, jobId, { refreezeContract: true })
  }

  const { validation } = await assertMaterializeAllowed(
    workspaceId,
    job,
    options,
  )

  const connection = await resolveLiveTarget(
    workspaceId,
    job,
    options.connectionId || null,
  )

  const kind = options.kind === 'table' ? 'table' : 'view'
  const replace = Boolean(options.replace)
  if (kind === 'table' && replace !== true) {
    // CREATE TABLE without IF NOT EXISTS will fail if exists — OK
  }

  const objectName = sanitizeIdent(
    options.objectName || defaultObjectName(job),
    'objectName',
  )
  let schema =
    options.schema != null && String(options.schema).trim()
      ? sanitizeIdent(String(options.schema).trim(), 'schema')
      : null
  if (!schema) {
    const cfgSchema = connection.config?.schema
    if (cfgSchema && IDENT_RE.test(String(cfgSchema))) {
      schema = String(cfgSchema)
    } else if (connection.type === 'postgresql') {
      schema = 'public'
    } else if (connection.type === 'snowflake') {
      schema = connection.config?.schema || 'PUBLIC'
      if (!IDENT_RE.test(schema)) schema = 'PUBLIC'
    }
  }

  let catalog = null
  if (connection.type === 'databricks' && connection.config?.catalog) {
    const c = String(connection.config.catalog)
    if (IDENT_RE.test(c)) catalog = c
  }

  const selectSql =
    primarySqlFromNotebook(job.notebook) || job.sqlText || ''
  const ddl = buildMaterializeDdl({
    engine: connection.type,
    kind,
    schema,
    name: objectName,
    selectSql,
    replace: kind === 'table' ? replace : false,
    catalog,
  })

  const sqlHash = createHash('sha256')
    .update(prepareMaterializeSelect(selectSql))
    .digest('hex')
    .slice(0, 32)

  const matId = randomUUID()
  const runId = randomUUID()
  const startedAt = new Date()

  await query(
    `INSERT INTO job_runs (
       id, workspace_id, job_id, status, scope, mode, logs_json, started_at
     ) VALUES ($1,$2,$3,'running','all','materialize',$4::jsonb, $5)`,
    [
      runId,
      workspaceId,
      jobId,
      JSON.stringify([
        {
          ts: startedAt.toISOString(),
          level: 'info',
          message: `Materialize ${kind} → ${ddl.qualifiedName} on ${connection.name}`,
        },
      ]),
      startedAt.toISOString(),
    ],
  )

  try {
    const exec = await executeWrite(connection, ddl.statements)
    const finishedAt = new Date()
    const durationMs = exec.durationMs ?? finishedAt - startedAt

    await query(
      `INSERT INTO job_materializations (
         id, workspace_id, job_id, connection_id, actor_user_id,
         object_kind, object_schema, object_name, qualified_name,
         sql_hash, status, duration_ms, meta_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'succeeded',$11,$12::jsonb)`,
      [
        matId,
        workspaceId,
        jobId,
        connection.id,
        options.actorUserId || null,
        kind,
        schema,
        objectName,
        ddl.qualifiedName,
        sqlHash,
        durationMs,
        JSON.stringify({
          engine: connection.type,
          connectionName: connection.name,
          replace,
          statements: ddl.statements.length,
          policy: 'customer-warehouse-only',
          claim:
            'Que executed DDL in the customer warehouse using their credentials; result rows are not stored in Que.',
        }),
      ],
    )

    await query(
      `UPDATE job_runs SET
         status = 'succeeded',
         summary = $2,
         output_json = $3::jsonb,
         logs_json = $4::jsonb,
         finished_at = $5
       WHERE id = $1`,
      [
        runId,
        `Materialized ${kind} ${ddl.qualifiedName}`,
        JSON.stringify({
          materializationId: matId,
          qualifiedName: ddl.qualifiedName,
          kind,
          connectionId: connection.id,
          connectionName: connection.name,
          sqlHash,
          /* intentionally no rows */
        }),
        JSON.stringify([
          {
            ts: startedAt.toISOString(),
            level: 'info',
            message: `Materialize ${kind} → ${ddl.qualifiedName}`,
          },
          {
            ts: finishedAt.toISOString(),
            level: 'info',
            message: `Succeeded in ${durationMs}ms · rows stay in customer warehouse`,
          },
        ]),
        finishedAt.toISOString(),
      ],
    )

    void recordAuditEvent({
      workspaceId,
      actorUserId: options.actorUserId || null,
      action: 'job.materialize',
      resourceType: 'job',
      resourceId: jobId,
      summary: `Materialized ${kind} ${ddl.qualifiedName} on ${connection.name}`,
      meta: {
        materializationId: matId,
        connectionId: connection.id,
        qualifiedName: ddl.qualifiedName,
        kind,
        sqlHash,
      },
    })

    const attestation = buildSchemaOnlyAttestation({
      workspaceId,
      job,
      joins: job.joinsSnapshot || [],
      format: 'materialize',
      extras: {
        materialization: {
          id: matId,
          kind,
          qualifiedName: ddl.qualifiedName,
          connectionId: connection.id,
          sqlHash,
        },
      },
    })

    return {
      ok: true,
      materialization: {
        id: matId,
        runId,
        kind,
        schema,
        objectName,
        qualifiedName: ddl.qualifiedName,
        connectionId: connection.id,
        connectionName: connection.name,
        engine: connection.type,
        sqlHash,
        durationMs,
        createdAt: finishedAt.toISOString(),
      },
      validation,
      attestation,
      note: 'Object created in the customer warehouse. Que does not store result rows.',
    }
  } catch (err) {
    const finishedAt = new Date()
    const message = String(err.message || err).slice(0, 2000)
    await query(
      `INSERT INTO job_materializations (
         id, workspace_id, job_id, connection_id, actor_user_id,
         object_kind, object_schema, object_name, qualified_name,
         sql_hash, status, error_text, duration_ms, meta_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'failed',$11,$12,$13::jsonb)`,
      [
        matId,
        workspaceId,
        jobId,
        connection.id,
        options.actorUserId || null,
        kind,
        schema,
        objectName,
        ddl.qualifiedName,
        sqlHash,
        message,
        finishedAt - startedAt,
        JSON.stringify({ engine: connection.type }),
      ],
    ).catch(() => {})
    await query(
      `UPDATE job_runs SET
         status = 'failed',
         summary = $2,
         logs_json = $3::jsonb,
         finished_at = $4
       WHERE id = $1`,
      [
        runId,
        message.slice(0, 500),
        JSON.stringify([
          {
            ts: startedAt.toISOString(),
            level: 'info',
            message: `Materialize ${kind} → ${ddl.qualifiedName}`,
          },
          {
            ts: finishedAt.toISOString(),
            level: 'error',
            message,
          },
        ]),
        finishedAt.toISOString(),
      ],
    ).catch(() => {})
    void recordAuditEvent({
      workspaceId,
      actorUserId: options.actorUserId || null,
      action: 'job.materialize_failed',
      resourceType: 'job',
      resourceId: jobId,
      summary: `Materialize failed: ${message.slice(0, 200)}`,
      meta: { materializationId: matId, connectionId: connection.id },
    })
    throw err
  }
}

/**
 * @param {string} workspaceId
 * @param {{ jobId?: string, limit?: number }} [opts]
 */
export async function listMaterializations(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100)
  const params = [workspaceId]
  let jobSql = ''
  if (opts.jobId) {
    params.push(opts.jobId)
    jobSql = ` AND m.job_id = $${params.length}`
  }
  params.push(limit)
  const { rows } = await query(
    `SELECT m.id, m.job_id, m.connection_id, m.object_kind, m.object_schema,
            m.object_name, m.qualified_name, m.sql_hash, m.status, m.error_text,
            m.duration_ms, m.meta_json, m.created_at,
            j.title AS job_title,
            c.name AS connection_name, c.source_type AS connection_type
     FROM job_materializations m
     LEFT JOIN jobs j ON j.id = m.job_id
     LEFT JOIN connections c ON c.id = m.connection_id
     WHERE m.workspace_id = $1${jobSql}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params,
  )
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    jobTitle: r.job_title || null,
    connectionId: r.connection_id,
    connectionName: r.connection_name || null,
    engine: r.connection_type || null,
    kind: r.object_kind,
    schema: r.object_schema,
    objectName: r.object_name,
    qualifiedName: r.qualified_name,
    sqlHash: r.sql_hash,
    status: r.status,
    error: r.error_text || null,
    durationMs: r.duration_ms,
    meta: r.meta_json && typeof r.meta_json === 'object' ? r.meta_json : {},
    createdAt: r.created_at,
  }))
}
