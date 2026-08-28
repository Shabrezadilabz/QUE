/**
 * Phase 3 — Execution hub unit tests (no DB).
 */
import {
  summarizeExecutionReadiness,
  RUN_SURFACES,
} from '../src/execution/queExecutionHub.js'

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

const ready = summarizeExecutionReadiness({
  warehouseProvisioned: true,
  warehouseTableCount: 5,
  recentSuccessfulRuns: 2,
  failedQueueCount: 0,
  materializedTableCount: 1,
  recentEventCount: 12,
})
assert(ready.status === 'ready', 'warehouse + runs → ready')

const empty = summarizeExecutionReadiness({
  warehouseProvisioned: false,
  warehouseTableCount: 0,
})
assert(empty.status === 'empty', 'no warehouse → empty')

const review = summarizeExecutionReadiness({
  warehouseProvisioned: true,
  warehouseTableCount: 3,
  failedQueueCount: 2,
})
assert(review.status === 'review', 'failed queue → review')

assert(RUN_SURFACES.filter((s) => s.wired).length >= 6, 'six run surfaces wired')

if (failed > 0) {
  console.error(`\nPhase Execution hub tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Execution hub tests passed')
