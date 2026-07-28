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

const WRITE_RE =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|call|copy)\b/i
const LIVE_ENGINES = new Set(['postgresql', 'databricks'])

/** Product cap for live / validate reads — never pull full tables. */
export const LIVE_VALIDATE_MAX_ROWS = 20

/**
 * Harden user SQL for live read execution.
 * @param {string} sql
 * @param {number} [maxRows=20]
 */
export function prepareReadonlySql(sql, maxRows = LIVE_VALIDATE_MAX_ROWS) {
  let text = String(sql || '').trim()
  if (!text) {
    const err = new Error('SQL is empty')
    err.status = 400
    throw err
  }
  text = text.replace(/;+\s*$/g, '').trim()
  if (/;/.test(text)) {
    const err = new Error('Live run allows a single statement only')
    err.status = 400
    throw err
  }
  if (WRITE_RE.test(text)) {
    const err = new Error(
      'Live run blocked: write/DDL keywords are not allowed (read-only policy)',
    )
    err.status = 400
    throw err
  }
  if (!/^\s*(with|select)\b/i.test(text)) {
    const err = new Error('Live run requires a SELECT or WITH query')
    err.status = 400
    throw err
  }
  if (/que_notebook_stub/i.test(text)) {
    const err = new Error(
      'Live run blocked: stub SQL — replace with a real query first',
    )
    err.status = 400
    throw err
  }
  const limit = Math.min(
    Math.max(Number(maxRows) || LIVE_VALIDATE_MAX_ROWS, 1),
    LIVE_VALIDATE_MAX_ROWS,
  )
  if (!/\blimit\s+\d+/i.test(text)) {
    text = `${text}\nLIMIT ${limit}`
  } else {
    // Clamp an existing LIMIT that exceeds the product cap
    text = text.replace(/\blimit\s+(\d+)/gi, (_m, n) => {
      const v = Math.min(Number(n) || limit, LIVE_VALIDATE_MAX_ROWS)
      return `LIMIT ${v}`
    })
  }
  return text
}

/**
 * Pick a live-capable connection for the job.
 * @param {string} workspaceId
 * @param {{ sources?: string[] }} job
 * @param {string} [connectionId]
 */
export async function resolveLiveTarget(workspaceId, job, connectionId) {
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
    return conn
  }

  const all = await listConnectionsRaw(workspaceId)
  const liveCapable = all.filter((c) => {
    if (!LIVE_ENGINES.has(c.type)) return false
    if (c.type === 'databricks') {
      return Boolean(c.config?.token && c.config?.host && c.config?.warehouseId)
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

  const err = new Error(`Unsupported live engine: ${connection.type}`)
  err.status = 400
  throw err
}
