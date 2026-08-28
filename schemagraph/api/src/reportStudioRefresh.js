/**
 * Sprint 10 — Report Studio RS-5: board layouts, parameters, refresh webhook.
 */
import { getWorkspaceSettings, patchWorkspaceSettingsJson } from './workspaceSettings.js'
import { listBiCharts } from './certifiedBi.js'
import { recordAuditEvent } from './auditLog.js'

export const BOARD_LAYOUT_PRESETS = {
  executive: {
    id: 'executive',
    label: 'Executive 5-tile',
    columns: 12,
    description: '3 KPIs top row + bar + table',
  },
  ops: {
    id: 'ops',
    label: 'Ops wide + detail',
    columns: 12,
    description: 'Full-width trend + side KPI stack',
  },
  mobile: {
    id: 'mobile',
    label: 'Mobile stack',
    columns: 4,
    description: 'Single-column stack for embed',
  },
}

export function defaultBoardParameters() {
  return [
    {
      id: 'date_range',
      label: 'Date range',
      type: 'string',
      defaultValue: 'last_30d',
      bindField: 'order_date',
    },
    {
      id: 'brand',
      label: 'Brand',
      type: 'string',
      defaultValue: '',
      bindField: 'brand',
    },
  ]
}

export async function getReportBoardConfig(workspaceId, reportId = 'sportedge-exec') {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const boards = settings.reportBoards || {}
  const board = boards[reportId] || {}
  return {
    reportId,
    layoutPreset: board.layoutPreset || 'executive',
    parameters: board.parameters || defaultBoardParameters(),
    refreshWebhookUrl: board.refreshWebhookUrl || settings.biRefreshWebhookUrl || '',
    refreshOnJobComplete: board.refreshOnJobComplete !== false,
    lastRefreshAt: board.lastRefreshAt || null,
    presets: Object.values(BOARD_LAYOUT_PRESETS),
  }
}

export async function updateReportBoardConfig(workspaceId, reportId, patch = {}, userId = null) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const boards = { ...(settings.reportBoards || {}) }
  const cur = boards[reportId] || {}
  boards[reportId] = {
    ...cur,
    ...(patch.layoutPreset ? { layoutPreset: patch.layoutPreset } : {}),
    ...(Array.isArray(patch.parameters) ? { parameters: patch.parameters } : {}),
    ...(patch.refreshWebhookUrl != null
      ? { refreshWebhookUrl: String(patch.refreshWebhookUrl).slice(0, 500) }
      : {}),
    ...(patch.refreshOnJobComplete != null
      ? { refreshOnJobComplete: Boolean(patch.refreshOnJobComplete) }
      : {}),
    updatedAt: new Date().toISOString(),
  }
  await patchWorkspaceSettingsJson(workspaceId, { reportBoards: boards })
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'bi.board_config_update',
    resourceType: 'bi_report',
    resourceId: reportId,
    summary: `Report board config updated — ${reportId}`,
  })
  return getReportBoardConfig(workspaceId, reportId)
}

/** Apply parameter defaults to filter context (pure). */
export function applyBoardParameterDefaults(parameters = [], overrides = {}) {
  const out = {}
  for (const p of parameters) {
    const key = p.bindField || p.id
    out[key] = overrides[p.id] ?? overrides[key] ?? p.defaultValue ?? ''
  }
  return out
}

export async function triggerReportStudioRefresh(
  workspaceId,
  reportId,
  trigger = {},
) {
  const config = await getReportBoardConfig(workspaceId, reportId)
  const url = String(config.refreshWebhookUrl || '').trim()
  if (!url.startsWith('http')) {
    return { skipped: true, reason: 'no_webhook_url' }
  }

  const charts = await listBiCharts(workspaceId)
  const reportCharts = charts.filter(
    (c) => String(c.config?.reportId || '') === reportId,
  )

  const body = {
    event: 'que.report_studio.refresh',
    workspaceId,
    reportId,
    chartCount: reportCharts.length,
    layoutPreset: config.layoutPreset,
    parameters: applyBoardParameterDefaults(config.parameters, trigger.parameters),
    jobId: trigger.jobId || null,
    runId: trigger.runId || null,
    runStatus: trigger.status || 'succeeded',
    at: new Date().toISOString(),
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    })
    const boards = (await getWorkspaceSettings(workspaceId))?.settings?.reportBoards || {}
    await patchWorkspaceSettingsJson(workspaceId, {
      reportBoards: {
        ...boards,
        [reportId]: {
          ...(boards[reportId] || {}),
          lastRefreshAt: new Date().toISOString(),
        },
      },
    })
    return { ok: res.ok, status: res.status, skipped: false, body }
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: String(err.message || err).slice(0, 300),
    }
  }
}

/** Called after job run succeeds — refresh boards that opt in. */
export async function onJobRunCompleteRefreshBoards(workspaceId, jobRun = {}) {
  if (jobRun.status !== 'succeeded' && jobRun.status !== 'completed') {
    return { refreshed: [] }
  }
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const boards = settings.reportBoards || {}
  const refreshed = []
  for (const [reportId, cfg] of Object.entries(boards)) {
    if (cfg?.refreshOnJobComplete === false) continue
    const out = await triggerReportStudioRefresh(workspaceId, reportId, {
      jobId: jobRun.jobId,
      runId: jobRun.runId || jobRun.id,
      status: jobRun.status,
    })
    if (!out.skipped) refreshed.push({ reportId, ...out })
  }
  return { refreshed }
}

/**
 * Phase 4.4 — apply layout preset to all charts in a report board.
 * @param {string} workspaceId
 * @param {string} reportId
 * @param {string} presetId
 * @param {string|null} userId
 */
export async function applyReportBoardLayout(
  workspaceId,
  reportId,
  presetId = 'executive',
  userId = null,
) {
  const { buildLayoutPatches } = await import('./studio/layoutPresets.js')
  const { updateBiChart } = await import('./certifiedBi.js')
  const charts = await listBiCharts(workspaceId)
  const reportCharts = charts.filter(
    (c) => String(c.config?.reportId || '') === reportId,
  )
  if (!reportCharts.length) {
    const err = new Error('No charts found for this report')
    err.status = 404
    throw err
  }
  const patches = buildLayoutPatches(reportCharts, presetId)
  const updated = []
  for (const p of patches) {
    const chart = reportCharts.find((c) => c.id === p.chartId)
    if (!chart) continue
    await updateBiChart(
      workspaceId,
      p.chartId,
      {
        config: {
          ...chart.config,
          layout: p.layout,
        },
      },
      userId,
    )
    updated.push({ chartId: p.chartId, layout: p.layout })
  }
  await updateReportBoardConfig(workspaceId, reportId, { layoutPreset: presetId }, userId)
  return {
    reportId,
    presetId,
    updatedCount: updated.length,
    charts: updated,
  }
}
