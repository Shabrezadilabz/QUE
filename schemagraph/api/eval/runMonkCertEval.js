/**
 * Monk certification gate — golden pairs loader + threshold logic.
 * Run: node eval/runMonkCertEval.js
 */
import {
  loadSportedgeGoldenPairs,
} from '../src/packCertification.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const pairs = loadSportedgeGoldenPairs()
assert(Array.isArray(pairs), 'pairs is array')
assert(pairs.length >= 10, `SportEdge pairs loaded (${pairs.length})`)

const brandPair = pairs.find(
  (p) =>
    p.fromTable === 'orders' &&
    p.toTable === 'brands' &&
    p.fromColumn === 'brand_id',
)
assert(Boolean(brandPair), 'includes orders.brand_id → brands.brand_id pair')

function passesGate(recall, minRecall = 0.35) {
  return recall >= minRecall
}
assert(passesGate(0.4, 0.35), 'recall 40% passes 35% gate')
assert(!passesGate(0.2, 0.35), 'recall 20% fails 35% gate')
assert(passesGate(1, 0.35), 'perfect recall passes')

console.log(failed ? `\n${failed} failed` : '\nAll monk cert eval tests passed')
process.exit(failed ? 1 : 0)
