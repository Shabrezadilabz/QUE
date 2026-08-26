/**
 * Template matcher unit tests — SportEdge table scoring.
 * Run: node eval/runTemplateMatcherTests.js
 */
import { scorePackAgainstSchema, rankPacksForWorkspace } from '../src/templateMatcher.js'
import { getIndustryPack } from '../src/packs/index.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const pack = getIndustryPack('ecommerce-v1')

const sportedgeTables = [
  { name: 'orders', connection: 'postgres' },
  { name: 'brands', connection: 'postgres' },
  { name: 'customers', connection: 'postgres' },
  { name: 'products', connection: 'postgres' },
  { name: 'order_items', connection: 'postgres' },
  { name: 'finance.payments', connection: 'postgres' },
]

const result = scorePackAgainstSchema(sportedgeTables, pack)
assert(result.scorePct >= 55, `SportEdge match >= 55% (got ${result.scorePct}%)`)
assert(result.requiredOk === true, 'orders + brands requiredOk')
assert(result.canRunMonk === true, 'canRunMonk when required tables present')
assert(
  result.matches.some((m) => m.pattern === 'orders'),
  'maps orders entity',
)
assert(
  result.matches.some((m) => m.pattern === 'brands'),
  'maps brands entity',
)

const sparse = scorePackAgainstSchema([{ name: 'random_table' }], pack)
assert(sparse.requiredOk === false, 'missing required tables fails requiredOk')
assert(sparse.canRunMonk === false, 'sparse schema cannot run Monk')

const ranked = rankPacksForWorkspace(sportedgeTables)
assert(ranked.length >= 1, 'rankPacks returns ecommerce pack')
assert(ranked[0].pack.id === 'ecommerce-v1', 'ecommerce pack ranked first')

console.log(failed ? `\n${failed} failed` : '\nAll template matcher tests passed')
process.exit(failed ? 1 : 0)
