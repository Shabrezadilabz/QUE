/**
 * Phase 3 — Execution UX (unit tests, no DB).
 */
import { materializedGraphObjectName } from '../src/warehouseGraph.js'
import { prepareReadonlySql, LIVE_VALIDATE_MAX_ROWS } from '../src/liveExec.js'

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

assert(
  materializedGraphObjectName('public', 'que_orders_mart') === 'public.que_orders_mart',
  'materialized graph object name with schema',
)
assert(
  materializedGraphObjectName(null, 'que_orders_mart') === 'que_orders_mart',
  'materialized graph object name bare',
)

const ro = prepareReadonlySql('SELECT * FROM orders', 20)
assert(/\blimit\s+20/i.test(ro), 'readonly sql adds limit')
assert(!/\binsert\b/i.test(ro), 'readonly sql select only')

const capped = prepareReadonlySql('SELECT 1 LIMIT 500', LIVE_VALIDATE_MAX_ROWS)
assert(/\blimit\s+20/i.test(capped), 'readonly sql caps high limit')

// Phase 3.2 contract — CEO summary must not embed row payloads (static check)
const ceoSummarySrc = await import('node:fs/promises').then((fs) =>
  fs.readFile(new URL('../src/chatLiveQuery.js', import.meta.url), 'utf8'),
)
assert(
  !ceoSummarySrc.includes('sampleLines = rows'),
  'CEO summary does not map row payloads into LLM prompt',
)
assert(
  ceoSummarySrc.includes('Individual row values are shown in the UI table only'),
  'CEO summary uses metadata-only prompt',
)

const widgetSqlSrc = await import('node:fs/promises').then((fs) =>
  fs.readFile(new URL('../src/studio/widgetSql.js', import.meta.url), 'utf8'),
)
assert(
  widgetSqlSrc.includes("aiAccess: 'denied'"),
  'widget SQL marks AI access denied',
)
assert(
  widgetSqlSrc.includes('row payloads never sent to AI'),
  'widget SQL documents AI isolation',
)

if (failed > 0) {
  console.error(`\nPhase 3 tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 3 tests passed')
