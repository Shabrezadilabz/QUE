/**
 * Phase 4.4 — Report Studio filters, layouts, drill SQL (unit tests).
 */
import {
  applyFiltersToSql,
  mergeBoardFilters,
  filtersFromParameters,
  sanitizeSqlIdent,
} from '../src/studio/boardFilters.js'
import {
  buildLayoutPatches,
  layoutSlotsForPreset,
} from '../src/studio/layoutPresets.js'

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

assert(sanitizeSqlIdent('brand') === 'brand', 'valid ident')
try {
  sanitizeSqlIdent('bad;drop')
  assert(false, 'reject bad ident')
} catch {
  ok('reject bad ident')
}

const filtered = applyFiltersToSql(
  'SELECT a, b FROM t',
  [{ field: 'brand', op: 'eq', value: 'Nike' }],
)
assert(filtered.includes('_que_board'), 'wraps subquery')
assert(filtered.includes('Nike'), 'filter value in sql')

const merged = mergeBoardFilters(
  [{ field: 'region', op: 'eq', value: 'IN' }],
  { field: 'brand', value: 'Acme' },
)
assert(merged.length === 2, 'merge cross-filter')

const params = filtersFromParameters(
  [{ id: 'brand', bindField: 'brand_name', defaultValue: 'All' }],
  { brand: 'X' },
)
assert(params[0]?.field === 'brand_name', 'parameter bind field')

const slots = layoutSlotsForPreset('executive', 3)
assert(slots.length === 3 && slots[0].w === 4, 'executive layout slots')

const patches = buildLayoutPatches(
  [{ id: 'c1', config: {} }, { id: 'c2', config: {} }],
  'mobile',
)
assert(patches.length === 2 && patches[0].layout.w === 12, 'mobile full width')

if (failed > 0) {
  console.error(`\nPhase 4 RS tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 4 RS tests passed')
