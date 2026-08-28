/**
 * Phase 5.3 — Warehouse worker queue helpers (unit tests, no DB).
 */
import {
  warehouseWorkerEnabled,
  resolveWorkerId,
  QUEUE_KINDS,
} from '../src/warehouseWorker.js'

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

const prev = process.env.QUE_WAREHOUSE_WORKER_ENABLED
process.env.QUE_WAREHOUSE_WORKER_ENABLED = 'true'
assert(warehouseWorkerEnabled(), 'worker enabled by default')
process.env.QUE_WAREHOUSE_WORKER_ENABLED = 'off'
assert(!warehouseWorkerEnabled(), 'worker disabled when off')
process.env.QUE_WAREHOUSE_WORKER_ENABLED = prev

process.env.QUE_WORKER_ID = 'test-worker-1'
assert(resolveWorkerId() === 'test-worker-1', 'resolveWorkerId uses env')

assert(QUEUE_KINDS.has('job_run'), 'job_run kind')
assert(QUEUE_KINDS.has('sync'), 'sync kind')
assert(QUEUE_KINDS.has('studio_refresh'), 'studio_refresh kind')
assert(!QUEUE_KINDS.has('unknown'), 'unknown kind rejected')

if (failed > 0) {
  console.error(`\nPhase 5 Worker tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 5 Worker tests passed')
