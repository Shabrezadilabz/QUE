/**
 * Prod ship — verify required platform migrations exist on disk (no DB).
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_ROOT = resolve(__dirname, '../../db')

/** Migrations required for Phase 1–5 platform release (048–053). */
export const REQUIRED_PROD_MIGRATIONS = [
  '048_que_warehouse.sql',
  '049_ssm_workspace_events.sql',
  '050_warehouse_job_queue.sql',
  '051_que_sql_models.sql',
  '052_bi_access_groups.sql',
  '053_que_pipes.sql',
]

let failed = 0

function ok(label) {
  console.log(`ok: ${label}`)
}

function assert(cond, label) {
  if (!cond) {
    failed += 1
    console.error(`FAIL: ${label}`)
  } else {
    ok(label)
  }
}

assert(existsSync(DB_ROOT), `db directory exists (${DB_ROOT})`)

const onDisk = existsSync(DB_ROOT)
  ? readdirSync(DB_ROOT).filter((f) => /^\d{3}.*\.sql$/i.test(f))
  : []

for (const file of REQUIRED_PROD_MIGRATIONS) {
  assert(onDisk.includes(file), `migration present: ${file}`)
}

const sorted = [...onDisk].sort()
const last = sorted[sorted.length - 1]
assert(
  last === '053_que_pipes.sql' || sorted.includes('053_que_pipes.sql'),
  '053_que_pipes is latest required migration',
)

if (failed > 0) {
  console.error(`\nMigrate check FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll prod migration files present (048–053)')
