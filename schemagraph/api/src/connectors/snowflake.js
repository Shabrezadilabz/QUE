/**
 * Snowflake connector — INFORMATION_SCHEMA introspection.
 *
 * Modes:
 * - fixture: load api/fixtures/snowflake_demo.json
 * - live: Snowflake SQL API (account + warehouse + database + schema + token/password)
 *
 * Schema metadata + capped samples only.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '../..')

/**
 * @param {object} config
 */
export async function introspectSnowflake(config = {}) {
  const mode =
    config.mode ||
    (config.account && (config.token || config.password) && config.database
      ? 'live'
      : 'fixture')

  if (mode === 'fixture') {
    return introspectFromFixture(config)
  }
  return introspectLive(config)
}

function resolveFixturePath(p) {
  if (!p) return resolve(API_ROOT, 'fixtures/snowflake_demo.json')
  if (p.match(/^[a-zA-Z]:[\\/]/) || p.startsWith('/')) return p
  return resolve(API_ROOT, p)
}

function guessKeyKind(name) {
  const n = String(name || '').toLowerCase()
  if (n === 'id' || n.endsWith('_id') && n === 'id') return 'pk'
  if (n === 'id') return 'pk'
  if (n.endsWith('_id')) return 'fk'
  if (n.includes('email')) return 'unique'
  return 'none'
}

function introspectFromFixture(config) {
  const path = resolveFixturePath(config.fixturesPath)
  if (!existsSync(path)) {
    // Soft empty schema so workspace can still add Snowflake connection
    return {
      schema: config.schema || 'PUBLIC',
      tables: [],
      foreignKeys: [],
      meta: { mode: 'fixture', fixtureMissing: path },
    }
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)
  const schema = config.schema || raw.schema || 'PUBLIC'

  const tables = (raw.tables || []).map((t) => ({
    name: t.name,
    entityKind: t.entityKind === 'VIEW' ? 'VIEW' : 'TABLE',
    columns: (t.columns || []).map((c, ordinal) => ({
      name: c.name,
      dataType: c.dataType || 'VARCHAR',
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
  }))

  return {
    schema,
    tables,
    foreignKeys,
    meta: { mode: 'fixture', path },
  }
}

/**
 * Live Snowflake SQL API (statement execution).
 * Requires: account, database, warehouse, schema, token (PAT) or password + username.
 */
async function introspectLive(config) {
  const account = String(config.account || '').replace(/\.snowflakecomputing\.com$/i, '')
  const database = config.database
  const schema = config.schema || 'PUBLIC'
  const warehouse = config.warehouse
  const username = config.username || config.user
  const token = config.token || process.env.STITCH_SNOWFLAKE_TOKEN
  const password = config.password || process.env.STITCH_SNOWFLAKE_PASSWORD

  if (!account || !database || !warehouse) {
    throw Object.assign(
      new Error('Snowflake live mode needs account, database, warehouse'),
      { status: 400 },
    )
  }
  if (!token && !(username && password)) {
    throw Object.assign(
      new Error('Snowflake live mode needs token (PAT) or username+password'),
      { status: 400 },
    )
  }

  const host = `${account}.snowflakecomputing.com`
  const authHeader = token
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

  const sql = `
    SELECT table_name, column_name, data_type, is_nullable, ordinal_position
    FROM ${database}.information_schema.columns
    WHERE table_schema = '${String(schema).replace(/'/g, "''")}'
    ORDER BY table_name, ordinal_position
  `

  const res = await fetch(`https://${host}/api/v2/statements`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Snowflake-Authorization-Token-Type': token ? 'KEYPAIR_JWT' : 'BASIC',
    },
    body: JSON.stringify({
      statement: sql,
      warehouse,
      database,
      schema,
      timeout: 60,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(
      new Error(`Snowflake SQL API ${res.status}: ${text.slice(0, 240)}`),
      { status: 502 },
    )
  }

  const body = await res.json()
  const rows = flattenSnowflakeRows(body)
  const byTable = new Map()
  for (const r of rows) {
    const tableName = r[0]
    const colName = r[1]
    const dataType = r[2]
    const nullable = String(r[3] || '').toUpperCase() !== 'NO'
    const ordinal = Number(r[4] || 0)
    if (!byTable.has(tableName)) {
      byTable.set(tableName, {
        name: tableName,
        entityKind: 'TABLE',
        columns: [],
      })
    }
    byTable.get(tableName).columns.push({
      name: colName,
      dataType: dataType || 'VARIANT',
      keyKind: guessKeyKind(colName),
      isNullable: nullable,
      ordinal,
      referencesLabel: null,
      sampleValues: [],
    })
  }

  return {
    schema,
    tables: [...byTable.values()],
    foreignKeys: [],
    meta: { mode: 'live', account, database, warehouse, schema },
  }
}

function flattenSnowflakeRows(body) {
  const data = body?.data
  if (Array.isArray(data)) return data
  const partitions = body?.resultSetMetaData?.partitionInfo
  if (partitions && Array.isArray(body?.data)) return body.data
  return []
}

/**
 * Read-only SELECT via Snowflake SQL API (capped).
 */
export async function runReadonlyQuery(config, sql, opts = {}) {
  const maxRows = Math.min(Number(opts.maxRows ?? 20), 20)
  const account = String(config.account || '').replace(/\.snowflakecomputing\.com$/i, '')
  const token = config.token || process.env.STITCH_SNOWFLAKE_TOKEN
  const password = config.password || process.env.STITCH_SNOWFLAKE_PASSWORD
  const username = config.username || config.user
  if (!account) throw new Error('Snowflake account required')
  const host = `${account}.snowflakecomputing.com`
  const authHeader = token
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

  const wrapped = `SELECT * FROM (${sql.replace(/;+\s*$/, '')}) AS que_q LIMIT ${maxRows}`
  const res = await fetch(`https://${host}/api/v2/statements`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      statement: wrapped,
      warehouse: config.warehouse,
      database: config.database,
      schema: config.schema || 'PUBLIC',
      timeout: 60,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Snowflake query failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const body = await res.json()
  const cols = (body?.resultSetMetaData?.rowType || []).map((c) => c.name)
  const data = flattenSnowflakeRows(body)
  return {
    columns: cols,
    rows: data.map((row) => {
      const obj = {}
      cols.forEach((c, i) => {
        obj[c] = row[i]
      })
      return obj
    }),
    rowCount: data.length,
  }
}
