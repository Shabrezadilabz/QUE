/**
 * Que Catalog unified index (unit tests, no DB).
 */
import {
  filterCatalogEntries,
  filterCatalogByKind,
  summarizeCatalogEntries,
} from '../src/catalog/queCatalogIndex.js'

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

const sample = [
  {
    id: 'table:1',
    kind: 'table',
    name: 'orders',
    description: 'Shop orders',
    connection: 'Shopify',
    tags: ['fact'],
    certified: true,
    updatedAt: '2026-01-01',
  },
  {
    id: 'metric:2',
    kind: 'metric',
    name: 'Revenue',
    description: 'Total revenue KPI',
    tags: [],
    certified: false,
    updatedAt: '2026-01-02',
  },
]

const byKind = filterCatalogByKind(sample, 'metric')
assert(byKind.length === 1 && byKind[0].name === 'Revenue', 'filter by kind')

const byQ = filterCatalogEntries(sample, 'shop')
assert(byQ.length === 1 && byQ[0].kind === 'table', 'search connection/name')

const stats = summarizeCatalogEntries(sample)
assert(stats.total === 2 && stats.certified === 1, 'catalog stats')
assert(stats.byKind.table === 1, 'stats by kind')

if (failed > 0) {
  console.error(`\nPhase Catalog tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Catalog tests passed')
