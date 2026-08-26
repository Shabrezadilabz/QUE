/**
 * Metric pack seed — SQL template substitution tests.
 * Run: node eval/runMetricPackSeedTests.js
 */
import { buildKpiSqlFromPack } from '../src/metricPackSeed.js'
import {
  applyTablePlaceholders,
  buildEntityMappings,
} from '../src/templateMapper.js'
import { getIndustryPack } from '../src/packs/index.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const pack = getIndustryPack('ecommerce-v1')
const matches = [
  { pattern: 'orders', entity: 'FactOrder', table: 'orders' },
  { pattern: 'brands', entity: 'DimBrand', table: 'brands' },
  { pattern: 'order_items', entity: 'FactOrderLine', table: 'order_items' },
  { pattern: 'products', entity: 'DimProduct', table: 'products' },
]

const revenueSql = buildKpiSqlFromPack(pack.kpis[0], matches)
assert(revenueSql.includes('FROM orders o'), 'revenue SQL uses orders table')
assert(revenueSql.includes('JOIN brands b'), 'revenue SQL joins brands')
assert(!revenueSql.includes('{orders}'), 'no unreplaced {orders} placeholder')

const countSql = buildKpiSqlFromPack(pack.kpis[1], matches)
assert(countSql.includes('FROM orders'), 'order count uses orders')

const placeholder = applyTablePlaceholders(
  'SELECT * FROM {orders} JOIN {brands} ON 1=1',
  matches,
)
assert(
  placeholder === 'SELECT * FROM orders JOIN brands ON 1=1',
  'applyTablePlaceholders replaces both',
)

const mappings = buildEntityMappings(pack, { matches })
assert(mappings.length === matches.length, 'entity mappings count')
assert(
  mappings.find((m) => m.entity === 'FactOrder')?.tableName === 'orders',
  'FactOrder maps to orders',
)

assert(pack.kpis.length >= 5, 'ecommerce pack has 5 KPIs defined')

console.log(failed ? `\n${failed} failed` : '\nAll metric pack seed tests passed')
process.exit(failed ? 1 : 0)
