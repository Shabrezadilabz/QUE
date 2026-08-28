/**
 * Phase 3.3 — Page autofill aggregator (nav + per-page readiness).
 */
import { query } from './db.js'
import { buildSchemaContextPack } from './schemaContext.js'
import { scorePackAgainstSchema, getIndustryPack, rankPacksForWorkspace } from './templateMatcher.js'
import { getLatestPackCertification } from './packCertification.js'
import { getStewardInboxSummary } from './stewardInbox.js'
import { computeHealthScorecard } from './healthScorecard.js'
import { getMonkCapabilityPreview } from './monkMode.js'
import {
  fetchPlatformModuleSignals,
  buildPlatformModulePages,
} from './platform/platformModuleSignals.js'

function statusFrom(score, hasData) {
  if (!hasData) return 'empty'
  if (score >= 80) return 'ready'
  if (score >= 40) return 'review'
  return 'unavailable'
}

/**
 * @param {string} workspaceId
 * @param {string|null} [pageId]
 */
export async function getPageAutofill(workspaceId, pageId = null) {
  let packCtx = { tables: [], stats: {} }
  try {
    packCtx = await buildSchemaContextPack(workspaceId)
  } catch {
    /* ok */
  }
  const ranked = rankPacksForWorkspace(packCtx.tables || [])
  const best = ranked[0]
  const packId = best?.pack?.id || 'ecommerce-v1'
  const pack = getIndustryPack(packId)
  const health = await computeHealthScorecard(workspaceId, packId)

  const match = best || (pack ? scorePackAgainstSchema(packCtx.tables, pack) : null)
  const cert = await getLatestPackCertification(workspaceId, packId).catch(() => null)
  const inbox = await getStewardInboxSummary(workspaceId).catch(() => ({
    open: 0,
    high: 0,
    resolved: 0,
  }))
  const capability = await getMonkCapabilityPreview(workspaceId, packId).catch(() => null)

  const { rows: jobRows } = await query(
    `SELECT COUNT(*)::int AS n FROM jobs
     WHERE workspace_id = $1 AND title LIKE '[Monk]%'`,
    [workspaceId],
  )
  const monkJobs = jobRows[0]?.n ?? 0

  const { rows: matRows } = await query(
    `SELECT COUNT(*)::int AS n FROM job_materializations
     WHERE workspace_id = $1 AND status = 'planned'`,
    [workspaceId],
  )
  const plannedMarts = matRows[0]?.n ?? 0

  const { rows: kpiRows } = await query(
    `SELECT COUNT(*)::int AS n FROM metric_definitions
     WHERE workspace_id = $1 AND tags_json @> $2::jsonb`,
    [workspaceId, JSON.stringify(['monk-mode'])],
  )
  const kpiCount = kpiRows[0]?.n ?? 0

  const { rows: chartRows } = await query(
    `SELECT COUNT(*)::int AS n FROM bi_charts
     WHERE workspace_id = $1 AND config_json->>'packId' = $2`,
    [workspaceId, packId],
  )
  const dashboardWidgets = chartRows[0]?.n ?? 0

  const { rows: runRows } = await query(
    `SELECT status, phase FROM monk_mode_runs
     WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  )
  const lastMonkRun = runRows[0] || null

  const pages = {
    workspace: {
      status: statusFrom(health.score, packCtx.stats?.tableCount > 0),
      headline: `${health.score}% data health`,
      hints: [
        match ? `${match.scorePct}% ${pack?.industry || 'Ecommerce'} match` : null,
        `${packCtx.stats?.tableCount ?? 0} tables in graph`,
      ].filter(Boolean),
      href: '/monk',
      cta: health.score < 70 ? 'Run Monk Mode' : 'View capability map',
    },
    sources: {
      status: statusFrom(health.signals.connectionScore, health.signals.connectionScore > 0),
      headline: health.signals.connectionDetail,
      hints: [health.signals.schemaDetail, health.signals.packMatchDetail].filter(Boolean),
      href: '/sources',
      cta: 'Sync sources',
    },
    joins: {
      status: statusFrom(health.signals.joinScore, true),
      headline: health.signals.joinDetail,
      hints: cert ? [`Golden recall ${cert.goldenRecall != null ? (Number(cert.goldenRecall) * 100).toFixed(0) : '—'}%`] : ['Promote joins for certification'],
      href: '/joins',
      cta: 'Review joins',
    },
    jobs: {
      status: monkJobs > 0 ? (plannedMarts ? 'review' : 'ready') : 'empty',
      headline: monkJobs ? `${monkJobs} Monk jobs` : 'No pack jobs yet',
      hints: plannedMarts ? [`${plannedMarts} mart(s) planned — confirm materialize`] : [],
      href: '/jobs',
      cta: plannedMarts ? 'Materialize marts' : 'Open jobs',
    },
    metrics: {
      status: statusFrom(health.signals.kpiScore, kpiCount > 0),
      headline: health.signals.kpiDetail,
      hints: ['KPIs from Monk Mode pack'],
      href: '/metrics',
      cta: kpiCount ? 'View KPIs' : 'Seed from Monk Mode',
    },
    bi: {
      status: statusFrom(health.signals.dashboardScore, dashboardWidgets > 0),
      headline: dashboardWidgets
        ? `${dashboardWidgets} CEO dashboard widgets`
        : 'No pack dashboards',
      hints: ['Revenue by brand · order count · AOV'],
      href: '/bi?report=ceo-revenue',
      cta: dashboardWidgets ? 'Open CEO dashboard' : 'Run Monk Mode',
    },
    chat: {
      status: match?.requiredOk ? 'ready' : 'review',
      headline: match?.requiredOk ? 'CEO revenue chat ready' : 'Connect orders + brands',
      hints: pack?.kpis?.slice(0, 3).map((k) => k.ceoQuestion) || [],
      href: '/chat',
      cta: 'Ask a KPI question',
    },
    steward: {
      status: inbox.open ? 'review' : 'ready',
      headline: `${inbox.open} open quality issues`,
      hints: [`${inbox.high} high severity`],
      href: '/steward',
      cta: 'Review inbox',
    },
    eval: {
      status: cert?.status === 'passed' ? 'ready' : 'review',
      headline: cert?.status ? `Cert: ${cert.status}` : 'Golden eval not run',
      hints: [health.signals.certDetail],
      href: '/eval',
      cta: 'Run golden eval',
    },
    monk: {
      status: lastMonkRun?.status === 'completed' ? 'ready' : lastMonkRun ? 'review' : 'empty',
      headline: lastMonkRun
        ? `Last run: ${lastMonkRun.phase} (${lastMonkRun.status})`
        : 'Monk Mode not started',
      hints: capability?.ready?.slice(0, 3).map((c) => c.label) || [],
      href: '/monk',
      cta: 'Enter Monk Mode',
    },
  }

  const platformSignals = await fetchPlatformModuleSignals(workspaceId)
  Object.assign(pages, buildPlatformModulePages(platformSignals, health))

  const globalSummary = {
    healthScore: health.score,
    healthGrade: health.grade,
    packMatchPct: match?.scorePct ?? null,
    recommendedPackId: packId,
    recommendedPackName: pack?.displayName || null,
    rankedPacks: ranked.slice(0, 4).map((r) => ({
      id: r.pack.id,
      name: r.pack.displayName,
      scorePct: r.scorePct,
      canRunMonk: r.canRunMonk,
    })),
    kpiCount,
    dashboardWidgets,
    monkJobs,
    plannedMarts,
    stewardOpen: inbox.open,
    certificationStatus: cert?.status ?? null,
    lastMonkRun: lastMonkRun
      ? { status: lastMonkRun.status, phase: lastMonkRun.phase }
      : null,
  }

  if (pageId && pages[pageId]) {
    return { page: pages[pageId], global: globalSummary, health }
  }

  return { pages, global: globalSummary, health, capability }
}
