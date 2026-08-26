/**
 * Monk Mode agent tool loop — profile, joins, KPIs, eval (Phase 4).
 */
import { inferJoinsForWorkspace } from './inferJoins.js'
import { profileWorkspaceColumns } from './columnProfiling.js'
import { seedMetricsFromPack } from './metricPackSeed.js'
import { runPackCertificationGate } from './packCertification.js'
import { recordWorkspaceMemory } from './workspaceMemory.js'
import { getPackCertMinRecall } from './packPolicies.js'

const TOOLS = [
  { id: 'profile_schema', label: 'Profile top columns' },
  { id: 'infer_joins', label: 'Infer join candidates' },
  { id: 'seed_kpis', label: 'Verify KPI registry' },
  { id: 'golden_eval', label: 'Run golden eval gate' },
  { id: 'record_memory', label: 'Store workspace hints' },
]

/**
 * Execute Monk agent tools sequentially; returns step results for UI feed.
 * @param {string} workspaceId
 * @param {object} pack
 * @param {{ matches: object[], canRunMonk?: boolean }} matchResult
 * @param {{ runId?: string, userId?: string|null }} opts
 */
export async function runMonkAgentTools(
  workspaceId,
  pack,
  matchResult,
  opts = {},
) {
  const steps = []
  const minRecall = getPackCertMinRecall(pack)

  try {
    const profile = await profileWorkspaceColumns(workspaceId, { maxTables: 25 })
    steps.push({
      tool: 'profile_schema',
      ok: true,
      message: `Profiled ${profile.columnCount} columns`,
      detail: profile,
    })
  } catch (err) {
    steps.push({
      tool: 'profile_schema',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const joins = await inferJoinsForWorkspace(workspaceId, {})
    steps.push({
      tool: 'infer_joins',
      ok: true,
      message: `Join scan: ${joins.created || 0} new suggestions`,
      detail: { created: joins.created, scanned: joins.scanned },
    })
  } catch (err) {
    steps.push({
      tool: 'infer_joins',
      ok: false,
      message: err.message || String(err),
    })
  }

  if (matchResult?.canRunMonk && pack?.kpis?.length) {
    try {
      const metrics = await seedMetricsFromPack(workspaceId, pack, matchResult, {
        userId: opts.userId ?? null,
      })
      steps.push({
        tool: 'seed_kpis',
        ok: true,
        message: `KPIs: ${metrics.total} defined (${metrics.created} new)`,
        detail: metrics,
      })
    } catch (err) {
      steps.push({
        tool: 'seed_kpis',
        ok: false,
        message: err.message || String(err),
      })
    }
  }

  if (!opts.skipGoldenEval) {
    try {
      const cert = await runPackCertificationGate(workspaceId, {
        packId: pack.id,
        runId: opts.runId ?? null,
        minRecall,
      })
      steps.push({
        tool: 'golden_eval',
        ok: cert.passed,
        message: cert.passed
          ? `Certified — recall ${(cert.report.recall * 100).toFixed(1)}%`
          : `Recall ${(cert.report.recall * 100).toFixed(1)}% (need ${(minRecall * 100).toFixed(0)}%)`,
        detail: cert,
      })
    } catch (err) {
      steps.push({
        tool: 'golden_eval',
        ok: false,
        message: err.message || String(err),
      })
    }
  } else {
    steps.push({
      tool: 'golden_eval',
      ok: true,
      message: 'Skipped — autopilot cert already passed',
    })
  }

  try {
    await recordWorkspaceMemory(workspaceId, {
      kind: 'pack_hint',
      key: `monk:${pack.id}:last_run`,
      value: {
        runId: opts.runId,
        matchScore: matchResult?.scorePct,
        toolsRun: steps.map((s) => s.tool),
        at: new Date().toISOString(),
      },
      source: 'monk_agent',
      userId: opts.userId ?? null,
    })
    steps.push({
      tool: 'record_memory',
      ok: true,
      message: 'Workspace memory updated from Monk run',
    })
  } catch (err) {
    steps.push({
      tool: 'record_memory',
      ok: false,
      message: err.message || String(err),
    })
  }

  return { tools: TOOLS, steps, allOk: steps.every((s) => s.ok) }
}

export { TOOLS as MONK_AGENT_TOOLS }
