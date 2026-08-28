/**
 * Phase 5 — Que Load ops hub (unit tests, no DB).
 */
import {
  summarizeLoadOps,
  buildRecentLoadRuns,
} from '../src/load/queLoadHub.js'
import { computeLoadSlaStatus } from '../src/duplicateProfile.js'

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

const healthyPipelines = [
  {
    id: '1',
    name: 'Shopify',
    lastSyncAt: new Date().toISOString(),
    sla: computeLoadSlaStatus({
      lastSyncAt: new Date().toISOString(),
      status: 'active',
    }),
  },
]

const healthy = summarizeLoadOps({ pipelines: healthyPipelines })
assert(healthy.status === 'healthy', 'load ops healthy')
assert(healthy.slaCounts.healthy === 1, 'healthy sla count')

const critical = summarizeLoadOps({
  pipelines: [
    {
      id: '2',
      name: 'Broken',
      sla: computeLoadSlaStatus({ lastSyncErrorKind: 'auth', status: 'error' }),
    },
  ],
})
assert(critical.status === 'critical', 'load ops critical on sync error')

const degraded = summarizeLoadOps({
  pipelines: [
    {
      id: '3',
      name: 'Late',
      sla: computeLoadSlaStatus({
        syncNextAt: new Date(Date.now() - 3600000).toISOString(),
        status: 'active',
      }),
    },
  ],
  workerFailed7d: 2,
})
assert(degraded.status === 'degraded', 'load ops degraded when overdue')

const runs = buildRecentLoadRuns({
  pipelines: [
    {
      id: 'c1',
      name: 'Orders DB',
      lastSyncAt: '2026-08-28T12:00:00.000Z',
      lastSyncDurationMs: 1200,
      status: 'active',
    },
  ],
  queueItems: [
    {
      id: 'q1',
      kind: 'job_run',
      status: 'succeeded',
      jobId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      createdAt: '2026-08-28T11:00:00.000Z',
      finishedAt: '2026-08-28T11:01:00.000Z',
      trigger: 'schedule',
    },
  ],
})
assert(runs.length === 2, 'recent runs merge sync + worker')
assert(runs[0].kind === 'sync', 'newest sync first')
assert(runs.some((r) => r.kind === 'worker'), 'includes worker run')

if (failed > 0) {
  console.error(`\nPhase 5 Load hub tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 5 Load hub tests passed')
