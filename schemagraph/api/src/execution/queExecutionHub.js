/**
 * Phase 3 — Execution UX hub: warehouse run readiness + materialize loop signals.
 */
import { getWarehouseRegistry } from '../queWarehouse.js'
import { getWorkerPoolStatus, listQueueItems } from '../warehouseWorker.js'
import { listRecentWorkspaceEvents } from '../ssm/workspaceEvents.js'
import { query } from '../db.js'

export const RUN_SURFACES = [
  { id: 'chat', label: 'Chat SQL', route: '/chat', wired: true },
  { id: 'jobs', label: 'Job notebook', route: '/jobs', wired: true },
  { id: 'model', label: 'Que Model', route: '/model', wired: true },
  { id: 'pipes', label: 'Que Pipes', route: '/pipes', wired: true },
  { id: 'studio', label: 'Grid Explore', route: '/studio/grid', wired: true },
  { id: 'transforms', label: 'Transforms', route: '/transforms', wired: true },
]

/**
 * Pure readiness rollup for execution dashboard.
 * @param {object} input
 */
export function summarizeExecutionReadiness(input = {}) {
  const warehouseProvisioned = Boolean(input.warehouseProvisioned)
  const warehouseTableCount = input.warehouseTableCount ?? 0
  const recentRuns = input.recentSuccessfulRuns ?? 0
  const failedQueue = input.failedQueueCount ?? 0
  const materializedTables = input.materializedTableCount ?? 0
  const eventCount = input.recentEventCount ?? 0

  let status = 'empty'
  if (!warehouseProvisioned) {
    status = warehouseTableCount > 0 ? 'review' : 'empty'
  } else if (warehouseTableCount === 0) {
    status = 'empty'
  } else if (failedQueue > 0) {
    status = 'review'
  } else if (recentRuns > 0 || materializedTables > 0) {
    status = 'ready'
  } else {
    status = 'review'
  }

  return {
    status,
    warehouseProvisioned,
    warehouseTableCount,
    recentSuccessfulRuns: recentRuns,
    failedQueueCount: failedQueue,
    materializedTableCount: materializedTables,
    recentEventCount: eventCount,
    runSurfaces: RUN_SURFACES.length,
    label:
      !warehouseProvisioned && warehouseTableCount === 0
        ? 'Sync sources to enable warehouse runs'
        : failedQueue > 0
          ? 'Worker queue needs attention'
          : recentRuns > 0
            ? 'Execution loop active'
            : 'Run SQL in Que Warehouse',
  }
}

/**
 * @param {string} workspaceId
 */
export async function buildExecutionSummary(workspaceId) {
  const [registry, worker, queueRecent, events, tableCountRow, matCountRow] =
    await Promise.all([
      getWarehouseRegistry(workspaceId).catch(() => null),
      getWorkerPoolStatus(workspaceId).catch(() => null),
      listQueueItems(workspaceId, { limit: 20 }).catch(() => []),
      listRecentWorkspaceEvents(workspaceId, 30).catch(() => []),
      query(
        `SELECT COUNT(*)::int AS n FROM que_warehouse_tables WHERE workspace_id = $1`,
        [workspaceId],
      ).catch(() => ({ rows: [{ n: 0 }] })),
      query(
        `SELECT COUNT(*)::int AS n FROM schema_objects
         WHERE workspace_id = $1 AND entity_kind = 'materialized_table'`,
        [workspaceId],
      ).catch(() => ({ rows: [{ n: 0 }] })),
    ])

  const failedQueue = (queueRecent || []).filter(
    (q) => q.status === 'failed',
  ).length
  const recentSuccessfulRuns = (queueRecent || []).filter(
    (q) => q.status === 'succeeded',
  ).length

  const readiness = summarizeExecutionReadiness({
    warehouseProvisioned: Boolean(registry?.status === 'active'),
    warehouseTableCount: tableCountRow.rows[0]?.n ?? 0,
    recentSuccessfulRuns,
    failedQueueCount: failedQueue,
    materializedTableCount: matCountRow.rows[0]?.n ?? 0,
    recentEventCount: events.length,
  })

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    registry,
    worker,
    readiness,
    runSurfaces: RUN_SURFACES,
    recentQueue: (queueRecent || []).slice(0, 8).map((q) => ({
      id: q.id,
      kind: q.kind,
      status: q.status,
      jobId: q.jobId,
      createdAt: q.createdAt,
      error: q.error,
    })),
    recentEvents: events.slice(0, 10).map((e) => ({
      eventType: e.eventType,
      createdAt: e.createdAt,
      meta: {
        tableName: e.meta?.tableName,
        jobId: e.meta?.jobId,
        connectionName: e.meta?.connectionName,
      },
    })),
    policy: {
      readonlyExecute: true,
      rowPayloadsNeverInLlm: true,
      materializeRequiresHitl: true,
    },
  }
}
