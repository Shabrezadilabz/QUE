/**
 * Health scorecard unit tests.
 * Run: node eval/runHealthScorecardTests.js
 */
import { computeHealthScoreFromSignals } from '../src/healthScorecard.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const perfect = computeHealthScoreFromSignals({
  connectionScore: 100,
  schemaScore: 100,
  packMatchScore: 100,
  joinScore: 100,
  stewardScore: 100,
  kpiScore: 100,
  dashboardScore: 100,
  certScore: 100,
})
assert(perfect.score === 100, 'perfect signals → 100')
assert(perfect.grade === 'excellent', '100 → excellent')

const empty = computeHealthScoreFromSignals({})
assert(empty.score < 50, 'empty signals → low score')

const mixed = computeHealthScoreFromSignals({
  connectionScore: 80,
  schemaScore: 70,
  packMatchScore: 90,
  joinScore: 50,
  stewardScore: 60,
  kpiScore: 100,
  dashboardScore: 40,
  certScore: 30,
})
assert(mixed.score >= 50 && mixed.score <= 85, `mixed score reasonable (${mixed.score})`)
assert(mixed.breakdown.length === 8, '8 breakdown dimensions')

console.log(failed ? `\n${failed} failed` : '\nAll health scorecard tests passed')
process.exit(failed ? 1 : 0)
