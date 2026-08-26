/**
 * Monk Mode orchestrator v1 — Discover → Map → Clean → Build → Certify.
 * Streams events to monk_mode_events for live UI progress.
 */
import { query } from './db.js'
import { buildSchemaContextPack } from './schemaContext.js'
import { getIndustryPack, scorePackAgainstSchema } from './templateMatcher.js'
import { resolveWorkspacePack } from './customPacks.js'
import {
  profileWorkspaceColumns,
  seedQualityIssuesFromPack,
} from './columnProfiling.js'
import { listLiveTableNames } from './connectors/postgres.js'
import { resolveLiveTarget } from './liveExec.js'
import { applyIndustryTemplatePack } from './industryTemplates.js'
import {
  buildEntityMappings,
  persistEntityMappings,
} from './templateMapper.js'
import { seedMetricsFromPack } from './metricPackSeed.js'
import { seedJobsFromPack } from './jobPackSeed.js'
import {
  runPackCertificationGate,
  getLatestPackCertification,
} from './packCertification.js'
import { planPackMartMaterializations } from './packMartMaterialize.js'
import { seedDashboardsFromPack } from './dashboardTemplates.js'
import {
  validatePackPoliciesForMonk,
  shouldSkipMartMaterialize,
  shouldUseTemplateFallback,
  getPackCertMinRecall,
} from './packPolicies.js'
import { runMonkAgentTools } from './monkAgent.js'
import { runMonkAutopilotCertLoop } from './monkAutopilot.js'

const PHASES = ['discover', 'map', 'clean', 'build', 'certify', 'done']

function mapRun(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    packId: r.pack_id,
    industry: r.industry,
    status: r.status,
    phase: r.phase,
    matchScore: r.match_score != null ? Number(r.match_score) : null,
    capability: r.capability_json || {},
    summary: r.summary_json || {},
    errorMessage: r.error_message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function appendEvent(runId, workspaceId, phase, message, opts = {}) {
  await query(
    `INSERT INTO monk_mode_events (run_id, workspace_id, phase, level, message, detail_json)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      runId,
      workspaceId,
      phase,
      opts.level || 'info',
      message,
      JSON.stringify(opts.detail || {}),
    ],
  )
}

async function setRunPhase(runId, phase, patch = {}) {
  await query(
    `UPDATE monk_mode_runs
     SET phase = $2,
         status = COALESCE($3, status),
         match_score = COALESCE($4, match_score),
         capability_json = COALESCE($5, capability_json),
         summary_json = COALESCE($6, summary_json),
         error_message = COALESCE($7, error_message),
         completed_at = COALESCE($8, completed_at),
         updated_at = now()
     WHERE id = $1`,
    [
      runId,
      phase,
      patch.status ?? null,
      patch.matchScore ?? null,
      patch.capability ? JSON.stringify(patch.capability) : null,
      patch.summary ? JSON.stringify(patch.summary) : null,
      patch.errorMessage ?? null,
      patch.completedAt ?? null,
    ],
  )
}

export async function getMonkRun(workspaceId, runId) {
  const { rows } = await query(
    `SELECT * FROM monk_mode_runs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, runId],
  )
  return rows[0] ? mapRun(rows[0]) : null
}

export async function listMonkRuns(workspaceId, opts = {}) {
  const limit = Math.min(Number(opts.limit) || 20, 50)
  const { rows } = await query(
    `SELECT * FROM monk_mode_runs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    [workspaceId],
  )
  return rows.map(mapRun)
}

export async function listMonkEvents(runId, opts = {}) {
  const since = opts.since ? new Date(opts.since) : null
  const params = [runId]
  let sql = `SELECT * FROM monk_mode_events WHERE run_id = $1`
  if (since && !Number.isNaN(since.getTime())) {
    params.push(since.toISOString())
    sql += ` AND created_at > $${params.length}`
  }
  sql += ` ORDER BY created_at ASC LIMIT 500`
  const { rows } = await query(sql, params)
  return rows.map((r) => ({
    id: r.id,
    phase: r.phase,
    level: r.level,
    message: r.message,
    detail: r.detail_json || {},
    createdAt: r.created_at,
  }))
}

function buildCapabilityMap(pack, matchResult, profileResult, buildResult, certResult) {
  const ready = []
  const review = []
  const unavailable = []

  for (const cap of pack.capabilities || []) {
    if (cap.id === 'ceo_revenue_chat') {
      if (matchResult.requiredOk) ready.push({ ...cap, reason: 'orders + brands detected' })
      else review.push({ ...cap, reason: 'Connect orders and brands tables' })
      continue
    }
    if (cap.id === 'metrics_kpis') {
      const n = buildResult?.metrics?.total ?? 0
      if (n >= 3) ready.push({ ...cap, reason: `${n} KPIs registered` })
      else review.push({ ...cap, reason: 'Run Monk Mode build phase for KPIs' })
      continue
    }
    if (cap.id === 'golden_eval') {
      if (certResult?.passed) ready.push({ ...cap, reason: 'Certification passed' })
      else if (certResult?.report) {
        review.push({
          ...cap,
          reason: `Golden recall ${Math.round((certResult.report.recall || 0) * 100)}% — promote joins`,
        })
      } else {
        review.push({ ...cap, reason: 'Run certification after join promote' })
      }
      continue
    }
    if (cap.id === 'ceo_dashboard') {
      const n = buildResult?.dashboards?.created ?? buildResult?.dashboards?.updated ?? 0
      if (n >= 3) ready.push({ ...cap, reason: `${n} CEO widgets seeded` })
      else review.push({ ...cap, reason: 'Run Monk Mode build for dashboards' })
      continue
    }
    if (matchResult.score >= (pack.minMatchScore ?? 0.55)) {
      ready.push(cap)
    } else {
      unavailable.push({ ...cap, reason: 'Template match too low — sync more tables' })
    }
  }

  for (const j of buildResult?.jobs?.jobs || []) {
    ready.push({
      id: `job_${j.recipeId || j.id}`,
      label: j.title || 'Pack job',
      href: `/jobs/${j.id}/notebook`,
    })
  }

  if (buildResult?.legacyJob?.id) {
    ready.push({
      id: 'pack_job',
      label: buildResult.legacyJob.title || 'Pack job',
      href: `/jobs/${buildResult.legacyJob.id}/notebook`,
    })
  }

  return {
    ready,
    review,
    unavailable,
    matchScorePct: matchResult.scorePct,
    profiledColumns: profileResult?.columnCount ?? 0,
    certificationStatus: certResult?.status || null,
    kpiCount: buildResult?.metrics?.total ?? 0,
  }
}

/**
 * Start and execute Monk Mode run (synchronous v1 — poll events from UI).
 * @param {string} workspaceId
 * @param {{ packId?: string, userId?: string|null }} opts
 */
export async function startMonkModeRun(workspaceId, opts = {}) {
  const packId = opts.packId || 'ecommerce-v1'
  const pack =
    (await resolveWorkspacePack(workspaceId, packId)) ||
    getIndustryPack(packId)
  if (!pack) {
    const err = new Error('industry pack not found')
    err.status = 404
    throw err
  }

  const { rows } = await query(
    `INSERT INTO monk_mode_runs (
       workspace_id, pack_id, industry, status, phase, started_by, started_at
     ) VALUES ($1,$2,$3,'running','discover',$4,now())
     RETURNING *`,
    [workspaceId, pack.id, pack.industry, opts.userId ?? null],
  )
  const run = mapRun(rows[0])
  const runId = run.id

  try {
    await appendEvent(
      runId,
      workspaceId,
      'discover',
      `Monk Mode started — ${pack.displayName}`,
      { detail: { packId: pack.id } },
    )

    const packCtx = await buildSchemaContextPack(workspaceId)
    await appendEvent(
      runId,
      workspaceId,
      'discover',
      `Schema synced: ${packCtx.stats.tableCount} tables, ${packCtx.stats.columnCount} columns`,
    )

    let liveTables = []
    try {
      const connection = await resolveLiveTarget(workspaceId, {}, null)
      if (connection?.type === 'postgresql') {
        liveTables = await listLiveTableNames(connection.config)
        await appendEvent(
          runId,
          workspaceId,
          'discover',
          `Live warehouse: ${liveTables.length} tables verified`,
          { level: 'success', detail: { sample: liveTables.slice(0, 12) } },
        )
      }
    } catch (err) {
      await appendEvent(
        runId,
        workspaceId,
        'discover',
        `Live connection skipped: ${err.message || err}`,
        { level: 'warn' },
      )
    }

    const matchResult = scorePackAgainstSchema(packCtx.tables, pack)
    const policyCheck = validatePackPoliciesForMonk(pack, matchResult)
    for (const w of policyCheck.warnings) {
      await appendEvent(runId, workspaceId, 'discover', w, { level: 'warn' })
    }
    if (!policyCheck.ok) {
      for (const b of policyCheck.blocks) {
        await appendEvent(runId, workspaceId, 'discover', b, { level: 'error' })
      }
    }
    await appendEvent(
      runId,
      workspaceId,
      'discover',
      `Template match: ${matchResult.scorePct}% (${matchResult.matches.length} tables mapped)`,
      {
        level: matchResult.canRunMonk ? 'success' : 'warn',
        detail: { matches: matchResult.matches, missing: matchResult.missing },
      },
    )

    await setRunPhase(runId, 'map', { matchScore: matchResult.scorePct })

    const entityMappings = buildEntityMappings(pack, matchResult)
    await persistEntityMappings(workspaceId, runId, pack.id, entityMappings)
    await appendEvent(
      runId,
      workspaceId,
      'map',
      `Ontology mapped: ${entityMappings.length} entities`,
      { level: 'success', detail: { entities: entityMappings.map((e) => e.entity) } },
    )

    for (const m of matchResult.matches) {
      await appendEvent(
        runId,
        workspaceId,
        'map',
        `Mapped ${m.pattern} → ${m.table} (${m.entity})`,
      )
    }

    const profileResult = await profileWorkspaceColumns(workspaceId, {
      maxTables: 35,
    })
    await appendEvent(
      runId,
      workspaceId,
      'map',
      `Profiled ${profileResult.columnCount} columns across ${profileResult.tableCount} tables`,
      { level: 'success' },
    )

    await setRunPhase(runId, 'clean')

    const issues = await seedQualityIssuesFromPack(
      workspaceId,
      runId,
      pack,
      matchResult,
    )
    await appendEvent(
      runId,
      workspaceId,
      'clean',
      `Steward inbox: ${issues.created} items queued for review`,
      { level: issues.created ? 'warn' : 'success' },
    )

    await setRunPhase(runId, 'build')
    const buildResult = {
      metrics: null,
      jobs: null,
      legacyJob: null,
      marts: null,
      dashboards: null,
    }

    if (matchResult.canRunMonk) {
      buildResult.metrics = await seedMetricsFromPack(
        workspaceId,
        pack,
        matchResult,
        { userId: opts.userId ?? null },
      )
      await appendEvent(
        runId,
        workspaceId,
        'build',
        `KPI registry: ${buildResult.metrics.created} created, ${buildResult.metrics.updated} updated`,
        { level: 'success', detail: { total: buildResult.metrics.total } },
      )

      buildResult.jobs = await seedJobsFromPack(
        workspaceId,
        pack,
        matchResult,
        { userId: opts.userId ?? null },
      )
      if (buildResult.jobs.created) {
        await appendEvent(
          runId,
          workspaceId,
          'build',
          `Created ${buildResult.jobs.created} pack jobs`,
          {
            level: 'success',
            detail: { jobIds: buildResult.jobs.jobs.map((j) => j.id) },
          },
        )

        if (!shouldSkipMartMaterialize(pack)) {
          buildResult.marts = await planPackMartMaterializations(
            workspaceId,
            pack,
            buildResult.jobs,
            { userId: opts.userId ?? null },
          )
          if (buildResult.marts.planned) {
            await appendEvent(
              runId,
              workspaceId,
              'build',
              `Planned ${buildResult.marts.planned} mart materialization(s) — confirm in Jobs`,
              { level: 'warn', detail: buildResult.marts.items },
            )
          }
        } else {
          await appendEvent(
            runId,
            workspaceId,
            'build',
            'Mart materialize skipped — finance policy requires human confirm',
            { level: 'warn' },
          )
        }
      }

      if (pack.id === 'ecommerce-v1' || pack.dashboards?.length) {
        buildResult.dashboards = await seedDashboardsFromPack(
          workspaceId,
          pack,
          { userId: opts.userId ?? null },
        )
        if (buildResult.dashboards.created || buildResult.dashboards.updated) {
          await appendEvent(
            runId,
            workspaceId,
            'build',
            `Dashboard: ${buildResult.dashboards.created} new, ${buildResult.dashboards.updated} updated widgets`,
            { level: 'success', detail: { reportId: buildResult.dashboards.reportId } },
          )
        }
      }
    }

    const templateFallback =
      shouldUseTemplateFallback(pack) ||
      (pack.id === 'ecommerce-v1' ? 'retail-customer-360' : null)
    if (matchResult.canRunMonk && !buildResult.jobs?.created && templateFallback) {
      try {
        const installOut = await applyIndustryTemplatePack(
          workspaceId,
          templateFallback,
          { userId: opts.userId ?? null },
        )
        buildResult.legacyJob = installOut.job || null
        if (installOut.job?.id) {
          await appendEvent(
            runId,
            workspaceId,
            'build',
            `Fallback job: ${installOut.job.title || templateFallback}`,
            { level: 'success', detail: { jobId: installOut.job.id } },
          )
        }
      } catch (err) {
        await appendEvent(
          runId,
          workspaceId,
          'build',
          `Fallback job skipped: ${err.message || err}`,
          { level: 'warn' },
        )
      }
    }

    await setRunPhase(runId, 'certify')
    let certResult = null
    let agentResult = null
    let autopilotResult = null
    const minRecall = getPackCertMinRecall(pack)

    try {
      autopilotResult = await runMonkAutopilotCertLoop(
        workspaceId,
        pack,
        {
          runId,
          userId: opts.userId ?? null,
          requiredOk: matchResult.requiredOk,
          matchResult,
        },
      )
      certResult = autopilotResult.certResult || null
      for (const step of autopilotResult.steps || []) {
        await appendEvent(
          runId,
          workspaceId,
          'certify',
          `Autopilot · ${step.id}: ${step.message}`,
          {
            level: step.ok ? 'success' : 'warn',
            detail: step.detail || {},
          },
        )
      }
      if (certResult) {
        const recallPct = certResult.report?.goldenPairs
          ? (certResult.report.recall * 100).toFixed(1)
          : null
        await appendEvent(
          runId,
          workspaceId,
          'certify',
          certResult.passed
            ? recallPct
              ? `Autopilot certified — golden recall ${recallPct}%`
              : 'Autopilot certified — template and KPI gates passed'
            : recallPct
              ? `Autopilot cert pending — recall ${recallPct}% (need ${(minRecall * 100).toFixed(0)}%)`
              : 'Autopilot cert pending — complete required tables',
          {
            level: certResult.passed ? 'success' : 'warn',
            detail: certResult.report,
          },
        )
      }
    } catch (err) {
      await appendEvent(
        runId,
        workspaceId,
        'certify',
        `Autopilot loop failed: ${err.message || err}`,
        { level: 'warn' },
      )
    }

    if (!certResult) {
      try {
        certResult = await runPackCertificationGate(workspaceId, {
          packId: pack.id,
          runId,
          minRecall,
          requiredOk: matchResult.requiredOk,
        })
        const recallPct = certResult.report?.goldenPairs
          ? (certResult.report.recall * 100).toFixed(1)
          : null
        await appendEvent(
          runId,
          workspaceId,
          'certify',
          certResult.passed
            ? recallPct
              ? `Certified — golden recall ${recallPct}%`
              : 'Certified — template match and KPI gates passed'
            : recallPct
              ? `Certification pending — recall ${recallPct}% (need ${(minRecall * 100).toFixed(0)}%). Promote joins on /joins.`
              : 'Certification pending — complete required tables and steward review',
          { level: certResult.passed ? 'success' : 'warn', detail: certResult.report },
        )
      } catch (err) {
        await appendEvent(
          runId,
          workspaceId,
          'certify',
          `Certification check skipped: ${err.message || err}`,
          { level: 'warn' },
        )
      }
    }

    try {
      agentResult = await runMonkAgentTools(
        workspaceId,
        pack,
        matchResult,
        {
          runId,
          userId: opts.userId ?? null,
          skipGoldenEval: Boolean(certResult?.passed),
        },
      )
      for (const step of agentResult.steps || []) {
        await appendEvent(
          runId,
          workspaceId,
          'certify',
          `Agent · ${step.tool}: ${step.message}`,
          { level: step.ok ? 'success' : 'warn', detail: step.detail || {} },
        )
      }
    } catch (err) {
      await appendEvent(
        runId,
        workspaceId,
        'certify',
        `Agent loop skipped: ${err.message || err}`,
        { level: 'warn' },
      )
    }

    await appendEvent(
      runId,
      workspaceId,
      'certify',
      matchResult.requiredOk
        ? `Pack ready — open capability map and ${pack.industry} KPIs`
        : 'Certification pending — add missing tables and re-run Monk Mode',
      { level: matchResult.requiredOk ? 'success' : 'warn' },
    )

    const capability = buildCapabilityMap(
      pack,
      matchResult,
      profileResult,
      buildResult,
      certResult,
    )

    await setRunPhase(runId, 'done', {
      status: certResult && !certResult.passed && !matchResult.requiredOk
        ? 'completed'
        : 'completed',
      matchScore: matchResult.scorePct,
      capability,
      summary: {
        liveTableCount: liveTables.length,
        schemaTables: packCtx.stats.tableCount,
        match: matchResult,
        profile: profileResult,
        issuesCreated: issues.created,
        metrics: buildResult.metrics,
        jobs: buildResult.jobs,
        marts: buildResult.marts,
        dashboards: buildResult.dashboards,
        legacyJobId: buildResult.legacyJob?.id || null,
        certification: certResult?.certification || null,
        autopilot: autopilotResult,
        agent: agentResult,
        entityCount: entityMappings.length,
        policies: pack.policies || {},
      },
      completedAt: new Date(),
    })

    await appendEvent(
      runId,
      workspaceId,
      'done',
      'Monk Mode complete — review capability map and steward inbox',
      { level: 'success' },
    )

    return {
      ...(await getMonkRun(workspaceId, runId)),
      events: await listMonkEvents(runId),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await setRunPhase(runId, 'discover', {
      status: 'failed',
      errorMessage: msg,
      completedAt: new Date(),
    })
    await appendEvent(runId, workspaceId, 'discover', `Monk Mode failed: ${msg}`, {
      level: 'error',
    })
    throw err
  }
}

export async function getMonkCapabilityPreview(workspaceId, packId = 'ecommerce-v1') {
  const pack = getIndustryPack(packId)
  if (!pack) return null
  const packCtx = await buildSchemaContextPack(workspaceId)
  const matchResult = scorePackAgainstSchema(packCtx.tables, pack)
  const cert = await getLatestPackCertification(workspaceId, packId).catch(() => null)
  return buildCapabilityMap(
    pack,
    matchResult,
    { columnCount: 0 },
    { metrics: { total: cert?.kpiCount ?? 0 }, jobs: null, legacyJob: null },
    cert ? { passed: cert.status === 'passed', status: cert.status, report: cert.report } : null,
  )
}

export { getLatestPackCertification }

export { PHASES }
