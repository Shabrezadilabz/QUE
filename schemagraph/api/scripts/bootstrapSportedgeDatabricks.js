/**
 * Bootstrap SportEdge tables into LIVE Databricks (SQL Warehouse API).
 *
 *   $env:SPORTEDGE_DATABRICKS_HOST="dbc-xxxxx.cloud.databricks.com"
 *   $env:SPORTEDGE_DATABRICKS_WAREHOUSE_ID="abc123def456"
 *   $env:SPORTEDGE_DATABRICKS_TOKEN="dapi..."
 *   $env:SPORTEDGE_DATABRICKS_CATALOG="main"          # optional
 *   $env:SPORTEDGE_DATABRICKS_SCHEMA="sportedge"      # optional
 *   npm run bootstrap:sportedge-dbx
 *
 * If catalog/schema differ, edit db/sportedge/databricks/*.sql or set env and
 * replace main.sportedge in SQL before run.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SQL_DIR = resolve(__dirname, '../../db/sportedge/databricks')

const HOST = String(process.env.SPORTEDGE_DATABRICKS_HOST || '')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')
const WAREHOUSE_ID = process.env.SPORTEDGE_DATABRICKS_WAREHOUSE_ID || ''
const TOKEN = process.env.SPORTEDGE_DATABRICKS_TOKEN || process.env.STITCH_DATABRICKS_TOKEN || ''
const CATALOG = process.env.SPORTEDGE_DATABRICKS_CATALOG || 'main'
const SCHEMA = process.env.SPORTEDGE_DATABRICKS_SCHEMA || 'sportedge'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runSql(sql) {
  const url = `https://${HOST}/api/2.0/sql/statements`
  const started = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: WAREHOUSE_ID,
      statement: sql,
      wait_timeout: '50s',
      on_wait_timeout: 'CONTINUE',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
    }),
  })
  if (!started.ok) {
    throw new Error(`Start failed (${started.status}): ${await started.text()}`)
  }
  let body = await started.json()
  const id = body.statement_id
  const deadline = Date.now() + 180_000
  while (body.status?.state === 'PENDING' || body.status?.state === 'RUNNING') {
    if (Date.now() > deadline) throw new Error('Statement timed out')
    await sleep(1000)
    const poll = await fetch(`${url}/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    if (!poll.ok) throw new Error(`Poll failed (${poll.status})`)
    body = await poll.json()
  }
  if (body.status?.state !== 'SUCCEEDED') {
    throw new Error(body.status?.error?.message || body.status?.state || 'SQL failed')
  }
  return body
}

function splitStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--[^\n]*\n/gm, '').trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'))
}

function applyCatalogSchema(sql) {
  return sql
    .replace(/\bmain\.sportedge\b/g, `${CATALOG}.${SCHEMA}`)
    .replace(
      /CREATE SCHEMA IF NOT EXISTS main\.sportedge/g,
      `CREATE SCHEMA IF NOT EXISTS ${CATALOG}.${SCHEMA}`,
    )
}

async function main() {
  if (!HOST || !WAREHOUSE_ID || !TOKEN) {
    console.error(
      'Set SPORTEDGE_DATABRICKS_HOST, SPORTEDGE_DATABRICKS_WAREHOUSE_ID, SPORTEDGE_DATABRICKS_TOKEN',
    )
    process.exit(1)
  }

  console.log(`Databricks live bootstrap → ${CATALOG}.${SCHEMA} @ ${HOST}`)

  for (const file of ['001_ddl.sql', '002_seed.sql']) {
    const raw = readFileSync(resolve(SQL_DIR, file), 'utf8')
    const statements = splitStatements(applyCatalogSchema(raw))
    console.log(`\n${file} (${statements.length} statements)`)
    for (let i = 0; i < statements.length; i++) {
      const head = statements[i].slice(0, 55).replace(/\s+/g, ' ')
      process.stdout.write(`  [${i + 1}/${statements.length}] ${head}… `)
      try {
        await runSql(statements[i])
        console.log('OK')
      } catch (e) {
        console.log('FAIL')
        console.error(e.message)
        process.exit(1)
      }
    }
  }

  const verify = await runSql(
    `SELECT COUNT(*) AS n FROM \`${CATALOG}\`.\`${SCHEMA}\`.fact_orders`,
  )
  console.log('\nVerify fact_orders count:', verify.result?.data_array?.[0]?.[0] ?? '(see Databricks UI)')
  console.log('\nDone. Connect Que → Databricks → Live with same host/warehouse/token/catalog/schema.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
