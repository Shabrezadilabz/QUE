/**
 * Platform module readiness signals (no pageAutofill dependency).
 */
import { getWorkspaceSyncScheduleStatus } from '../scheduledSync.js'
import { listQueModels } from '../queModel.js'
import { buildCatalogIndex } from '../catalog/queCatalogIndex.js'
import { listPipeProposals } from '../quePipes.js'
import { getWorkerPoolStatus } from '../warehouseWorker.js'
import { getWarehouseStatus } from '../queWarehouse.js'
import { getOpenHighDrift } from '../contracts/contractFreeze.js'
import { getGoldenEvalSchedule } from '../scheduledGoldenEval.js'
import { query } from '../db.js'

function moduleStatusFrom(score, hasData, alert = false) {
  if (alert) return 'review'
  if (!hasData) return 'empty'
  if (score >= 80) return 'ready'
  if (score >= 40) return 'review'
  return 'unavailable'
}

function pipeProposalsCount(signals) {
  return signals.pipeProposals?.length ?? 0
}

/**
 * @param {string} workspaceId
 */
export async function fetchPlatformModuleSignals(workspaceId) {
  const [
    syncSched,
    models,
    catalogResult,
    pipeProposals,
    worker,
    driftOpen,
    goldenSched,
    chartCount,
    gridTables,
    warehouse,
  ] = await Promise.all([
    getWorkspaceSyncScheduleStatus(workspaceId).catch(() => null),
    listQueModels(workspaceId).catch(() => []),
    buildCatalogIndex(workspaceId, { limit: 1 }).catch(() => ({
      stats: { total: 0 },
      total: 0,
    })),
    listPipeProposals(workspaceId).catch(() => []),
    getWorkerPoolStatus(workspaceId).catch(() => null),
    getOpenHighDrift(workspaceId).catch(() => []),
    getGoldenEvalSchedule(workspaceId).catch(() => null),
    query(
      `SELECT COUNT(*)::int AS n FROM bi_charts WHERE workspace_id = $1`,
      [workspaceId],
    )
      .then(({ rows }) => rows[0]?.n ?? 0)
      .catch(() => 0),
    query(
      `SELECT COUNT(*)::int AS n FROM schema_objects
       WHERE workspace_id = $1 AND entity_kind = 'table'`,
      [workspaceId],
    )
      .then(({ rows }) => rows[0]?.n ?? 0)
      .catch(() => 0),
    getWarehouseStatus(workspaceId).catch(() => null),
  ])

  const loadErrors = (syncSched?.connections || []).filter(
    (c) => c.lastSyncErrorKind || c.status === 'error',
  )

  return {
    syncSched,
    models,
    catalogTotal: catalogResult?.stats?.total ?? catalogResult?.total ?? 0,
    pipeProposals,
    pendingPipes: pipeProposals.filter((p) => p.status === 'pending'),
    worker,
    driftOpen,
    goldenSched,
    loadErrors,
    chartCount,
    gridTables,
    warehouse,
  }
}

/**
 * @param {object} signals
 * @param {object} [health]
 */
export function buildPlatformModulePages(signals, health = {}, loadOps = null) {
  const connCount = signals.syncSched?.connections?.length ?? 0
  const loadErrors = signals.loadErrors?.length ?? 0
  const modelCount = signals.models?.length ?? 0
  const readyModels = (signals.models || []).filter(
    (m) => m.status === 'ready',
  ).length
  const catalogTotal = signals.catalogTotal ?? 0
  const pendingPipes = signals.pendingPipes?.length ?? 0
  const openDrift = signals.driftOpen?.length ?? 0
  const workerFailed = signals.worker?.failed7d ?? 0
  const workerQueued = signals.worker?.queued ?? 0
  const goldenRecall = signals.goldenSched?.lastRecall
  const chartCount = signals.chartCount ?? 0
  const observeAlert = openDrift > 0 || workerFailed > 0 || loadErrors > 0
  const wh = signals.warehouse
  const whStatus = wh?.readiness?.status
  const whTables = wh?.tableCount ?? 0

  return {
    load: {
      status:
        loadOps?.status === 'critical' || loadErrors > 0
          ? 'review'
          : loadOps?.status === 'healthy' && whStatus === 'ready'
            ? 'ready'
            : whStatus === 'ready'
              ? 'ready'
              : connCount > 0 || whStatus === 'review' || loadOps?.status === 'degraded'
                ? 'review'
                : 'empty',
      headline: whStatus === 'ready'
        ? `${whTables} raw table(s) in Que Warehouse`
        : connCount
          ? `${connCount} pipeline(s)`
          : 'Connect your first source',
      hints: [
        loadOps?.label || null,
        wh?.replicateDefaultOn !== false ? 'Full replicate · default ON' : 'Replicate default off',
        whTables ? `${whTables} raw WH table(s)` : null,
        wh?.readiness?.label || null,
        loadErrors ? `${loadErrors} sync error(s)` : null,
        workerQueued ? `${workerQueued} queued on worker` : null,
      ].filter(Boolean),
      href: '/load',
      cta: loadErrors ? 'Fix sync errors' : connCount ? 'Open Load' : 'Add connector',
    },
    model: {
      status: moduleStatusFrom(
        modelCount ? (readyModels / Math.max(modelCount, 1)) * 100 : 0,
        modelCount > 0,
      ),
      headline: modelCount ? `${modelCount} SQL model(s)` : 'No models yet',
      hints: [
        readyModels ? `${readyModels} ready for deploy` : null,
        'Staging · mart · dbt export',
      ].filter(Boolean),
      href: '/model',
      cta: modelCount ? 'Open Model IDE' : 'Create first model',
    },
    studio: {
      status: moduleStatusFrom(
        health.signals?.dashboardScore ?? (chartCount > 0 ? 80 : 0),
        chartCount > 0 || (signals.gridTables ?? 0) > 0,
      ),
      headline: chartCount
        ? `${chartCount} BI widget(s)`
        : 'Studio boards not seeded',
      hints: [
        'Grid explore + CEO dashboards',
        signals.gridTables ? `${signals.gridTables} tables in graph` : null,
      ].filter(Boolean),
      href: '/studio/grid',
      cta: chartCount ? 'Open Studio' : 'Explore grid',
    },
    catalog: {
      status: moduleStatusFrom(
        catalogTotal >= 20 ? 100 : catalogTotal >= 5 ? 70 : catalogTotal > 0 ? 50 : 0,
        catalogTotal > 0,
      ),
      headline: catalogTotal
        ? `${catalogTotal} indexed asset(s)`
        : 'Catalog empty',
      hints: ['Tables · metrics · jobs · terms'],
      href: '/catalog',
      cta: catalogTotal ? 'Browse catalog' : 'Sync sources first',
    },
    pipes: {
      status: pendingPipes > 0 ? 'review' : pipeProposalsCount(signals) > 0 ? 'ready' : 'empty',
      headline: pendingPipes
        ? `${pendingPipes} pipe(s) awaiting review`
        : pipeProposalsCount(signals) > 0
          ? `${pipeProposalsCount(signals)} pipeline proposal(s)`
          : 'Draft NL pipelines',
      hints: ['HITL approve before job create'],
      href: '/pipes',
      cta: pendingPipes ? 'Review proposals' : 'Draft a pipe',
    },
    observe: {
      status: observeAlert ? 'review' : openDrift === 0 && workerFailed === 0 ? 'ready' : 'empty',
      headline: openDrift
        ? `${openDrift} high drift alert(s)`
        : workerFailed
          ? `${workerFailed} worker failure(s) · 7d`
          : `${health.score ?? '—'}% platform health`,
      hints: [
        goldenRecall != null
          ? `Golden recall ${(Number(goldenRecall) * 100).toFixed(0)}%`
          : 'Golden eval not scheduled',
        loadErrors ? `${loadErrors} load sync error(s)` : null,
      ].filter(Boolean),
      href: '/observe',
      cta: observeAlert ? 'View incidents' : 'Open Observe',
    },
  }
}
