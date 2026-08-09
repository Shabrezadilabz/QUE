/**
 * Eval harness dashboard — join golden-set + validation suite rollup.
 */
import { query } from './db.js'
import { evaluateGoldenSet } from './goldenSetEval.js'
import { listWorkspaceRules } from './workspaceRules.js'

export async function getEvalDashboard(workspaceId) {
  const [
    joinCounts,
    promoteEvents,
    recentRuns,
    rules,
    contractRuns,
  ] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'suggested' AND relation_type = 'ai-inferred')::int AS suggested,
         COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
       FROM relationships WHERE workspace_id = $1`,
      [workspaceId],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM workspace_audit_events
       WHERE workspace_id = $1 AND action = 'relationship.promote'
         AND created_at > now() - interval '30 days'`,
      [workspaceId],
    ),
    query(
      `SELECT status, COUNT(*)::int AS n FROM job_runs
       WHERE workspace_id = $1 AND created_at > now() - interval '30 days'
       GROUP BY status`,
      [workspaceId],
    ),
    listWorkspaceRules(workspaceId, { enabledOnly: true }),
    query(
      `SELECT status, COUNT(*)::int AS n FROM contract_test_runs
       WHERE workspace_id = $1 AND created_at > now() - interval '30 days'
       GROUP BY status`,
      [workspaceId],
    ).catch(() => ({ rows: [] })),
  ])

  const jc = joinCounts.rows[0] || {}
  const decided = (jc.accepted || 0) + (jc.rejected || 0)
  const promoteRate =
    decided > 0 ? Math.round(((jc.accepted || 0) / decided) * 1000) / 10 : null

  const runsByStatus = Object.fromEntries(
    (recentRuns.rows || []).map((r) => [r.status, r.n]),
  )
  const contractByStatus = Object.fromEntries(
    (contractRuns.rows || []).map((r) => [r.status, r.n]),
  )

  return {
    generatedAt: new Date().toISOString(),
    joins: {
      suggested: jc.suggested || 0,
      accepted: jc.accepted || 0,
      rejected: jc.rejected || 0,
      promoteRatePct: promoteRate,
      promotesLast30d: promoteEvents.rows[0]?.n || 0,
    },
    jobs: {
      last30d: runsByStatus,
      successRatePct: (() => {
        const ok = runsByStatus.succeeded || 0
        const fail = runsByStatus.failed || 0
        const t = ok + fail
        return t ? Math.round((ok / t) * 1000) / 10 : null
      })(),
    },
    contracts: {
      last30d: contractByStatus,
    },
    rules: {
      enabled: rules.length,
      joinRules: rules.filter((r) => r.kind === 'join').length,
    },
    guidance: [
      'Run golden-set eval regularly against known true joins',
      'Keep enableAutoPromoteLowRisk off until promoteRate is stable',
      'Grow join rules from Promote — they steer AI like Cursor rules',
    ],
  }
}

export async function runGoldenEvalForDashboard(workspaceId, pairs) {
  const report = await evaluateGoldenSet(workspaceId, pairs)
  return {
    report,
    dashboardHint: {
      recall: report.recall,
      precision: report.precision,
      pairCount: Array.isArray(pairs) ? pairs.length : 0,
    },
  }
}
