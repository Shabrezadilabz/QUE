/**
 * S7.2 — Steward DQ dashboard (golden pass, drift, joins pending).
 */
import { query } from './db.js'
import { getGoldenEvalSchedule } from './scheduledGoldenEval.js'
import { getStewardInboxSummary } from './stewardInbox.js'
import { listDriftFixSuggestions } from './driftAgent.js'
import { listRecentDrift } from './contracts/contractFreeze.js'
import { getWorkspaceSettings } from './workspaceSettings.js'

const DEFAULT_MIN_RECALL = Number(process.env.QUE_GOLDEN_MIN_RECALL || 0.35)

export async function getStewardDqDashboard(workspaceId) {
  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  const minRecall = Number(
    settings.goldenEvalMinRecall ?? settings.autoPromoteMinRecall ?? DEFAULT_MIN_RECALL,
  )

  const [
    schedule,
    inbox,
    joinCounts,
    driftEvents,
    driftFixes,
    certMarts,
  ] = await Promise.all([
    getGoldenEvalSchedule(workspaceId),
    getStewardInboxSummary(workspaceId),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'suggested')::int AS suggested,
         COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
       FROM relationships WHERE workspace_id = $1`,
      [workspaceId],
    ),
    listRecentDrift(workspaceId, 50).catch(() => []),
    listDriftFixSuggestions(workspaceId, { status: 'proposed' }).catch(() => []),
    query(
      `SELECT COUNT(*)::int AS n FROM managed_datasets
       WHERE workspace_id = $1 AND certified = true`,
      [workspaceId],
    ).catch(() => ({ rows: [{ n: 0 }] })),
  ])

  const jc = joinCounts.rows[0] || {}
  const openDrift = (Array.isArray(driftEvents) ? driftEvents : []).filter(
    (e) => !e.acknowledged,
  )
  const highDrift = openDrift.filter(
    (e) => e.severity === 'high' || e.severity === 'warn',
  )

  const lastRecall =
    schedule.lastRecall != null
      ? Number(schedule.lastRecall)
      : settings.lastGoldenEval?.recall != null
        ? Number(settings.lastGoldenEval.recall)
        : null

  const goldenPass =
    lastRecall != null && Number.isFinite(lastRecall)
      ? lastRecall >= minRecall
      : null

  const widgets = [
    {
      id: 'golden_recall',
      label: 'Golden eval recall',
      value:
        lastRecall != null ? `${(lastRecall * 100).toFixed(1)}%` : '—',
      status:
        goldenPass === true
          ? 'ok'
          : goldenPass === false
            ? 'fail'
            : 'unknown',
      href: '/eval',
      hint:
        schedule.enabled
          ? `Scheduled every ${schedule.intervalHours}h`
          : 'Enable schedule on Eval',
    },
    {
      id: 'joins_pending',
      label: 'Joins pending promote',
      value: String(jc.suggested ?? 0),
      status: (jc.suggested ?? 0) > 0 ? 'warn' : 'ok',
      href: '/joins',
      hint: `${jc.accepted ?? 0} promoted · ${jc.rejected ?? 0} rejected`,
    },
    {
      id: 'drift_open',
      label: 'Open drift events',
      value: String(openDrift.length),
      status: highDrift.length ? 'fail' : openDrift.length ? 'warn' : 'ok',
      href: '/lineage',
      hint: `${highDrift.length} high/warn severity`,
    },
    {
      id: 'steward_inbox',
      label: 'Steward inbox open',
      value: String(inbox.open ?? 0),
      status: (inbox.high ?? 0) > 0 ? 'fail' : (inbox.open ?? 0) > 0 ? 'warn' : 'ok',
      href: '/steward',
      hint: `${inbox.high ?? 0} high severity`,
    },
    {
      id: 'drift_fixes',
      label: 'Drift fix proposals',
      value: String(driftFixes.length),
      status: driftFixes.length ? 'warn' : 'ok',
      href: '/steward#drift-fixes',
      hint: 'AI-drafted remap / re-freeze suggestions',
    },
    {
      id: 'cert_marts',
      label: 'Certified marts',
      value: String(certMarts.rows[0]?.n ?? 0),
      status: (certMarts.rows[0]?.n ?? 0) > 0 ? 'ok' : 'unknown',
      href: '/bi',
      hint: 'Managed datasets certified for BI',
    },
  ]

  return {
    workspaceId,
    evaluatedAt: new Date().toISOString(),
    minRecall,
    goldenEval: {
      enabled: schedule.enabled,
      intervalHours: schedule.intervalHours,
      pairCount: (schedule.pairs || []).length,
      lastRunAt: schedule.lastRunAt,
      lastRecall,
      passed: goldenPass,
      nextRunAt: schedule.nextRunAt,
    },
    joins: {
      suggested: jc.suggested ?? 0,
      accepted: jc.accepted ?? 0,
      rejected: jc.rejected ?? 0,
    },
    drift: {
      open: openDrift.length,
      high: highDrift.length,
      fixProposals: driftFixes.length,
    },
    inbox,
    widgets,
  }
}
