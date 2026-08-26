/**
 * Phase 4 — multi-vertical packs + policy gates.
 * Run: node eval/runPhase4Tests.js
 */
import { listFullIndustryPacks, getIndustryPack } from '../src/packs/index.js'
import {
  validatePackPoliciesForMonk,
  getPackCertMinRecall,
  shouldSkipMartMaterialize,
} from '../src/packPolicies.js'
import { scorePackAgainstSchema } from '../src/templateMatcher.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

assert(listFullIndustryPacks().length >= 4, 'four vertical packs registered')

const finance = getIndustryPack('finance-v1')
const healthcare = getIndustryPack('healthcare-v1')
const audit = getIndustryPack('audit-v1')

assert(finance?.policies?.noAutoMaterialize === true, 'finance blocks auto materialize')
assert(healthcare?.policies?.hipaaStrict === true, 'healthcare HIPAA strict')
assert(audit?.policies?.immutableMonkLog === true, 'audit immutable log policy')

const financeCheck = validatePackPoliciesForMonk(finance, {
  canRunMonk: false,
  missing: ['ledger'],
})
assert(financeCheck.warnings.length >= 1, 'finance emits policy warnings')
assert(financeCheck.blocks.length >= 1, 'finance blocks when required missing')

assert(getPackCertMinRecall(healthcare) >= 0.5, 'healthcare higher cert bar')
assert(shouldSkipMartMaterialize(finance), 'finance skip marts')

const sportedgeFinance = scorePackAgainstSchema(
  [
    { name: 'finance.payments' },
    { name: 'finance.invoices' },
    { name: 'orders' },
  ],
  finance,
)
assert(sportedgeFinance.matches.length >= 1, 'finance partial sportedge match')

console.log(failed ? `\n${failed} failed` : '\nAll Phase 4 tests passed')
process.exit(failed ? 1 : 0)
