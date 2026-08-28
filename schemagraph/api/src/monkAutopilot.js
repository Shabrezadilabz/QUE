/**
 * Monk Mode Phase 5 — autopilot cert loop: infer → promote → eval → certify.
 */
import { inferJoinsForWorkspace } from './inferJoins.js'
import {
  maybeAutoPromoteForMonk,
  maybeAutoPromoteLowRisk,
  recordGoldenEvalScore,
} from './autoPromote.js'
import {
  runPackCertificationGate,
  loadSportedgeGoldenPairs,
  seedSportedgeGoldenSchedule,
} from './packCertification.js'
import { evaluateGoldenSet } from './goldenSetEval.js'
import {
  upsertGoldenEvalSchedule,
  runGoldenEvalNow,
} from './scheduledGoldenEval.js'
import { updateWorkspaceSettings } from './workspaceSettings.js'
import {
  getPackAutopilotMinRecall,
  getPackCertMinRecall,
  shouldEnableMonkAutopilot,
} from './packPolicies.js'
import { planFinanceStagingMarts } from './packMartMaterialize.js'
import { runCertifiedKpiCompletion } from './certCompletionLoop.js'
import { getCertChecklist } from './certChecklist.js'
import { listLearnedGoldenPairs } from './learnGoldenPairs.js'

function loadGoldenPairsForPack(pack) {
  if (pack?.goldenPairSource || pack?.id === 'ecommerce-v1') {
    return loadSportedgeGoldenPairs()
  }
  return []
}

async function loadGoldenPairsForWorkspace(workspaceId, pack) {
  const base = loadGoldenPairsForPack(pack)
  let learned = []
  try {
    learned = await listLearnedGoldenPairs(workspaceId, 100)
  } catch {
    /* table may not exist yet */
  }
  const seen = new Set(
    base.map((p) =>
      `${p.fromTable}.${p.fromColumn}->${p.toTable}.${p.toColumn}`.toLowerCase(),
    ),
  )
  for (const p of learned) {
    const key = `${p.fromTable}.${p.fromColumn}->${p.toTable}.${p.toColumn}`.toLowerCase()
    if (!seen.has(key)) {
      base.push(p)
      seen.add(key)
    }
  }
  return base
}

async function ensureMonkAutopilotSettings(workspaceId, pack) {
  const autoPromoteMinRecall = getPackAutopilotMinRecall(pack)
  await updateWorkspaceSettings(workspaceId, {
    enableAutoPromoteLowRisk: true,
    autoPromoteMinRecall,
    inferJoinsOnSync: true,
  })
  return { enableAutoPromoteLowRisk: true, autoPromoteMinRecall }
}

async function seedGoldenScheduleForPack(workspaceId, pack) {
  const pairs = loadGoldenPairsForPack(pack)
  if (!pairs.length) {
    return { pairs: 0, schedule: null }
  }
  if (pack?.id === 'ecommerce-v1' || pack?.goldenPairSource) {
    return seedSportedgeGoldenSchedule(workspaceId)
  }
  const schedule = await upsertGoldenEvalSchedule(workspaceId, {
    enabled: true,
    intervalHours: 24,
    pairs,
  })
  return { pairs: pairs.length, schedule }
}

/**
 * Full autopilot certification loop for Monk Mode.
 * @param {string} workspaceId
 * @param {object} pack
 * @param {{ runId?: string, userId?: string|null, requiredOk?: boolean }} opts
 */
export async function runMonkAutopilotCertLoop(workspaceId, pack, opts = {}) {
  const steps = []
  const minRecall = getPackCertMinRecall(pack)
  const pairs = await loadGoldenPairsForWorkspace(workspaceId, pack)

  if (!shouldEnableMonkAutopilot(pack)) {
    const certResult = await runPackCertificationGate(workspaceId, {
      packId: pack.id,
      runId: opts.runId ?? null,
      minRecall,
      requiredOk: opts.requiredOk,
      pairs,
    })
    return {
      skipped: true,
      reason: 'autopilot_disabled',
      steps,
      certResult,
      passed: certResult.passed,
    }
  }

  try {
    const settings = await ensureMonkAutopilotSettings(workspaceId, pack)
    steps.push({
      id: 'autopilot_settings',
      ok: true,
      message: `Autopilot enabled — auto-promote recall gate ${(settings.autoPromoteMinRecall * 100).toFixed(0)}%`,
      detail: settings,
    })
  } catch (err) {
    steps.push({
      id: 'autopilot_settings',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const seed = await seedGoldenScheduleForPack(workspaceId, pack)
    steps.push({
      id: 'golden_schedule',
      ok: true,
      message: seed.pairs
        ? `Golden schedule: ${seed.pairs} pairs, continuous eval ON`
        : 'No golden pairs for pack — cert uses template match gate',
      detail: seed,
    })
  } catch (err) {
    steps.push({
      id: 'golden_schedule',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const joins = await inferJoinsForWorkspace(workspaceId, {})
    steps.push({
      id: 'infer_joins',
      ok: true,
      message: `Join inference: ${joins.created || 0} new suggestions`,
      detail: joins,
    })
  } catch (err) {
    steps.push({
      id: 'infer_joins',
      ok: false,
      message: err.message || String(err),
    })
  }

  if (pairs.length) {
    try {
      const baseline = await evaluateGoldenSet(workspaceId, pairs)
      await recordGoldenEvalScore(workspaceId, baseline)
      steps.push({
        id: 'baseline_eval',
        ok: true,
        message: `Baseline recall ${(baseline.recall * 100).toFixed(1)}%`,
        detail: baseline,
      })
    } catch (err) {
      steps.push({
        id: 'baseline_eval',
        ok: false,
        message: err.message || String(err),
      })
    }
  }

  for (let round = 1; round <= 2; round += 1) {
    try {
      const promote = await maybeAutoPromoteForMonk(
        workspaceId,
        pack,
        opts.userId ?? null,
      )
      steps.push({
        id: `auto_promote_${round}`,
        ok: promote.promoted > 0 || round === 1,
        message:
          promote.promoted > 0
            ? `Round ${round}: auto-promoted ${promote.promoted} join(s) (${promote.skipped} skipped)`
            : `Round ${round}: no joins auto-promoted (${promote.skipped} skipped)`,
        detail: promote,
      })
      if (promote.promoted === 0 && round === 2) break
    } catch (err) {
      steps.push({
        id: `auto_promote_${round}`,
        ok: false,
        message: err.message || String(err),
      })
    }

    if (pairs.length) {
      try {
        const evalReport = await evaluateGoldenSet(workspaceId, pairs)
        await recordGoldenEvalScore(workspaceId, evalReport)
        steps.push({
          id: `golden_eval_${round}`,
          ok: evalReport.recall >= minRecall,
          message: `Recall ${(evalReport.recall * 100).toFixed(1)}% after promote round ${round}`,
          detail: evalReport,
        })
        if (evalReport.recall >= minRecall) break
      } catch (err) {
        steps.push({
          id: `golden_eval_${round}`,
          ok: false,
          message: err.message || String(err),
        })
      }
    }
  }

  try {
    const workspacePromote = await maybeAutoPromoteLowRisk(
      workspaceId,
      opts.userId ?? null,
    )
    if (workspacePromote.promoted > 0) {
      steps.push({
        id: 'workspace_auto_promote',
        ok: true,
        message: `Workspace green-tier promote: ${workspacePromote.promoted} join(s)`,
        detail: workspacePromote,
      })
    }
  } catch {
    /* optional second pass */
  }

  let certResult = null
  try {
    certResult = await runPackCertificationGate(workspaceId, {
      packId: pack.id,
      runId: opts.runId ?? null,
      minRecall,
      requiredOk: opts.requiredOk,
      pairs,
    })
    steps.push({
      id: 'certify',
      ok: certResult.passed,
      message: certResult.passed
        ? `Certified — recall ${(certResult.report.recall * 100).toFixed(1)}%`
        : `Cert pending — recall ${(certResult.report.recall * 100).toFixed(1)}% (need ${(minRecall * 100).toFixed(0)}%)`,
      detail: certResult,
    })
    if (certResult.report) {
      await recordGoldenEvalScore(workspaceId, certResult.report)
    }
  } catch (err) {
    steps.push({
      id: 'certify',
      ok: false,
      message: err.message || String(err),
    })
  }

  if (pairs.length) {
    try {
      await runGoldenEvalNow(workspaceId, { alertOnDrop: false })
      steps.push({
        id: 'schedule_golden_tick',
        ok: true,
        message: 'Scheduled golden eval updated for continuous monitoring',
      })
    } catch {
      /* schedule may not exist yet in test env */
    }
  }

  if (pack?.policies?.noAutoMaterialize) {
    try {
      const staging = await planFinanceStagingMarts(workspaceId, pack, {
        userId: opts.userId ?? null,
      })
      if (staging.planned) {
        steps.push({
          id: 'finance_staging',
          ok: true,
          message: `Finance staging: ${staging.planned} mart(s) queued in scratch schema`,
          detail: staging,
        })
      }
    } catch (err) {
      steps.push({
        id: 'finance_staging',
        ok: false,
        message: err.message || String(err),
      })
    }
  }

  let deliverables = null
  let kpiCompletion = null
  if (certResult?.passed) {
    try {
      kpiCompletion = await runCertifiedKpiCompletion(
        workspaceId,
        pack,
        certResult,
        {
          userId: opts.userId ?? null,
          connectionId: opts.connectionId ?? null,
          matchResult: opts.matchResult ?? null,
        },
      )
      for (const step of kpiCompletion.steps || []) {
        steps.push({ id: `kpi_${step.id}`, ...step })
      }
      deliverables = { steps: kpiCompletion.steps }
    } catch (err) {
      steps.push({
        id: 'kpi_completion',
        ok: false,
        message: err.message || String(err),
      })
    }
  }

  const checklist =
    kpiCompletion?.checklist ||
    (certResult?.passed
      ? await getCertChecklist(workspaceId, { packId: pack.id })
      : null)

  return {
    skipped: false,
    steps,
    certResult,
    deliverables,
    kpiCompletion,
    checklist,
    passed: Boolean(certResult?.passed),
  }
}
