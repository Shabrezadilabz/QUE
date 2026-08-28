/**
 * S3 — Steward cert checklist (joins, transforms, golden eval, BI).
 */
import { listJoinReviews } from './joinReviews.js'
import { listTransformDrafts } from './transformDrafts.js'
import { getLatestPackCertification } from './packCertification.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { listBiCharts } from './certifiedBi.js'
import { listMetrics } from './metricDefinitions.js'
import { getPackCertMinRecall } from './packPolicies.js'
import { getIndustryPack } from './packs/index.js'

/**
 * @param {string} workspaceId
 * @param {{ packId?: string }} [opts]
 */
export async function getCertChecklist(workspaceId, opts = {}) {
  const packId = opts.packId || 'ecommerce-v1'
  const pack = getIndustryPack(packId)
  const minRecall = getPackCertMinRecall(pack || { id: packId })

  const inbox = await listJoinReviews(workspaceId, { status: 'suggested', limit: 1 })
  const pendingJoins = inbox.summary?.pending ?? inbox.items?.length ?? 0

  let pendingTransforms = 0
  try {
    const drafts = await listTransformDrafts(workspaceId, { status: 'pending' })
    pendingTransforms = drafts.length
  } catch {
    pendingTransforms = 0
  }

  const cert = await getLatestPackCertification(workspaceId, packId).catch(() => null)
  const ws = await getWorkspaceSettings(workspaceId)
  const lastGolden = ws?.settings?.lastGoldenEval || null
  const goldenRecall =
    cert?.goldenRecall ??
    (lastGolden?.recall != null ? Number(lastGolden.recall) : null)
  const goldenPass =
    cert?.status === 'passed' ||
    (goldenRecall != null && goldenRecall >= minRecall)

  const metrics = await listMetrics(workspaceId).catch(() => [])
  const monkMetrics = metrics.filter((m) =>
    (m.tags || []).includes('monk-mode') || (m.tags || []).includes('pack'),
  )
  const metricsCertified = monkMetrics.filter((m) => m.certified).length

  const charts = await listBiCharts(workspaceId).catch(() => [])
  const packCharts = charts.filter(
    (c) => c.config?.packId === packId || c.config?.reportId === 'ceo-revenue',
  )
  const biChartsCertified = packCharts.filter((c) => c.certified).length

  const items = [
    {
      id: 'joins',
      label: 'Joins reviewed',
      ok: pendingJoins === 0,
      detail:
        pendingJoins === 0
          ? 'No pending join suggestions'
          : `${pendingJoins} join(s) awaiting promote/reject`,
      href: '/joins',
    },
    {
      id: 'transforms',
      label: 'Transforms approved',
      ok: pendingTransforms === 0,
      detail:
        pendingTransforms === 0
          ? 'No pending transform drafts'
          : `${pendingTransforms} draft(s) awaiting approval`,
      href: '/transforms',
    },
    {
      id: 'golden',
      label: 'Golden eval pass',
      ok: goldenPass,
      detail:
        goldenRecall != null
          ? `Recall ${(goldenRecall * 100).toFixed(1)}% (need ${(minRecall * 100).toFixed(0)}%)`
          : 'Run certify to evaluate golden pairs',
      href: '/validation',
    },
    {
      id: 'metrics',
      label: 'KPI metrics certified',
      ok: metricsCertified > 0 || monkMetrics.length === 0,
      detail:
        monkMetrics.length === 0
          ? 'No pack metrics yet'
          : `${metricsCertified}/${monkMetrics.length} certified`,
      href: '/metrics',
    },
    {
      id: 'bi',
      label: 'Report Studio charts',
      ok: biChartsCertified >= 3 || packCharts.length === 0,
      detail:
        packCharts.length === 0
          ? 'Charts seed on Monk build'
          : `${biChartsCertified}/${packCharts.length} certified (target ≥3)`,
      href: '/bi?report=ceo-revenue',
    },
  ]

  const allGreen = items.every((i) => i.ok)

  return {
    packId,
    allGreen,
    canShipToBi: allGreen && cert?.status === 'passed',
    certification: cert,
    goldenRecall,
    minRecall,
    items,
  }
}
