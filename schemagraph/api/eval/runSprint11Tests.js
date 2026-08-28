/**
 * Sprint 11 — Enterprise ops, billing metering, load test, collab helpers.
 */
import {
  getPrivateRunnerInstallGuide,
  JOB_ISOLATION_POLICY,
} from '../src/privateRunner.js'
import {
  buildMeteringInvoice,
  S1_PRICING,
} from '../src/billingMetering.js'
import { runLoadTestSuite, LOAD_TEST_DEFAULTS } from '../src/loadTestSuite.js'
import {
  getOnCallRunbook,
  ON_CALL_RUNBOOK_ID,
} from '../src/statusPage.js'
import {
  claimJoinReviewLock,
  releaseJoinReviewLock,
  getJoinReviewCollab,
} from '../src/joinReviewCollab.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const guide = getPrivateRunnerInstallGuide()
assert(guide.steps.length >= 5, 'install guide steps')
assert(guide.policy.scope === JOB_ISOLATION_POLICY.scope, 'isolation policy')
assert(guide.markdown.includes('runner'), 'install markdown')

assert(S1_PRICING.growth.inrMin === 50000, 'S1 growth min INR')
assert(S1_PRICING.addons.industryPack.inr === 20000, 'pack addon INR')

const invoice = buildMeteringInvoice({
  planTier: 'growth',
  usage: { inventory: { members: 8, connections: 15 }, usagePct: 72, nearLimit: [] },
  billing: { seatCount: 5, members: 8, configured: true, billingStatus: 'active' },
  packCount: 2,
})
assert(invoice.lineItems.length >= 2, 'metering line items')
assert(invoice.totalInr > invoice.subtotalInr, 'GST applied')
assert(invoice.lineItems.some((l) => l.code === 'seat_addon'), 'seat addon')

const runbook = getOnCallRunbook()
assert(runbook.id === ON_CALL_RUNBOOK_ID, 'runbook id')
assert(runbook.escalation.length >= 3, 'escalation tiers')
assert(runbook.playbooks.length >= 4, 'playbooks')

const lock = claimJoinReviewLock('ws-1', 'rel-1', {
  userId: 'u1',
  displayName: 'Alice',
})
assert(lock.userId === 'u1', 'lock claimed')
let blocked = false
try {
  claimJoinReviewLock('ws-1', 'rel-1', { userId: 'u2', displayName: 'Bob' })
} catch (e) {
  blocked = e.code === 'JOIN_LOCK_HELD'
}
assert(blocked, 'lock blocks second user')
releaseJoinReviewLock('ws-1', 'rel-1', 'u1')

const collab = await getJoinReviewCollab('ws-1', 'rel-1', { userId: 'u1' })
assert(Array.isArray(collab.viewers), 'collab viewers array')
assert(collab.coEditEnabled === true, 'co-edit enabled')

const load = await runLoadTestSuite({ concurrency: 50 })
assert(load.concurrency === 50, 'load concurrency 50')
assert(load.p95Ms >= 0, 'load p95')
assert(LOAD_TEST_DEFAULTS.concurrency === 50, 'load defaults')

console.log(failed ? `\n${failed} failed` : '\nAll Sprint 11 tests passed')
process.exit(failed ? 1 : 0)
