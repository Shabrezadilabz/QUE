/**
 * Databricks connector — Unity Catalog / information_schema introspection.
 *
 * Modes:
 * - fixture: load api/fixtures/*.json (no cloud credentials)
 * - live: Databricks SQL Statement Execution API (host + warehouseId + token)
 *
 * Schema metadata only — never dumps lakehouse tables into Stitch.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '../..')

/**
 * @typedef {object} DatabricksConfig
 * @property {'fixture' | 'live'} [mode]
 * @property {string} [fixturesPath]
 * @property {string} [host]           // xxx.cloud.databricks.com (no https)
 * @property {string} [warehouseId]
 * @property {string} [token]
 * @property {string} [catalog]        // default main / hive_metastore
 * @property {string} [schema]         // default default
 * @property {boolean} [includeSamples]
 * @property {number} [sampleLimit]
 * @property {number} [pollMs]
 * @property {number} [timeoutMs]
 */

/**
 * @param {DatabricksConfig} config
 */
export async function introspectDatabricks(config = {}) {
  const mode =
    config.mode ||
    (config.token && config.host && config.warehouseId ? 'live' : 'fixture')

  if (mode === 'fixture') {
    return introspectFromFixture(config)
  }
  return introspectLive(config)
}

function resolveFixturePath(p) {
  if (!p) return resolve(API_ROOT, 'fixtures/databricks_unity_demo.json')
  if (p.match(/^[a-zA-Z]:[\\/]/) || p.startsWith('/')) return p
  return resolve(API_ROOT, p)
}

function introspectFromFixture(config) {
  const path = resolveFixturePath(config.fixturesPath)
  if (!existsSync(path)) {
    throw new Error(`Databricks fixture not found: ${path}`)
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const catalog = config.catalog || raw.catalog || 'main'
  const schema = config.schema || raw.schema || 'default'
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)

  const tables = (raw.tables || []).map((t) => ({
    name: t.name,
    entityKind: t.entityKind === 'VIEW' ? 'VIEW' : 'TABLE',
    columns: (t.columns || []).map((c, ordinal) => ({
      name: c.name,
      dataType: c.dataType || 'STRING',
      keyKind: c.keyKind || guessKeyKind(c.name),
      isNullable: c.nullable !== false,
      ordinal: c.ordinal ?? ordinal,
      referencesLabel: c.references || null,
      sampleValues: includeSamples
        ? (c.samples || []).slice(0, sampleLimit).map(String)
        : [],
    })),
  }))

  const foreignKeys = (raw.foreignKeys || []).map((fk) => ({
    fromTable: fk.fromTable,
    fromColumn: fk.fromColumn,
    toTable: fk.toTable,
    toColumn: fk.toColumn,
    constraintName: fk.constraintName || `${fk.fromTable}_${fk.fromColumn}_fk`,
  }))

  return {
    schema: `${catalog}.${schema}`,
    tables,
    foreignKeys,
  }
}

async function introspectLive(config) {
  const host = String(config.host || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  const warehouseId = config.warehouseId
  const token = config.token || process.env.STITCH_DATABRICKS_TOKEN
  const catalog = config.catalog || 'main'
  const schema = config.schema || 'default'
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)

  if (!host || !warehouseId || !token) {
    const err = new Error(
      'Databricks live mode needs host, warehouseId, and token (or mode: fixture)',
    )
    err.status = 400
    throw err
  }

  const tablesSql = `
    SELECT table_name, table_type
    FROM \`${catalog}\`.information_schema.tables
    WHERE table_schema = '${escapeSql(schema)}'
      AND table_type IN ('BASE TABLE', 'VIEW', 'MANAGED', 'EXTERNAL')
    ORDER BY table_name
  `
  const tableRowsRaw = await runSql(host, warehouseId, token, tablesSql, config)
  const maxTables = Math.min(Math.max(Number(config.maxTables ?? 500), 1), 2000)
  const tableRows = tableRowsRaw.slice(0, maxTables)
  if (tableRowsRaw.length > maxTables) {
    console.warn(
      `[Que] Databricks introspect truncated to ${maxTables} tables (catalog=${catalog} schema=${schema})`,
    )
  }

  const columnsSql = `
    SELECT table_name, column_name, data_type, is_nullable, ordinal_position
    FROM \`${catalog}\`.information_schema.columns
    WHERE table_schema = '${escapeSql(schema)}'
    ORDER BY table_name, ordinal_position
  `
  const columnRows = await runSql(host, warehouseId, token, columnsSql, config)

  const pkSql = `
    SELECT kcu.table_name, kcu.column_name
    FROM \`${catalog}\`.information_schema.table_constraints tc
    JOIN \`${catalog}\`.information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = '${escapeSql(schema)}'
      AND tc.constraint_type = 'PRIMARY KEY'
  `
  let pkRows = []
  try {
    pkRows = await runSql(host, warehouseId, token, pkSql, config)
  } catch {
    pkRows = []
  }

  const fkSql = `
    SELECT
      kcu.table_name AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name AS to_table,
      ccu.column_name AS to_column,
      tc.constraint_name
    FROM \`${catalog}\`.information_schema.table_constraints tc
    JOIN \`${catalog}\`.information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN \`${catalog}\`.information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = '${escapeSql(schema)}'
      AND tc.constraint_type = 'FOREIGN KEY'
  `
  let fkRows = []
  try {
    fkRows = await runSql(host, warehouseId, token, fkSql, config)
  } catch {
    fkRows = []
  }

  const pkSet = new Set(pkRows.map((r) => `${r.table_name}.${r.column_name}`))
  const fkByCol = new Map()
  for (const fk of fkRows) {
    fkByCol.set(`${fk.from_table}.${fk.from_column}`, fk)
  }

  const colsByTable = new Map()
  for (const col of columnRows) {
    const list = colsByTable.get(col.table_name) ?? []
    list.push(col)
    colsByTable.set(col.table_name, list)
  }

  const tables = []
  for (const t of tableRows) {
    const name = t.table_name
    const entityKind =
      String(t.table_type || '').toUpperCase().includes('VIEW')
        ? 'VIEW'
        : 'TABLE'
    const cols = colsByTable.get(name) ?? []
    const mapped = []
    for (const col of cols) {
      const key = `${name}.${col.column_name}`
      const fk = fkByCol.get(key)
      let keyKind = 'none'
      if (pkSet.has(key)) keyKind = 'pk'
      else if (fk) keyKind = 'fk'
      else keyKind = guessKeyKind(col.column_name)

      let sampleValues = []
      if (includeSamples && entityKind === 'TABLE') {
        sampleValues = await sampleColumn(
          host,
          warehouseId,
          token,
          catalog,
          schema,
          name,
          col.column_name,
          sampleLimit,
          config,
        )
      }

      mapped.push({
        name: col.column_name,
        dataType: String(col.data_type || 'STRING'),
        keyKind,
        isNullable: String(col.is_nullable).toUpperCase() !== 'NO',
        ordinal: Number(col.ordinal_position || mapped.length + 1) - 1,
        referencesLabel: fk
          ? `${fk.from_table}.${fk.from_column} → ${fk.to_table}.${fk.to_column}`
          : null,
        sampleValues,
      })
    }
    tables.push({ name, entityKind, columns: mapped })
  }

  return {
    schema: `${catalog}.${schema}`,
    tables,
    foreignKeys: fkRows.map((fk) => ({
      fromTable: fk.from_table,
      fromColumn: fk.from_column,
      toTable: fk.to_table,
      toColumn: fk.to_column,
      constraintName: fk.constraint_name,
    })),
  }
}

async function sampleColumn(
  host,
  warehouseId,
  token,
  catalog,
  schema,
  table,
  column,
  limit,
  config,
) {
  const sql = `SELECT DISTINCT CAST(\`${column}\` AS STRING) AS v
               FROM \`${catalog}\`.\`${schema}\`.\`${table}\`
               WHERE \`${column}\` IS NOT NULL
               LIMIT ${limit}`
  try {
    const rows = await runSql(host, warehouseId, token, sql, config)
    return rows.map((r) => String(r.v)).filter(Boolean)
  } catch {
    return []
  }
}

async function runSql(host, warehouseId, token, sql, config = {}) {
  const pollMs = Math.min(Number(config.pollMs ?? 800), 3000)
  const timeoutMs = Math.min(Number(config.timeoutMs ?? 60_000), 120_000)
  const url = `https://${host}/api/2.0/sql/statements`

  const started = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement: sql,
      wait_timeout: '30s',
      on_wait_timeout: 'CONTINUE',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
    }),
  })
  if (!started.ok) {
    const text = await started.text()
    throw new Error(`Databricks SQL start failed (${started.status}): ${text}`)
  }
  let body = await started.json()
  const statementId = body.statement_id
  const deadline = Date.now() + timeoutMs

  while (body.status?.state === 'PENDING' || body.status?.state === 'RUNNING') {
    if (Date.now() > deadline) {
      throw new Error('Databricks SQL statement timed out')
    }
    await sleep(pollMs)
    const poll = await fetch(`${url}/${statementId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!poll.ok) {
      throw new Error(`Databricks SQL poll failed (${poll.status})`)
    }
    body = await poll.json()
  }

  if (body.status?.state !== 'SUCCEEDED') {
    const errMsg =
      body.status?.error?.message ||
      body.status?.state ||
      'unknown Databricks SQL error'
    throw new Error(`Databricks SQL failed: ${errMsg}`)
  }

  return parseInlineResult(body)
}

/**
 * Read-only live SQL against Databricks SQL warehouse (caller must lint first).
 * @param {DatabricksConfig} config
 * @param {string} sql
 * @param {{ maxRows?: number }} [opts]
 */
export async function runReadonlyQuery(config = {}, sql, opts = {}) {
  const host = String(config.host || '').replace(/^https?:\/\//, '')
  const warehouseId = config.warehouseId
  const token = config.token
  if (!host || !warehouseId || !token) {
    throw new Error(
      'Databricks live run requires host, warehouseId, and token on the connection',
    )
  }
  const maxRows = Math.min(Math.max(Number(opts.maxRows ?? 20), 1), 20)
  const started = Date.now()
  const rows = await runSql(host, warehouseId, token, sql, {
    ...config,
    timeoutMs: Math.min(Number(config.timeoutMs ?? 60_000), 90_000),
  })
  const sliced = rows.slice(0, maxRows)
  const columns =
    sliced.length > 0
      ? Object.keys(sliced[0]).map((name) => ({ name, dataType: 'unknown' }))
      : []
  return {
    engine: 'databricks',
    columns,
    rows: sliced,
    rowCount: sliced.length,
    truncated: rows.length > maxRows,
    durationMs: Date.now() - started,
  }
}

function parseInlineResult(body) {
  const cols = body.manifest?.schema?.columns || []
  const names = cols.map((c) => c.name)
  const data = body.result?.data_array || []
  return data.map((row) => {
    const obj = {}
    names.forEach((name, i) => {
      obj[name] = row[i]
    })
    return obj
  })
}

function guessKeyKind(name) {
  const n = String(name || '').toLowerCase()
  if (n === 'id' || n === '_id' || n.endsWith('_id')) {
    return n === 'id' || n === '_id' ? 'pk' : 'fk'
  }
  if (n.includes('email')) return 'unique'
  return 'none'
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''")
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export { runSql as runDatabricksSql }
