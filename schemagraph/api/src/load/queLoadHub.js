/**
 * Phase 5.1 + 5.3 — Que Load ops hub (pipelines, SLA, worker queue, run history).
 */
import { computeLoadSlaStatus } from '../duplicateProfile.js'
import { getWorkspaceSyncScheduleStatus } from '../scheduledSync.js'
import { getWarehouseStatus } from '../queWarehouse.js'
import { getWorkerPoolStatus, listQueueItems } from '../warehouseWorker.js'

/**
 * Roll up pipeline SLA signals (pure — unit testable).
 * @param {object} input
 */
export function summarizeLoadOps(input = {}) {
  const pipelines = input.pipelines || []
  const slaCounts = {
    healthy: 0,
    error: 0,
    overdue: 0,
    pending: 0,
    unknown: 0,
  }

  for (const p of pipelines) {
    const badge = p.sla?.badge || 'unknown'
    if (badge in slaCounts) slaCounts[badge] += 1
    else slaCounts.unknown += 1
  }

  let status = 'empty'
  if (slaCounts.error > 0) {
    status = 'critical'
  } else if (slaCounts.overdue > 0) {
    status = 'degraded'
  } else if (pipelines.length > 0 && slaCounts.healthy > 0) {
    status = 'healthy'
  } else if (pipelines.length > 0) {
    status = 'review'
  }

  const workerFailed = Number(input.workerFailed7d) || 0
  if (workerFailed >= 3 && status === 'healthy') status = 'degraded'
  if (workerFailed >= 5) status = 'critical'

  return {
    status,
    pipelineCount: pipelines.length,
    slaCounts,
    workerFailed7d: workerFailed,
    label:
      status === 'healthy'
        ? 'Load pipelines on track'
        : status === 'degraded'
          ? 'Overdue syncs or worker failures — review Load'
          : status === 'critical'
            ? 'Sync or worker failures need action'
            : pipelines.length
              ? 'Connectors added — run first sync'
              : 'Add a connector to begin',
  }
}

/**
 * Merge queue items + connector sync timestamps into a run feed (pure).
 * @param {object} input
 */
export function buildRecentLoadRuns(input = {}) {
  const runs = []

  for (const q of input.queueItems || []) {
    runs.push({
      id: q.id,
      kind: 'worker',
      name: q.kind === 'job_run' ? `Worker · job ${q.jobId?.slice(0, 8) || 'run'}` : `Worker · ${q.kind}`,
      ok: q.status === 'succeeded',
      at: q.finishedAt || q.startedAt || q.createdAt,
      detail:
        q.status === 'failed'
          ? q.error || 'Worker run failed'
          : q.status === 'succeeded'
            ? 'Warehouse job succeeded'
            : q.status,
      status: q.status,
    })
  }

  for (const c of input.pipelines || []) {
    if (!c.lastSyncAt && !c.lastScheduledSyncAt) continue
    const at = c.lastSyncAt || c.lastScheduledSyncAt
    runs.push({
      id: `sync-${c.id}`,
      kind: 'sync',
      name: c.name,
      ok: !c.lastSyncErrorKind && c.status !== 'error',
      at,
      detail: c.lastSyncErrorKind
        ? `Sync failed · ${c.lastSyncErrorKind}`
        : c.lastSyncDurationMs
          ? `Sync OK · ${c.lastSyncDurationMs}ms`
          : 'Sync completed',
      status: c.lastSyncErrorKind ? 'failed' : 'succeeded',
    })
  }

  runs.sort((a, b) => Date.parse(String(b.at || 0)) - Date.parse(String(a.at || 0)))
  return runs.slice(0, input.limit ?? 40)
}

/**
 * @param {string} workspaceId
 */
export async function buildLoadSummary(workspaceId) {
  const [syncSched, warehouse, worker, queueItems] = await Promise.all([
    getWorkspaceSyncScheduleStatus(workspaceId).catch(() => null),
    getWarehouseStatus(workspaceId).catch(() => null),
    getWorkerPoolStatus(workspaceId).catch(() => null),
    listQueueItems(workspaceId, { limit: 20 }).catch(() => []),
  ])

  const pipelines = (syncSched?.connections || []).map((c) => ({
    ...c,
    sla: computeLoadSlaStatus(c),
  }))

  const readiness = summarizeLoadOps({
    pipelines,
    workerFailed7d: worker?.failed7d ?? 0,
  })

  const recentRuns = buildRecentLoadRuns({
    pipelines,
    queueItems,
    limit: 40,
  })

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    readiness,
    schedule: syncSched?.summary ?? {
      total: pipelines.length,
      scheduled: 0,
      due: 0,
    },
    scheduledSyncEnabled: syncSched?.enabled ?? false,
    warehouse: warehouse
      ? {
          provisioned: warehouse.provisioned,
          tableCount: warehouse.tableCount,
          totalRows: warehouse.totalRows,
          replicateDefaultOn: warehouse.replicateDefaultOn,
          readiness: warehouse.readiness,
          schemaName: warehouse.registry?.schemaName ?? null,
        }
      : null,
    worker: worker || {
      enabled: false,
      queued: 0,
      running: 0,
      succeeded7d: 0,
      failed7d: 0,
      warehouseProvisioned: false,
      schemaName: null,
    },
    pipelines,
    queueRecent: queueItems,
    recentRuns,
  }
}
