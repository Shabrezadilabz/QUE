/**
 * Phase 1 — Que Warehouse foundation (unit tests, no DB).
 */
import {
  warehouseSchemaName,
  connectionSlug,
  rawTableName,
  shouldReplicateToWarehouse,
  shouldShowMonkPrompt,
  summarizePhase1Readiness,
  sliceTablesForReplicate,
} from '../src/queWarehouse.js'

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

const ws = '22222222-2222-2222-2222-222222222222'

assert(
  warehouseSchemaName(ws) === 'wh_22222222222222222222222222222222',
  'warehouse schema name',
)
assert(connectionSlug('Shopify Store!') === 'shopify_store', 'connection slug')
assert(
  rawTableName('shopify', 'orders').startsWith('raw_shopify_'),
  'raw table prefix',
)
assert(
  shouldReplicateToWarehouse({ enableQueWarehouse: true }, { replicate_to_warehouse: true }, {}),
  'replicate default on',
)
assert(
  !shouldReplicateToWarehouse({ enableQueWarehouse: false }, { replicate_to_warehouse: true }, {}),
  'replicate off when workspace disabled',
)
assert(
  !shouldReplicateToWarehouse(
    { enableQueWarehouse: true, replicateToWarehouseDefault: false },
    { replicate_to_warehouse: true },
    {},
  ),
  'replicate off when workspace default disabled',
)
assert(
  !shouldReplicateToWarehouse({}, { replicate_to_warehouse: false }, {}),
  'replicate off per connection',
)
assert(shouldShowMonkPrompt({ monk_prompt_dismissed: false }), 'monk prompt show')
assert(!shouldShowMonkPrompt({ monk_prompt_dismissed: true }), 'monk prompt hidden')

const ready = summarizePhase1Readiness({
  provisioned: true,
  rawTableCount: 3,
  connectorCount: 2,
  replicateDefaultOn: true,
})
assert(ready.status === 'ready', 'phase1 ready when WH + raw tables')
assert(ready.replicateDefaultOn === true, 'replicate default flagged')

const review = summarizePhase1Readiness({
  provisioned: true,
  rawTableCount: 0,
  connectorCount: 1,
})
assert(review.status === 'review', 'phase1 review when provisioned no tables')

const empty = summarizePhase1Readiness({})
assert(empty.status === 'empty', 'phase1 empty with no connectors')

const sliced = sliceTablesForReplicate(
  [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
  2,
)
assert(sliced.length === 2 && sliced[0].name === 'a', 'slice tables for replicate')

if (failed > 0) {
  console.error(`\nPhase 1 tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 1 tests passed')
