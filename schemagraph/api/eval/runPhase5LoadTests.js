/**
 * Phase 5 — Que Load + duplicates profile (unit tests, no DB).
 */
import {
  computeTableDuplicateMetrics,
  computeLoadSlaStatus,
  estimateOrphanFkHints,
} from '../src/duplicateProfile.js'

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

const table = {
  name: 'orders',
  columns: [
    { name: 'id', keyKind: 'pk', samples: ['1', '2', '2', '3', '3'] },
    { name: 'customer_id', keyKind: 'fk', samples: ['10', '11', null, '12', ''] },
    { name: 'amount', keyKind: 'none', samples: ['100', '200', '300', '400', '500'] },
  ],
}

const metrics = computeTableDuplicateMetrics(table, [])
assert(metrics.dupKeyPct != null && metrics.dupKeyPct > 0, 'dup key pct from pk samples')
assert(metrics.dupRowPct != null, 'dup row pct estimated')
assert(metrics.severity === 'high' || metrics.severity === 'medium', 'severity flagged')
assert(metrics.suggestedAction === 'monk_dedupe', 'suggests monk dedupe')

const hints = estimateOrphanFkHints(table, [
  { from: 'orders.customer_id', to: 'customers.id', type: 'explicit', status: 'accepted', confidence: 1 },
])
assert(hints.length === 1, 'orphan fk hints')

const healthy = computeLoadSlaStatus({
  lastSyncAt: new Date().toISOString(),
  syncNextAt: new Date(Date.now() + 3600000).toISOString(),
  status: 'active',
})
assert(healthy.badge === 'healthy', 'sla healthy')

const failedConn = computeLoadSlaStatus({
  lastSyncErrorKind: 'auth',
  status: 'error',
})
assert(failedConn.badge === 'error', 'sla error')

if (failed > 0) {
  console.error(`\nPhase 5 Load tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 5 Load tests passed')
