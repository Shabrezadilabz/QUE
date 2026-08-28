/**
 * Que Observe — unified ops dashboard (Monte Carlo–class monitors + incidents).
 * Aggregates drift, golden eval, health scorecard, warehouse worker, duplicates, load SLA.
 */
import { query } from '../db.js'
import { computeHealthScorecard } from '../healthScorecard.js'
import {
  getOpenHighDrift,
  listRecentDrift,
} from '../contracts/contractFreeze.js'
import { getGoldenEvalSchedule } from '../scheduledGoldenEval.js'
import { getLatestPackCertification } from '../packCertification.js'
import {
  getWorkerPoolStatus,
  listQueueItems,
} from '../warehouseWorker.js'
import {
  computeDuplicateProfile,
  computeLoadSlaStatus,
} from '../duplicateProfile.js'
import { getWorkspaceSyncScheduleStatus } from '../scheduledSync.js'
import { summarizeLoadOps } from '../load/queLoadHub.js'

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * Derive overall observe posture from rollup signals (pure — unit testable).
 * @param {object} signals
 */
export function summarizeObserveStatus(signals = {}) {
  const openHighDrift = Number(signals.openHighDrift) || 0
  const loadErrors = Number(signals.loadErrors) || 0
  const workerFailed7d = Number(signals.workerFailed7d) || 0
  const dupHighRisk = Number(signals.dupHighRisk) || 0
  const goldenBelowThreshold = Boolean(signals.goldenBelowThreshold)
  const healthScore =
    signals.healthScore != null ? Number(signals.healthScore) : null
  const loadOpsStatus = signals.loadOpsStatus || null

  let status = 'healthy'
  if (
    openHighDrift > 0 ||
    workerFailed7d >= 5 ||
    loadErrors >= 3 ||
    loadOpsStatus === 'critical'
  ) {
    status = 'critical'
  } else if (
    goldenBelowThreshold ||
    workerFailed7d > 0 ||
    loadErrors > 0 ||
    dupHighRisk > 0 ||
    loadOpsStatus === 'degraded' ||
    (healthScore != null && healthScore < 50)
  ) {
    status = 'degraded'
  }

  const incidentCount = Number(signals.incidentCount) || 0

  return {
    status,
    openHighDrift,
    loadErrors,
    workerFailed7d,
    dupHighRisk,
    goldenBelowThreshold,
    healthScore,
    incidentCount,
    label:
      status === 'healthy'
        ? 'All clear'
        : status === 'degraded'
          ? 'Needs attention'
          : 'Critical',
  }
}

/**
 * Synthesize incident feed from observe signals (pure).
 * @param {object} input
 */
export function synthesizeObserveIncidents(input = {}) {
  const incidents = []

  for (const e of input.driftOpenHigh || []) {
    incidents.push({
      id: `drift:${e.id}`,
      kind: 'drift',
      severity: 'critical',
      title: e.summary || e.code || 'Schema drift',
      detail: typeof e.detail === 'string' ? e.detail : e.code || '',
      at: e.createdAt || e.created_at || new Date().toISOString(),
      link: '/drift-agent',
      resourceId: e.id,
    })
  }

  if (input.goldenBelowThreshold) {
    const recall = input.goldenRecall != null ? Number(input.goldenRecall) : null
    const min = input.goldenMinRecall != null ? Number(input.goldenMinRecall) : null
    incidents.push({
      id: 'golden:recall',
      kind: 'golden_eval',
      severity: recall != null && recall < 0.25 ? 'critical' : 'high',
      title: 'Golden join recall below threshold',
      detail:
        recall != null && min != null
          ? `${(recall * 100).toFixed(1)}% vs ${(min * 100).toFixed(0)}% minimum`
          : 'Scheduled golden eval under target',
      at: input.goldenLastRunAt || new Date().toISOString(),
      link: '/eval',
    })
  }

  if ((input.workerFailed7d || 0) > 0) {
    incidents.push({
      id: 'worker:failures',
      kind: 'worker',
      severity: input.workerFailed7d >= 5 ? 'critical' : 'high',
      title: `${input.workerFailed7d} warehouse job failure(s) — 7d`,
      detail: 'Review failed queue items on Load → Runs',
      at: new Date().toISOString(),
      link: '/load?tab=runs',
    })
  }

  for (const c of input.loadErrors || []) {
    incidents.push({
      id: `load:${c.id}`,
      kind: 'load',
      severity: 'high',
      title: `Sync failed: ${c.name}`,
      detail: c.errorKind || c.status || 'connection sync error',
      at: c.lastSyncAt || new Date().toISOString(),
      link: '/load',
      resourceId: c.id,
    })
  }

  for (const t of (input.duplicateHighTables || []).slice(0, 8)) {
    incidents.push({
      id: `dup:${t.tableName}`,
      kind: 'quality',
      severity: t.severity === 'high' ? 'high' : 'medium',
      title: `Duplicate risk: ${t.tableName}`,
      detail: [
        t.dupKeyPct != null ? `key dup ${t.dupKeyPct}%` : null,
        t.dupRowPct != null ? `row dup ${t.dupRowPct}%` : null,
        t.nullPct != null ? `nulls ${t.nullPct}%` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      at: input.generatedAt || new Date().toISOString(),
      link: '/joins?tab=duplicates',
    })
  }

  for (const r of input.recentFailedRuns || []) {
    incidents.push({
      id: `job:${r.id}`,
      kind: 'job',
      severity: 'medium',
      title: `Job run failed: ${r.jobName || r.jobId || r.id}`,
      detail: r.error || r.status || 'failed',
      at: r.createdAt || r.created_at,
      link: r.jobId ? `/jobs/${r.jobId}` : '/jobs',
      resourceId: r.id,
    })
  }

  incidents.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 9
    const sb = SEVERITY_RANK[b.severity] ?? 9
    if (sa !== sb) return sa - sb
    return new Date(b.at).getTime() - new Date(a.at).getTime()
  })

  return incidents.slice(0, 40)
}

/**
 * Full workspace observe dashboard payload.
 * @param {string} workspaceId
 * @param {{ packId?: string }} [opts]
 */
export async function buildObserveDashboard(workspaceId, opts = {}) {
  const packId = opts.packId || 'ecommerce-v1'
  const minRecall = Number(process.env.QUE_GOLDEN_MIN_RECALL || 0.35)
  const generatedAt = new Date().toISOString()

  const [
    health,
    driftEvents,
    driftOpenHigh,
    goldenSched,
    cert,
    worker,
    failedQueue,
    dupProfile,
    failedRuns,
    syncSchedule,
  ] = await Promise.all([
    computeHealthScorecard(workspaceId, packId).catch(() => null),
    listRecentDrift(workspaceId, 12).catch(() => []),
    getOpenHighDrift(workspaceId).catch(() => []),
    getGoldenEvalSchedule(workspaceId).catch(() => null),
    getLatestPackCertification(workspaceId, packId).catch(() => null),
    getWorkerPoolStatus(workspaceId).catch(() => null),
    listQueueItems(workspaceId, { status: 'failed', limit: 6 }).catch(() => []),
    computeDuplicateProfile(workspaceId).catch(() => null),
    query(
      `SELECT jr.id, jr.job_id, jr.status, jr.error_message, jr.created_at,
              j.name AS job_name
       FROM job_runs jr
       LEFT JOIN jobs j ON j.id = jr.job_id
       WHERE jr.workspace_id = $1 AND jr.status = 'failed'
         AND jr.created_at > now() - interval '14 days'
       ORDER BY jr.created_at DESC
       LIMIT 8`,
      [workspaceId],
    )
      .then(({ rows }) => rows)
      .catch(() => []),
    getWorkspaceSyncScheduleStatus(workspaceId).catch(() => null),
  ])

  const goldenRecall =
    goldenSched?.lastRecall != null
      ? Number(goldenSched.lastRecall)
      : cert?.goldenRecall != null
        ? Number(cert.goldenRecall)
        : null

  const goldenBelowThreshold =
    goldenRecall != null && Number.isFinite(goldenRecall) && goldenRecall < minRecall

  const loadErrors = (syncSchedule?.connections || []).filter(
    (c) => c.lastSyncErrorKind || c.status === 'error',
  )

  const loadPipelines = (syncSchedule?.connections || []).map((c) => ({
    ...c,
    sla: computeLoadSlaStatus(c),
  }))
  const loadReadiness = summarizeLoadOps({
    pipelines: loadPipelines,
    workerFailed7d: worker?.failed7d ?? 0,
  })

  const dupHighTables = (dupProfile?.tables || []).filter(
    (t) => t.severity === 'high' || t.severity === 'medium',
  )

  const recentFailedRuns = (failedRuns || []).map((r) => ({
    id: r.id,
    jobId: r.job_id,
    jobName: r.job_name,
    status: r.status,
    error: r.error_message,
    createdAt: r.created_at,
  }))

  const incidents = synthesizeObserveIncidents({
    driftOpenHigh,
    goldenBelowThreshold,
    goldenRecall,
    goldenMinRecall: minRecall,
    goldenLastRunAt: goldenSched?.lastRunAt,
    workerFailed7d: worker?.failed7d ?? 0,
    loadErrors,
    duplicateHighTables: dupHighTables,
    recentFailedRuns,
    generatedAt,
  })

  const summary = summarizeObserveStatus({
    openHighDrift: driftOpenHigh.length,
    loadErrors: loadErrors.length,
    workerFailed7d: worker?.failed7d ?? 0,
    dupHighRisk: dupProfile?.highRisk ?? 0,
    goldenBelowThreshold,
    healthScore: health?.score ?? null,
    incidentCount: incidents.length,
    loadOpsStatus: loadReadiness.status,
  })

  return {
    workspaceId,
    generatedAt,
    packId,
    summary,
    health,
    drift: {
      events: driftEvents,
      openHigh: driftOpenHigh,
      hasBlockingRisk: driftOpenHigh.length > 0,
    },
    golden: {
      schedule: goldenSched,
      certification: cert,
      recall: goldenRecall,
      minRecall,
      belowThreshold: goldenBelowThreshold,
    },
    worker: worker || {
      enabled: false,
      queued: 0,
      running: 0,
      failed7d: 0,
      succeeded7d: 0,
    },
    failedQueue: failedQueue || [],
    duplicates: {
      tableCount: dupProfile?.tableCount ?? 0,
      highRisk: dupProfile?.highRisk ?? 0,
      mediumRisk: dupProfile?.mediumRisk ?? 0,
      topTables: dupHighTables.slice(0, 6),
    },
    load: {
      errorCount: loadErrors.length,
      readiness: {
        status: loadReadiness.status,
        label: loadReadiness.label,
        pipelineCount: loadReadiness.pipelineCount,
        slaCounts: loadReadiness.slaCounts,
      },
      connections: loadErrors.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        errorKind: c.lastSyncErrorKind,
        lastSyncAt: c.lastSyncAt,
      })),
    },
    jobs: {
      recentFailed: recentFailedRuns,
    },
    incidents,
  }
}
