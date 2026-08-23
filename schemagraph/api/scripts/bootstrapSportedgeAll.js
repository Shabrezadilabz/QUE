/**
 * Bootstrap ALL SportEdge test data:
 *   1. Excel + CSV + Databricks JSON (always, local files)
 *   2. Postgres (if SPORTEDGE_PG_URL set)
 *   3. MongoDB (if SPORTEDGE_MONGO_URI set)
 *
 *   npm run bootstrap:sportedge-all
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '..')

function run(label, script) {
  console.log(`\n=== ${label} ===`)
  const r = spawnSync('node', [resolve(__dirname, script)], {
    cwd: API_ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) {
    console.error(`Failed: ${label}`)
    process.exit(r.status || 1)
  }
}

console.log('SportEdge — bootstrap all connectors\n')

run('Local fixtures (Excel, CSV, Databricks JSON)', 'generateSportedgeFixtures.js')

if (process.env.SPORTEDGE_PG_URL) {
  run('Postgres (Neon)', 'bootstrapSportedgePostgres.js')
} else {
  console.log('\n=== Postgres — SKIPPED ===')
  console.log('  Set SPORTEDGE_PG_URL to load Neon data.')
}

if (process.env.SPORTEDGE_MONGO_URI) {
  run('MongoDB (Atlas)', 'bootstrapSportedgeMongo.js')
} else {
  console.log('\n=== MongoDB — SKIPPED ===')
  console.log('  Set SPORTEDGE_MONGO_URI to load Atlas data (optional for now).')
}

if (
  process.env.SPORTEDGE_DATABRICKS_HOST &&
  process.env.SPORTEDGE_DATABRICKS_WAREHOUSE_ID &&
  process.env.SPORTEDGE_DATABRICKS_TOKEN
) {
  run('Databricks LIVE', 'bootstrapSportedgeDatabricks.js')
} else {
  console.log('\n=== Databricks LIVE — SKIPPED ===')
  console.log('  Set SPORTEDGE_DATABRICKS_HOST, SPORTEDGE_DATABRICKS_WAREHOUSE_ID, SPORTEDGE_DATABRICKS_TOKEN')
}

console.log('\n✓ Done. See docs/testing/ecommerce/00-ALL-CONNECTORS.md for Vercel steps.')
