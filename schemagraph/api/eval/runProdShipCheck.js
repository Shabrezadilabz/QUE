/**
 * Prod ship preflight — local checks before Render/Vercel deploy (no live API required).
 * Run: npm run test:prod-ship
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '..')
const UI_ROOT = resolve(__dirname, '../..')
const WORKER_DOCKER = resolve(API_ROOT, 'docker/que-worker/Dockerfile')

/** Migrations required for Phase 1–5 platform release (048–053). */
const REQUIRED_PROD_MIGRATIONS = [
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

assert(existsSync(WORKER_DOCKER), 'worker Dockerfile present')
assert(
  existsSync(resolve(UI_ROOT, 'docs/ops/production-deploy-checklist.md')),
  'production deploy checklist doc',
)
assert(existsSync(resolve(API_ROOT, 'scripts/runWarehouseWorker.js')), 'worker entry script')
assert(existsSync(resolve(API_ROOT, 'src/load/queLoadHub.js')), 'load ops hub')
assert(existsSync(resolve(API_ROOT, 'src/studio/queExpr.js')), 'QueExpr compiler')
assert(existsSync(resolve(API_ROOT, 'src/connectors/stripe.js')), 'Stripe connector')
assert(existsSync(resolve(API_ROOT, 'src/connectors/hubspot.js')), 'HubSpot connector')
assert(existsSync(resolve(API_ROOT, 'src/connectors/mysql.js')), 'MySQL connector')
assert(existsSync(resolve(API_ROOT, 'fixtures/stripe_demo.json')), 'Stripe fixture')
assert(existsSync(resolve(API_ROOT, 'fixtures/mysql_demo.json')), 'MySQL fixture')
assert(existsSync(resolve(API_ROOT, 'fixtures/shopify_demo.json')), 'Shopify fixture')
assert(existsSync(resolve(API_ROOT, 'fixtures/razorpay_demo.json')), 'Razorpay fixture')
assert(existsSync(resolve(UI_ROOT, 'src/components/chat/ChatSsmRouteChip.tsx')), 'chat SSM route chip')

for (const file of REQUIRED_PROD_MIGRATIONS) {
  assert(
    existsSync(resolve(__dirname, '../../db', file)),
    `migration on disk: ${file}`,
  )
}

if (failed > 0) {
  console.error(`\nProd ship preflight FAILED (${failed})`)
  process.exit(1)
}

console.log('\nProd ship preflight passed locally.')
console.log('Next: npm run test:deploy-gate · cd .. && npm run build')
console.log('Live: $env:QUE_API_BASE="https://your-api"; npm run test:smoke')
console.log('Worker: deploy adc/schemagraph/api/docker/que-worker/Dockerfile on Render')
