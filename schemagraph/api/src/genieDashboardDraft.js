/**
 * S6 RS-2 — Genie “dashboard draft” → editable Report Studio board.
 */
import { parseBiStyleFromPrompt, scaffoldBiReport } from './certifiedBi.js'
import { getIndustryPack } from './packs/index.js'
import {
  seedDashboardsFromPack,
  getPackDashboardTemplates,
} from './dashboardTemplates.js'
import { recordAuditEvent } from './auditLog.js'

/** Infer vertical pack from natural-language dashboard prompt. */
export function detectPackIdFromPrompt(prompt = '') {
  const g = String(prompt).toLowerCase()
  if (/\b(gst|gstr|india|itc|hsn)\b/.test(g)) return 'india-gst-v1'
  if (/\b(logistics|shipment|sla|carrier|transit)\b/.test(g)) return 'logistics-v1'
  if (/\b(saas|mrr|arr|churn|subscription|wau)\b/.test(g)) return 'saas-metrics-v1'
  if (/\b(finance|ledger|reconcil|bank.?feed)\b/.test(g)) return 'finance-v1'
  if (/\b(health|claim|hipaa|member|eligibility)\b/.test(g)) return 'healthcare-v1'
  if (/\b(manufactur|work.?order|bom|inventory|oee)\b/.test(g)) return 'manufacturing-v1'
  if (/\b(edtech|student|course|enrollment|learner)\b/.test(g)) return 'edtech-v1'
  if (/\b(attribution|campaign|touch|conversion|marketing)\b/.test(g))
    return 'marketing-attribution-v1'
  if (/\b(ecom|retail|order|brand|revenue)\b/.test(g)) return 'ecommerce-v1'
  return null
}

/**
 * Create an editable Report Studio board from Genie/chat prompt.
 * Uses pack dashboard templates when available; otherwise generic scaffold.
 */
export async function createGenieDashboardDraft(
  workspaceId,
  {
    prompt = '',
    packId = null,
    title = null,
    datasetId = null,
    userId = null,
  } = {},
) {
  const promptText = String(prompt || '').trim()
  const resolvedPackId = packId || detectPackIdFromPrompt(promptText)
  const style = parseBiStyleFromPrompt(promptText)
  const pack = resolvedPackId ? getIndustryPack(resolvedPackId) : null
  const templates = pack ? getPackDashboardTemplates(pack) : []

  if (pack && templates.length) {
    const seeded = await seedDashboardsFromPack(workspaceId, pack, {
      userId,
      certify: false,
    })
    const dash = templates[0]
    const reportId = dash.id
    const reportTitle =
      title || style.title || dash.title || `${pack.displayName} draft`

    void recordAuditEvent({
      workspaceId,
      actorUserId: userId,
      action: 'bi_report.genie_draft',
      resourceType: 'bi_report',
      resourceId: reportId,
      summary: `Genie RS-2 draft “${reportTitle}” from ${pack.id}`,
    })

    return {
      reportId,
      title: reportTitle,
      packId: pack.id,
      packName: pack.displayName,
      chartCount: (seeded.created || 0) + (seeded.updated || 0),
      charts: seeded.charts || [],
      source: 'pack-template',
      href: `/bi?report=${encodeURIComponent(reportId)}`,
      note: 'RS-2 Genie draft — edit visuals in Report Studio before certify/export',
    }
  }

  const biReport = await scaffoldBiReport(workspaceId, {
    title: title || style.title || 'Genie dashboard draft',
    prompt: promptText,
    userId,
    datasetId,
    ...style,
  })

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'bi_report.genie_draft',
    resourceType: 'bi_report',
    resourceId: biReport.reportId,
    summary: `Genie RS-2 scaffold “${biReport.title}”`,
  })

  return {
    ...biReport,
    packId: resolvedPackId,
    packName: pack?.displayName || null,
    chartCount: biReport.charts?.length || 0,
    source: 'scaffold',
    href: `/bi?report=${encodeURIComponent(biReport.reportId)}`,
    note:
      biReport.note ||
      'RS-2 Genie draft — edit visuals in Report Studio before certify/export',
  }
}
