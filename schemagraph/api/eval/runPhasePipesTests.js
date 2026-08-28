/**
 * Que Pipes — NL pipeline spec helpers (unit tests, no DB).
 */
import {
  buildHeuristicPipeSpec,
  parsePipeSpecFromLlm,
  inferPipeTables,
} from '../src/quePipes.js'

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

const pack = {
  tables: [
    {
      name: 'orders',
      connection: 'Shopify',
      columns: [{ name: 'id' }, { name: 'amount' }],
    },
  ],
}

const spec = buildHeuristicPipeSpec('clean orders for mart', pack, {
  intent: 'create_job',
})
assert(spec.steps.length === 3, 'heuristic has 3 phases')
assert(spec.steps[1].sql.includes('orders'), 'transform sql references table')

const tables = inferPipeTables('join orders to customers', pack.tables)
assert(tables.includes('orders'), 'infer tables from prompt')

const parsed = parsePipeSpecFromLlm(
  JSON.stringify({
    title: 'Revenue pipe',
    tables: ['orders'],
    steps: [{ phase: 'transform', label: 'T', detail: 'd', sql: 'SELECT 1' }],
  }),
  'revenue',
)
assert(parsed?.title === 'Revenue pipe', 'parse llm json spec')

if (failed > 0) {
  console.error(`\nPhase Pipes tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Pipes tests passed')
