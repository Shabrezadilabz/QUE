/**
 * Phase 3.7 — Executive data health scorecard (single %).
 */
import { query } from './db.js'
import { buildSchemaContextPack } from './schemaContext.js'
import { scorePackAgainstSchema } from './templateMatcher.js'
import { getIndustryPack } from './templateMatcher.js'
import { getLatestPackCertification } from './packCertification.js'
import { getStewardInboxSummary } from './stewardInbox.js'

/**
 * Compute weighted health score 0–100 (pure breakdown for tests).
 */
export function computeHealthScoreFromSignals(signals) {
  const weights = {
    connections: 15,
    schema: 15,
    packMatch: 15,
    joins: 20,
    steward: 15,
    kpis: 10,
    dashboards: 5,
    certification: 5,
  }
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)

  let points = 0
  const breakdown = []

  const add = (key, score, label, detail) => {
    const w = weights[key] || 0
    const contrib = (Math.max(0, Math.min(100, score)) / 100) * w
    points += contrib
    breakdown.push({ key, label, score: Math.round(score), weight: w, detail })
  }

  add(
    'connections',
    signals.connectionScore ?? 0,
    'Sources connected',
    signals.connectionDetail || '',
  )
  add('schema', signals.schemaScore ?? 0, 'Schema synced', signals.schemaDetail || '')
  add(
    'packMatch',
    signals.packMatchScore ?? 0,
    'Industry match',
    signals.packMatchDetail || '',
  )
  add('joins', signals.joinScore ?? 0, 'Join quality', signals.joinDetail || '')
  add(
    'steward',
    signals.stewardScore ?? 0,
    'Quality inbox',
    signals.stewardDetail || '',
  )
  add('kpis', signals.kpiScore ?? 0, 'KPI registry', signals.kpiDetail || '')
  add(
    'dashboards',
    signals.dashboardScore ?? 0,
    'Dashboards',
    signals.dashboardDetail || '',
  )
  add(
    'certification',
    signals.certScore ?? 0,
    'Certification',
    signals.certDetail || '',
  )

  const score = Math.round((points / totalWeight) * 100)
  let grade = 'needs_attention'
  if (score >= 85) grade = 'excellent'
  else if (score >= 70) grade = 'good'
  else if (score >= 50) grade = 'fair'

  return { score, grade, breakdown }
}

export async function computeHealthScorecard(workspaceId, packId = 'ecommerce-v1') {
  const pack = getIndustryPack(packId)

  const { rows: connRows } = await query(
    `SELECT COUNT(*)::int AS n FROM connections WHERE workspace_id = $1`,
    [workspaceId],
  )
  const connCount = connRows[0]?.n ?? 0
  const connectionScore = connCount > 0 ? Math.min(100, 60 + connCount * 20) : 0

  let schemaScore = 0
  let packMatchScore = 0
  let schemaDetail = 'No schema synced'
  let packMatchDetail = ''
  try {
    const packCtx = await buildSchemaContextPack(workspaceId)
    const tableCount = packCtx.stats?.tableCount ?? 0
    schemaScore = tableCount >= 10 ? 100 : tableCount >= 5 ? 75 : tableCount > 0 ? 50 : 0
    schemaDetail = `${tableCount} tables synced`
    if (pack) {
      const match = scorePackAgainstSchema(packCtx.tables, pack)
      packMatchScore = match.scorePct
      packMatchDetail = `${match.scorePct}% ${pack.industry} match`
    }
  } catch {
    /* empty workspace */
  }

  const { rows: joinRows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'accepted')::int AS promoted,
       COUNT(*) FILTER (WHERE status = 'suggested')::int AS suggested
     FROM relationships WHERE workspace_id = $1`,
    [workspaceId],
  )
  const promoted = joinRows[0]?.promoted ?? 0
  const suggested = joinRows[0]?.suggested ?? 0
  const joinDenom = promoted + suggested
  const joinScore = joinDenom > 0 ? Math.round((promoted / joinDenom) * 100) : promoted > 0 ? 80 : 20
  const joinDetail = `${promoted} promoted, ${suggested} pending`

  const inbox = await getStewardInboxSummary(workspaceId).catch(() => ({
    open: 0,
    high: 0,
    resolved: 0,
  }))
  const stewardTotal = inbox.open + inbox.resolved
  const stewardScore =
    stewardTotal === 0
      ? 100
      : Math.round((inbox.resolved / Math.max(1, stewardTotal)) * 100)
  const stewardDetail = `${inbox.open} open, ${inbox.resolved} resolved`

  const { rows: kpiRows } = await query(
    `SELECT COUNT(*)::int AS n FROM metric_definitions
     WHERE workspace_id = $1 AND tags_json @> $2::jsonb`,
    [workspaceId, JSON.stringify(['monk-mode'])],
  )
  const kpiCount = kpiRows[0]?.n ?? 0
  const kpiTarget = pack?.kpis?.length ?? 5
  const kpiScore = Math.min(100, Math.round((kpiCount / Math.max(1, kpiTarget)) * 100))

  const { rows: chartRows } = await query(
    `SELECT COUNT(*)::int AS n FROM bi_charts
     WHERE workspace_id = $1 AND config_json->>'packId' = $2`,
    [workspaceId, packId],
  )
  const chartCount = chartRows[0]?.n ?? 0
  const dashboardTarget = 5
  const dashboardScore = Math.min(
    100,
    Math.round((chartCount / dashboardTarget) * 100),
  )

  const cert = await getLatestPackCertification(workspaceId, packId).catch(() => null)
  const certScore =
    cert?.status === 'passed'
      ? 100
      : cert?.goldenRecall != null
        ? Math.round(Number(cert.goldenRecall) * 100)
        : 0
  const certDetail = cert?.status
    ? `${cert.status} · recall ${cert.goldenRecall != null ? (Number(cert.goldenRecall) * 100).toFixed(0) : '—'}%`
    : 'Not certified yet'

  const signals = {
    connectionScore,
    connectionDetail: `${connCount} source(s)`,
    schemaScore,
    schemaDetail,
    packMatchScore,
    packMatchDetail,
    joinScore,
    joinDetail,
    stewardScore,
    stewardDetail,
    kpiScore,
    kpiDetail: `${kpiCount} / ${kpiTarget} KPIs`,
    dashboardScore,
    dashboardDetail: `${chartCount} pack widgets`,
    certScore,
    certDetail,
  }

  const result = computeHealthScoreFromSignals(signals)
  return {
    ...result,
    evaluatedAt: new Date().toISOString(),
    packId,
    signals,
  }
}
