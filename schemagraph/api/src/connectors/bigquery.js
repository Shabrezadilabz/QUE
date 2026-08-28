/**
 * BigQuery connector — INFORMATION_SCHEMA introspection (Wave 4.1).
 *
 * Modes:
 * - fixture: api/fixtures/bigquery_demo.json
 * - live: BigQuery jobs.query + OAuth access token (or GOOGLE_ACCESS_TOKEN)
 *
 * Schema metadata + capped samples only — never full table dumps.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '../..')

/**
 * @param {object} config
 */
export async function introspectBigQuery(config = {}) {
  const mode =
    config.mode ||
    (config.projectId && (config.token || config.accessToken)
      ? 'live'
      : 'fixture')

  if (mode === 'fixture') {
    return introspectFromFixture(config)
  }
  return introspectLive(config)
}

function resolveFixturePath(p) {
  if (!p) return resolve(API_ROOT, 'fixtures/bigquery_demo.json')
  if (p.match(/^[a-zA-Z]:[\\/]/) || p.startsWith('/')) return p
  return resolve(API_ROOT, p)
}

function simpleKeyKind(name) {
  const n = String(name || '').toLowerCase()
  if (
    n === 'id' ||
    n === 'customer_id' ||
    n === 'order_id' ||
    n === 'product_id'
  ) {
    return 'pk'
  }
  if (n.endsWith('_id')) return 'fk'
  if (n.includes('email')) return 'unique'
  return 'none'
}

function introspectFromFixture(config) {
  const path = resolveFixturePath(config.fixturesPath)
  if (!existsSync(path)) {
    return {
      schema: config.dataset || config.schema || 'analytics',
      tables: [],
      foreignKeys: [],
      meta: { mode: 'fixture', fixtureMissing: path },
    }
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)
  const schema = config.dataset || config.schema || raw.dataset || raw.schema || 'analytics'

  const tables = (raw.tables || []).map((t) => ({
    name: t.name,
    entityKind: t.entityKind === 'VIEW' ? 'VIEW' : 'TABLE',
    columns: (t.columns || []).map((c, ordinal) => ({
      name: c.name,
      dataType: c.dataType || 'STRING',
      keyKind: c.keyKind || simpleKeyKind(c.name),
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
    meta: {
      mode: 'fixture',
      path,
      projectId: config.projectId || raw.projectId || null,
    },
  }
}

/**
 * Live BigQuery via jobs.query REST API.
 * Requires: projectId, dataset, token (OAuth access token).
 */
async function introspectLive(config) {
  const projectId = config.projectId || config.project
  const dataset = config.dataset || config.schema
  const token =
    config.token ||
    config.accessToken ||
    process.env.GOOGLE_ACCESS_TOKEN ||
    process.env.STITCH_BIGQUERY_TOKEN
  const location = config.location || 'US'
  const maxTables = Math.min(Math.max(Number(config.maxTables) || 80, 1), 200)
  const includeSamples = config.includeSamples === true
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)

  if (!projectId || !dataset) {
    throw Object.assign(
      new Error('BigQuery live mode needs projectId and dataset'),
      { status: 400 },
    )
  }
  if (!token) {
    throw Object.assign(
      new Error(
        'BigQuery live mode needs OAuth access token (config.token or GOOGLE_ACCESS_TOKEN)',
      ),
      { status: 400 },
    )
  }

  const tablesSql = `
    SELECT table_name, table_type
    FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.TABLES\`
    WHERE table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY table_name
    LIMIT ${maxTables}
  `
  const tableRows = await bqQuery(projectId, token, tablesSql, location)
  const tableNames = tableRows.map((r) => String(r.f?.[0]?.v || r.table_name || '')).filter(Boolean)

  // Prefer named fields if present
  const names = tableRows
    .map((r) => {
      if (r.table_name) return String(r.table_name)
      if (Array.isArray(r.f)) return String(r.f[0]?.v || '')
      return ''
    })
    .filter(Boolean)

  const useNames = names.length ? names : tableNames

  const colsSql = `
    SELECT table_name, column_name, data_type, is_nullable, ordinal_position
    FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name IN (${useNames.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(',') || "''"})
    ORDER BY table_name, ordinal_position
  `
  const colRows = useNames.length
    ? await bqQuery(projectId, token, colsSql, location)
    : []

  const byTable = new Map()
  for (const name of useNames) {
    byTable.set(name, {
      name,
      entityKind: 'TABLE',
      columns: [],
    })
  }
  for (const r of colRows) {
    const tableName = cell(r, 'table_name', 0)
    const colName = cell(r, 'column_name', 1)
    const dataType = cell(r, 'data_type', 2)
    const isNullable = String(cell(r, 'is_nullable', 3) || 'YES').toUpperCase() !== 'NO'
    const ordinal = Number(cell(r, 'ordinal_position', 4) || 0)
    const t = byTable.get(tableName)
    if (!t || !colName) continue
    t.columns.push({
      name: colName,
      dataType: dataType || 'STRING',
      keyKind: simpleKeyKind(colName),
      isNullable,
      ordinal,
      referencesLabel: null,
      sampleValues: [],
    })
  }

  if (includeSamples) {
    for (const t of byTable.values()) {
      if (!t.columns.length) continue
      try {
        const sampleSql = `SELECT * FROM \`${projectId}.${dataset}.${t.name}\` LIMIT ${sampleLimit}`
        const rows = await bqQuery(projectId, token, sampleSql, location)
        for (let ci = 0; ci < t.columns.length; ci++) {
          const samples = []
          for (const row of rows) {
            const v = cell(row, t.columns[ci].name, ci)
            if (v != null && v !== '') samples.push(String(v).slice(0, 120))
          }
          t.columns[ci].sampleValues = samples.slice(0, sampleLimit)
        }
      } catch {
        /* samples optional */
      }
    }
  }

  // Soft FK inference from naming
  const foreignKeys = []
  const pkByTable = new Map()
  for (const t of byTable.values()) {
    const pk = t.columns.find((c) => c.keyKind === 'pk')
    if (pk) pkByTable.set(t.name, pk.name)
  }
  for (const t of byTable.values()) {
    for (const c of t.columns) {
      if (c.keyKind !== 'fk') continue
      const base = c.name.replace(/_id$/i, '')
      for (const [tbl, pk] of pkByTable) {
        if (tbl === t.name) continue
        if (
          tbl.toLowerCase().includes(base.toLowerCase()) ||
          pk.toLowerCase() === c.name.toLowerCase()
        ) {
          foreignKeys.push({
            fromTable: t.name,
            fromColumn: c.name,
            toTable: tbl,
            toColumn: pk,
          })
          c.referencesLabel = `${tbl}.${pk}`
          break
        }
      }
    }
  }

  return {
    schema: dataset,
    tables: [...byTable.values()],
    foreignKeys,
    meta: {
      mode: 'live',
      projectId,
      dataset,
      location,
      tableCount: byTable.size,
      engine: 'bigquery',
    },
  }
}

function cell(row, name, idx) {
  if (row && row[name] != null) return row[name]
  if (row?.f && row.f[idx]) return row.f[idx].v
  return null
}

async function bqQuery(projectId, token, sql, location) {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      location,
      maxResults: 5000,
      timeoutMs: 30000,
    }),
    signal: AbortSignal.timeout(45000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.error?.errors?.[0]?.message ||
      `BigQuery HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status === 401 || res.status === 403 ? 401 : 502
    err.healthKind = res.status === 401 || res.status === 403 ? 'auth' : 'network'
    throw err
  }
  const fields = json.schema?.fields || []
  const rows = json.rows || []
  if (!fields.length) return rows
  return rows.map((r) => {
    const obj = { f: r.f }
    fields.forEach((f, i) => {
      obj[f.name] = r.f?.[i]?.v ?? null
    })
    return obj
  })
}

/**
 * S5.2 — Read-only BigQuery SELECT for liveExec / validate.
 */
export async function runReadonlyQuery(config, sql, opts = {}) {
  const projectId = config.projectId || config.project
  const token =
    config.token ||
    config.accessToken ||
    process.env.GOOGLE_ACCESS_TOKEN
  const location = config.location || 'US'
  const maxRows = Math.min(Math.max(Number(opts.maxRows) || 20, 1), 20)
  let text = String(sql || '').trim()
  if (!/\blimit\s+\d+/i.test(text)) {
    text = `${text}\nLIMIT ${maxRows}`
  }
  const rows = await bqQuery(projectId, token, text, location)
  const columns =
    rows.length > 0
      ? Object.keys(rows[0]).map((name) => ({ name, dataType: 'STRING' }))
      : []
  return {
    rows,
    columns,
    rowCount: rows.length,
    engine: 'bigquery',
  }
}