/**
 * MySQL connector — fixture POC + live information_schema introspect (India SMB).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

function inferSsl(config = {}) {
  if (config.ssl === true) return { rejectUnauthorized: false }
  if (config.ssl === false) return false
  const host = String(config.host ?? 'localhost').toLowerCase()
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.')
  return local ? false : { rejectUnauthorized: false }
}

export function toMysqlPoolConfig(config = {}) {
  return {
    host: config.host ?? 'localhost',
    port: Number(config.port ?? 3306),
    database: config.database ?? 'customer_demo',
    user: config.user ?? 'root',
    password: config.password ?? '',
    ssl: inferSsl(config),
    connectTimeout: 8_000,
  }
}

/**
 * @param {object} config
 * @param {import('mysql2/promise').Pool} pool
 */
export async function introspectMysqlLive(pool, config = {}) {
  const schema = config.database ?? config.schema ?? 'customer_demo'
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)

  const [tables] = await pool.query(
    `SELECT table_name AS name,
            CASE WHEN table_type = 'VIEW' THEN 'VIEW' ELSE 'TABLE' END AS entity_kind
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_type IN ('BASE TABLE', 'VIEW')
     ORDER BY table_name`,
    [schema],
  )

  const [columns] = await pool.query(
    `SELECT table_name, column_name, data_type, column_type,
            is_nullable, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = ?
     ORDER BY table_name, ordinal_position`,
    [schema],
  )

  const [pks] = await pool.query(
    `SELECT kcu.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = ?
       AND tc.constraint_type = 'PRIMARY KEY'`,
    [schema],
  )

  const [fks] = await pool.query(
    `SELECT
       kcu.table_name AS from_table,
       kcu.column_name AS from_column,
       kcu.referenced_table_name AS to_table,
       kcu.referenced_column_name AS to_column,
       tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = ?
       AND tc.constraint_type = 'FOREIGN KEY'
     ORDER BY kcu.table_name, kcu.ordinal_position`,
    [schema],
  )

  const pkSet = new Set(pks.map((r) => `${r.table_name}.${r.column_name}`))
  const fkByCol = new Map()
  for (const fk of fks) {
    fkByCol.set(`${fk.from_table}.${fk.from_column}`, fk)
  }

  const colsByTable = new Map()
  for (const col of columns) {
    if (!colsByTable.has(col.table_name)) colsByTable.set(col.table_name, [])
    colsByTable.get(col.table_name).push(col)
  }

  const resultTables = []
  for (const t of tables) {
    const tableCols = colsByTable.get(t.name) ?? []
    const mappedCols = []
    for (const col of tableCols) {
      const key = `${t.name}.${col.column_name}`
      const fk = fkByCol.get(key)
      let keyKind = 'none'
      if (pkSet.has(key)) keyKind = 'pk'
      else if (fk) keyKind = 'fk'

      let sampleValues = []
      if (includeSamples && t.entity_kind === 'TABLE') {
        sampleValues = await sampleColumn(
          pool,
          schema,
          t.name,
          col.column_name,
          sampleLimit,
        )
      }

      mappedCols.push({
        name: col.column_name,
        dataType: col.column_type || col.data_type,
        keyKind,
        isNullable: col.is_nullable === 'YES',
        ordinal: Number(col.ordinal_position) - 1,
        referencesLabel: fk
          ? `${fk.from_table}.${fk.from_column} → ${fk.to_table}.${fk.to_column}`
          : null,
        sampleValues,
      })
    }

    resultTables.push({
      name: t.name,
      entityKind: t.entity_kind,
      columns: mappedCols,
    })
  }

  return {
    schema,
    tables: resultTables,
    foreignKeys: fks.map((fk) => ({
      fromTable: fk.from_table,
      fromColumn: fk.from_column,
      toTable: fk.to_table,
      toColumn: fk.to_column,
      constraintName: fk.constraint_name,
    })),
  }
}

async function sampleColumn(pool, schema, table, column, limit) {
  const sql = `SELECT DISTINCT CAST(\`${column}\` AS CHAR) AS v
               FROM \`${schema}\`.\`${table}\`
               WHERE \`${column}\` IS NOT NULL
               LIMIT ?`
  try {
    const [rows] = await pool.query(sql, [limit])
    return rows.map((r) => String(r.v)).filter(Boolean)
  } catch {
    return []
  }
}

export async function withMysqlPool(config, fn) {
  const mysql = await import('mysql2/promise')
  const pool = mysql.createPool(toMysqlPoolConfig(config))
  try {
    return await fn(pool)
  } finally {
    await pool.end()
  }
}

export async function introspectMysql(config = {}) {
  const mode =
    config.mode ||
    (config.host && config.user && config.password ? 'live' : 'fixture')

  if (mode === 'fixture') {
    return introspectFromJsonFixture(
      config,
      'fixtures/mysql_demo.json',
      'mysql',
    )
  }

  if (!config.host && !config.database) {
    return introspectFromJsonFixture(
      config,
      'fixtures/mysql_demo.json',
      'mysql',
    )
  }

  return withMysqlPool(config, (pool) => introspectMysqlLive(pool, config))
}
