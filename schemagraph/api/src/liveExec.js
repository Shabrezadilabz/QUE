/**
 * Live read-only SQL execution for Que notebook runs.
 * Policy: SELECT/WITH only, single statement, capped rows — no warehouse writes.
 * Validate / live reads are capped at 20 rows (schema samples use 10 elsewhere).
 */
import {
  getConnectionSecrets,
  listConnectionsRaw,
} from './connections.js'
import { runReadonlyQuery as runPg } from './connectors/postgres.js'
import { runReadonlyQuery as runDatabricks } from './connectors/databricks.js'
import { runReadonlyQuery as runSnowflake } from './connectors/snowflake.js'
import { runReadonlyQuery as runBigQuery } from './connectors/bigquery.js'

const WRITE_RE =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|call|copy)\b/i
const LIVE_ENGINES = new Set(['postgresql', 'databricks', 'snowflake', 'bigquery'])

/** Product cap for live / validate reads — never pull full tables. */
export const LIVE_VALIDATE_MAX_ROWS = 20

/** Phase 4 — BI widget/chart previews may fetch more rows from warehouse. */
export const BI_WIDGET_MAX_ROWS = 500

/**
 * Strip SQL / notebook comments so leading `--` notes don't fail SELECT checks.
 * Also strips `#` and `//` so Python/Scala-style notes still work.
 * @param {string} sql
 */
export function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*--[^\n]*$/gm, '')
    .replace(/^[ \t]*#[^\n]*$/gm, '')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/[ \t]+--[^\n]*/g, ' ')
    .replace(/[\uFEFF\u200B-\u200D]/g, '')
    .trim()
}

/**
 * Locate the first read-only statement in a notebook cell body.
 * Ignores leftover header noise above SELECT/WITH.
 * @param {string} sql
 * @returns {string}
 */
export function extractLeadingReadonlyQuery(sql) {
  const bare = stripSqlComments(sql).replace(/;+\s*$/g, '').trim()
  if (!bare) return ''
  const start = bare.search(/\b(?:with|select)\b/i)
  if (start < 0) return ''
  const before = bare.slice(0, start)
  if (WRITE_RE.test(before)) {
    const err = new Error(
      'Live run blocked: write/DDL keywords are not allowed (read-only policy)',
    )
    err.status = 400
    throw err
  }
  return bare.slice(start).replace(/;+\s*$/g, '').trim()
}

/**
 * Harden user SQL for live read execution.
 * @param {string} sql
 * @param {number} [maxRows=20]
 */
export function prepareReadonlySql(sql, maxRows = LIVE_VALIDATE_MAX_ROWS) {
  return prepareReadonlySqlWithCap(sql, maxRows, LIVE_VALIDATE_MAX_ROWS)
}

/**
 * BI Studio widget SQL — same guards, higher row cap (Phase 4.1).
 * @param {string} sql
 * @param {number} [maxRows=100]
 */
export function prepareBiReadonlySql(sql, maxRows = 100) {
  return prepareReadonlySqlWithCap(sql, maxRows, BI_WIDGET_MAX_ROWS)
}

function prepareReadonlySqlWithCap(sql, maxRows, hardCap) {
  let text = String(sql || '').trim()
  if (!text) {
    const err = new Error('SQL is empty')
    err.status = 400
    throw err
  }
  // Notebook cells often have `--` headers above SELECT — slice from the query.
  let bare = extractLeadingReadonlyQuery(text)
  if (!bare) {
    const err = new Error('Live run requires a SELECT or WITH query')
    err.status = 400
    throw err
  }
  if (/;/.test(bare)) {
    const err = new Error('Live run allows a single statement only')
    err.status = 400
    throw err
  }
  if (WRITE_RE.test(bare)) {
    const err = new Error(
      'Live run blocked: write/DDL keywords are not allowed (read-only policy)',
    )
    err.status = 400
    throw err
  }
  if (!/^\s*(with|select)\b/i.test(bare)) {
    const err = new Error('Live run requires a SELECT or WITH query')
    err.status = 400
    throw err
  }
  if (/que_notebook_stub/i.test(bare)) {
    const err = new Error(
      'Live run blocked: stub SQL — replace with a real query first',
    )
    err.status = 400
    throw err
  }
  const limit = Math.min(
    Math.max(Number(maxRows) || hardCap, 1),
    hardCap,
  )
  if (!/\blimit\s+\d+/i.test(bare)) {
    bare = `${bare}\nLIMIT ${limit}`
  } else {
    bare = bare.replace(/\blimit\s+(\d+)/gi, (_m, n) => {
      const v = Math.min(Number(n) || limit, hardCap)
      return `LIMIT ${v}`
    })
  }
  return bare
}

/**
 * Pick a live-capable connection for the job.
 * @param {string} workspaceId
 * @param {{ sources?: string[] }} job
 * @param {string} [connectionId]
 */
export async function resolveLiveTarget(workspaceId, job, connectionId) {
  try {
    const { getWorkspaceSettings } = await import('./workspaceSettings.js')
    const { getWarehouseLiveConnection } = await import('./queWarehouse.js')
    const ws = await getWorkspaceSettings(workspaceId)
    if (ws?.settings?.preferWarehouseForLiveSql !== false) {
      const wh = await getWarehouseLiveConnection(workspaceId)
      if (wh) return wh
    }
  } catch {
    /* fall through to source connections */
  }

  if (connectionId) {
    const conn = await getConnectionSecrets(workspaceId, connectionId)
    if (!conn) {
      const err = new Error('connection not found')
      err.status = 404
      throw err
    }
    if (!LIVE_ENGINES.has(conn.type)) {
      const err = new Error(
        `Connection type “${conn.type}” cannot run live SQL (use postgresql or databricks)`,
      )
      err.status = 400
      throw err
    }
    if (conn.type === 'databricks' && (!conn.config?.token || !conn.config?.host)) {
      const err = new Error(
        'Databricks connection needs live host + warehouseId + token (fixture mode cannot execute)',
      )
      err.status = 400
      throw err
    }
    if (conn.type === 'bigquery' && (!conn.config?.projectId && !conn.config?.project)) {
      const err = new Error(
        'BigQuery connection needs projectId + dataset + OAuth token for liveExec',
      )
      err.status = 400
      throw err
    }
    return conn
  }

  const all = await listConnectionsRaw(workspaceId)
  const liveCapable = all.filter((c) => {
    if (!LIVE_ENGINES.has(c.type)) return false
    if (c.type === 'databricks') {
      return Boolean(c.config?.token && c.config?.host && c.config?.warehouseId)
    }
    if (c.type === 'bigquery') {
      return Boolean(
        (c.config?.projectId || c.config?.project) &&
          (c.config?.token || c.config?.accessToken) &&
          (c.config?.dataset || c.config?.schema),
      )
    }
    return true
  })

  if (liveCapable.length === 0) {
    const err = new Error(
      'No live SQL connection — add a PostgreSQL source (or Databricks with token) in Sources',
    )
    err.status = 400
    throw err
  }

  const sourceNames = new Set(
    (job.sources || []).map((s) => String(s).toLowerCase()),
  )
  const bySource = liveCapable.find((c) =>
    sourceNames.has(String(c.name).toLowerCase()),
  )
  if (bySource) return bySource

  const pg = liveCapable.find((c) => c.type === 'postgresql')
  return pg || liveCapable[0]
}

/**
 * Execute one read-only SQL statement on the resolved connection.
 */
export async function executeLiveSql(connection, sql, opts = {}) {
  const maxRows = Math.min(
    Math.max(Number(opts.maxRows ?? LIVE_VALIDATE_MAX_ROWS), 1),
    LIVE_VALIDATE_MAX_ROWS,
  )
  const prepared = prepareReadonlySql(sql, maxRows)

  if (connection.config?.queWarehouse && connection.config?.workspaceId) {
    const { executeWarehouseReadonlySql } = await import('./queWarehouse.js')
    const result = await executeWarehouseReadonlySql(
      connection.config.workspaceId,
      prepared,
      { maxRows },
    )
    return {
      ...result,
      connectionId: connection.id,
      connectionName: connection.name,
      sqlExecuted: prepared,
    }
  }

  if (connection.type === 'postgresql') {
    const result = await runPg(connection.config, prepared, { maxRows })
    return {
      ...result,
      connectionId: connection.id,
      connectionName: connection.name,
      sqlExecuted: prepared,
    }
  }

  if (connection.type === 'databricks') {
    const result = await runDatabricks(connection.config, prepared, { maxRows })
    return {
      ...result,
      connectionId: connection.id,
      connectionName: connection.name,
      sqlExecuted: prepared,
    }
  }

  if (connection.type === 'snowflake') {
    const result = await runSnowflake(connection.config, prepared, { maxRows })
    return {
      ...result,
      connectionId: connection.id,
      connectionName: connection.name,
      sqlExecuted: prepared,
    }
  }

  if (connection.type === 'bigquery') {
    const result = await runBigQuery(connection.config, prepared, { maxRows })
    return {
      ...result,
      connectionId: connection.id,
      connectionName: connection.name,
      sqlExecuted: prepared,
    }
  }

  const err = new Error(`Unsupported live engine: ${connection.type}`)
  err.status = 400
  throw err
}
