/**
 * PostgreSQL connector — schema introspection only (no raw table dumps).
 * Reads information_schema + optional capped column samples.
 */
import pg from 'pg'

/**
 * @typedef {object} PgConnectionConfig
 * @property {string} [host]
 * @property {number} [port]
 * @property {string} [database]
 * @property {string} [user]
 * @property {string} [password]
 * @property {string} [schema]  // default public
 * @property {boolean} [ssl]
 * @property {boolean} [includeSamples]
 * @property {number} [sampleLimit]
 */

/**
 * @param {PgConnectionConfig} config
 * @returns {pg.PoolConfig}
 */
export function toPoolConfig(config = {}) {
  return {
    host: config.host ?? 'localhost',
    port: Number(config.port ?? 5432),
    database: config.database ?? 'customer_demo',
    user: config.user ?? 'stitch',
    password: config.password ?? process.env.STITCH_SOURCE_PG_PASSWORD ?? 'stitch',
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 2,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 15_000,
  }
}

/**
 * Open a short-lived client to the customer source.
 * @param {PgConnectionConfig} config
 */
export async function withSourceClient(config, fn) {
  const pool = new pg.Pool(toPoolConfig(config))
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
    await pool.end()
  }
}

/**
 * Introspect tables, columns, PKs, FKs for one schema.
 * @param {import('pg').PoolClient} client
 * @param {PgConnectionConfig} config
 */
export async function introspectPostgres(client, config = {}) {
  const schema = config.schema ?? 'public'
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)

  const { rows: tables } = await client.query(
    `SELECT table_name AS name,
            CASE WHEN table_type = 'VIEW' THEN 'VIEW' ELSE 'TABLE' END AS entity_kind
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_type IN ('BASE TABLE', 'VIEW')
     ORDER BY table_name`,
    [schema],
  )

  const { rows: columns } = await client.query(
    `SELECT table_name, column_name, data_type, udt_name,
            is_nullable, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = $1
     ORDER BY table_name, ordinal_position`,
    [schema],
  )

  const { rows: pks } = await client.query(
    `SELECT kcu.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = $1
       AND tc.constraint_type = 'PRIMARY KEY'`,
    [schema],
  )

  const { rows: fks } = await client.query(
    `SELECT
       kcu.table_name AS from_table,
       kcu.column_name AS from_column,
       ccu.table_name AS to_table,
       ccu.column_name AS to_column,
       tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
     WHERE tc.table_schema = $1
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
          client,
          schema,
          t.name,
          col.column_name,
          sampleLimit,
        )
      }

      mappedCols.push({
        name: col.column_name,
        dataType: formatDataType(col),
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

function formatDataType(col) {
  if (col.data_type === 'USER-DEFINED' && col.udt_name) return col.udt_name
  if (col.data_type === 'ARRAY' && col.udt_name) {
    return col.udt_name.startsWith('_')
      ? `${col.udt_name.slice(1)}[]`
      : col.udt_name
  }
  return col.data_type
}

async function sampleColumn(client, schema, table, column, limit) {
  // Identifiers from information_schema only — still quote safely
  const sql = `SELECT DISTINCT "${column}"::text AS v
               FROM "${schema}"."${table}"
               WHERE "${column}" IS NOT NULL
               LIMIT $1`
  try {
    const { rows } = await client.query(sql, [limit])
    return rows.map((r) => String(r.v)).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Read-only query against a Postgres source (caller must lint SQL first).
 * @param {PgConnectionConfig} config
 * @param {string} sql
 * @param {{ maxRows?: number, timeoutMs?: number }} [opts]
 */
export async function runReadonlyQuery(config, sql, opts = {}) {
  const maxRows = Math.min(Math.max(Number(opts.maxRows ?? 20), 1), 20)
  const timeoutMs = Math.min(Number(opts.timeoutMs ?? 20_000), 60_000)
  return withSourceClient(config, async (client) => {
    await client.query(`SET statement_timeout = ${Math.round(timeoutMs)}`)
    const started = Date.now()
    const { rows, fields } = await client.query(sql)
    const sliced = rows.slice(0, maxRows)
    return {
      engine: 'postgresql',
      columns: (fields || []).map((f) => ({
        name: f.name,
        dataType: String(f.dataTypeID || 'unknown'),
      })),
      rows: sliced.map((r) => {
        const out = {}
        for (const key of Object.keys(r)) {
          const v = r[key]
          out[key] =
            v == null
              ? null
              : typeof v === 'object'
                ? JSON.parse(JSON.stringify(v))
                : v
        }
        return out
      }),
      rowCount: sliced.length,
      truncated: rows.length > maxRows,
      durationMs: Date.now() - started,
    }
  })
}

