/**
 * Standalone Que Warehouse Worker — processes warehouse_job_queue.
 *
 *   node scripts/runWarehouseWorker.js
 *   QUE_WAREHOUSE_WORKER_ENABLED=true QUE_WORKER_ID=worker-1 node scripts/runWarehouseWorker.js
 */
import { runWorkerTick, startWarehouseWorkerLoop, warehouseWorkerEnabled } from '../src/warehouseWorker.js'

if (!warehouseWorkerEnabled()) {
  console.error('[Que] QUE_WAREHOUSE_WORKER_ENABLED is off — exiting')
  process.exit(1)
}

const boot = startWarehouseWorkerLoop()
console.log('[Que] warehouse worker process started', boot)

process.on('SIGINT', () => {
  console.log('[Que] warehouse worker shutting down')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[Que] warehouse worker SIGTERM')
  process.exit(0)
})

// Immediate first tick
void runWorkerTick({ limit: 3 }).then((out) => {
  if (out.processed) {
    console.log(`[Que] worker boot tick processed ${out.processed} item(s)`)
  }
})
