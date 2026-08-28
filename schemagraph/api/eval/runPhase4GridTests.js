/**
 * Phase 4.5 — Sigma grid explore (unit tests, no DB).
 */
import {
  sanitizeTableRef,
  compileGridFormula,
  buildGridSelectSql,
} from '../src/studio/gridExplore.js'

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

assert(sanitizeTableRef('raw_shopify_orders') === 'raw_shopify_orders', 'table ref')
try {
  sanitizeTableRef('bad;drop')
  assert(false, 'reject bad table')
} catch {
  ok('reject bad table')
}

const sumF = compileGridFormula('=SUM(revenue)')
assert(sumF.mode === 'expr' && sumF.expr === 'SUM(revenue)', 'SUM formula')

const full = compileGridFormula('SELECT a FROM t')
assert(full.mode === 'sql', 'full select formula')

const built = buildGridSelectSql({
  table: 'raw_orders',
  columns: [
    { field: 'region', alias: 'region' },
    { field: 'amount', agg: 'sum', alias: 'total' },
  ],
  limit: 50,
})
assert(built.includes('GROUP BY'), 'agg triggers group by')
assert(built.includes('raw_orders'), 'from table')
assert(built.includes('LIMIT 50'), 'limit applied')

const filtered = buildGridSelectSql({
  table: 'raw_orders',
  columns: [{ field: 'id' }],
  filters: [{ field: 'brand', op: 'eq', value: 'Nike' }],
})
assert(filtered.includes('_que_board'), 'filters wrap subquery')

const withCalc = buildGridSelectSql({
  table: 'raw_orders',
  columns: [{ field: 'region', alias: 'region' }],
  formulas: [{ alias: 'total_rev', expr: 'SUM(revenue)' }],
})
assert(withCalc.includes('SUM(revenue)'), 'QueExpr calc column in grid SQL')
assert(withCalc.includes('GROUP BY'), 'calc agg triggers group by')

if (failed > 0) {
  console.error(`\nPhase 4 Grid tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 4 Grid tests passed')
