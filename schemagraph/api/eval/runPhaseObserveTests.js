/**
 * Que Observe hub — unit tests (no DB).
 */
import {
  summarizeObserveStatus,
  synthesizeObserveIncidents,
} from '../src/observe/queObserveHub.js'

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

const healthy = summarizeObserveStatus({
  openHighDrift: 0,
  loadErrors: 0,
  workerFailed7d: 0,
  dupHighRisk: 0,
  goldenBelowThreshold: false,
  healthScore: 92,
  incidentCount: 0,
})
assert(healthy.status === 'healthy', 'all clear → healthy')
assert(healthy.label === 'All clear', 'healthy label')

const critical = summarizeObserveStatus({
  openHighDrift: 2,
  loadErrors: 0,
  workerFailed7d: 0,
})
assert(critical.status === 'critical', 'open high drift → critical')

const degraded = summarizeObserveStatus({
  openHighDrift: 0,
  workerFailed7d: 1,
  goldenBelowThreshold: true,
})
assert(degraded.status === 'degraded', 'worker fail + golden → degraded')

const loadCritical = summarizeObserveStatus({
  openHighDrift: 0,
  loadErrors: 0,
  workerFailed7d: 0,
  loadOpsStatus: 'critical',
})
assert(loadCritical.status === 'critical', 'load ops critical → critical')

const incidents = synthesizeObserveIncidents({
  driftOpenHigh: [
    {
      id: 'd1',
      summary: 'Column removed',
      code: 'column_removed',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
  goldenBelowThreshold: true,
  goldenRecall: 0.2,
  goldenMinRecall: 0.35,
  workerFailed7d: 3,
  loadErrors: [{ id: 'c1', name: 'Shopify', lastSyncErrorKind: 'timeout' }],
  duplicateHighTables: [
    {
      tableName: 'orders',
      severity: 'high',
      dupKeyPct: 12,
    },
  ],
  recentFailedRuns: [
    {
      id: 'r1',
      jobId: 'j1',
      jobName: 'Daily mart',
      error: 'timeout',
      createdAt: '2026-01-02T00:00:00Z',
    },
  ],
})
assert(incidents.length >= 5, 'synthesizes multiple incident kinds')
assert(incidents[0].severity === 'critical', 'top incident is critical')
assert(
  incidents.some((i) => i.kind === 'drift'),
  'includes drift incident',
)
assert(
  incidents.some((i) => i.kind === 'quality' && i.title.includes('orders')),
  'includes duplicate incident',
)

if (failed > 0) {
  console.error(`\nPhase Observe tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Observe tests passed')
