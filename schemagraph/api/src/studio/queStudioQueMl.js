/**
 * Phase 4 / Studio v3 — QueML semantic layer for a Report Studio board.
 */
import { listBiCharts } from '../certifiedBi.js'
import { listMetrics } from '../metricDefinitions.js'

function yamlEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
}

/**
 * Build QueML YAML for board dimensions/measures + certified metrics.
 * @param {object} input
 */
export function buildQueMlYaml(input = {}) {
  const reportId = input.reportId || 'sportedge-exec'
  const dimensions = input.dimensions || []
  const measures = input.measures || []
  const metrics = input.metrics || []

  const lines = [
    '# QueML — Que semantic layer (board-scoped)',
    `version: 1`,
    `report_id: ${reportId}`,
    `generated_at: ${new Date().toISOString()}`,
    '',
    'semantic_model:',
    `  name: ${reportId.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    '  dimensions:',
    ...(dimensions.length
      ? dimensions.map(
          (d) =>
            `    - name: ${d.name}\n      label: "${yamlEscape(d.chart || d.name)}"\n      type: string`,
        )
      : ['    []']),
    '  measures:',
    ...(measures.length
      ? measures.map(
          (m) =>
            `    - name: ${m.name}\n      label: "${yamlEscape(m.chart || m.name)}"\n      agg: ${m.agg || 'sum'}`,
        )
      : ['    []']),
    '',
    'metrics:',
    ...(metrics.length
      ? metrics.map(
          (m) =>
            `  - name: ${m.slug || m.name}\n    label: "${yamlEscape(m.name)}"\n    expr: "${yamlEscape(m.expressionSql || 'COUNT(*)')}"\n    certified: ${Boolean(m.certified)}`,
        )
      : ['  []']),
  ]
  return lines.join('\n')
}

/**
 * @param {string} workspaceId
 * @param {string} [reportId]
 */
export async function buildQueMlForReport(workspaceId, reportId = 'sportedge-exec') {
  const [charts, metrics] = await Promise.all([
    listBiCharts(workspaceId).catch(() => []),
    listMetrics(workspaceId).catch(() => []),
  ])

  const reportCharts = charts.filter(
    (c) => String(c.config?.reportId || c.config?.dashboardId || '') === reportId,
  )

  const dimSet = new Map()
  const measureSet = new Map()
  for (const c of reportCharts) {
    const cfg = c.config || {}
    if (cfg.xField) {
      dimSet.set(String(cfg.xField), {
        name: String(cfg.xField),
        chart: c.title,
      })
    }
    if (cfg.yField) {
      measureSet.set(String(cfg.yField), {
        name: String(cfg.yField),
        chart: c.title,
        agg: 'sum',
      })
    }
  }

  const boardMetrics = metrics
    .filter((m) => m.certified)
    .slice(0, 16)

  const warehouseBound = reportCharts.filter(
    (c) =>
      Boolean(c.config?.sqlFallback || c.config?.warehouseSql) || Boolean(c.datasetId),
  ).length

  const yaml = buildQueMlYaml({
    reportId,
    dimensions: [...dimSet.values()],
    measures: [...measureSet.values()],
    metrics: boardMetrics,
  })

  return {
    reportId,
    format: 'que-ml-v1',
    chartCount: reportCharts.length,
    warehouseBound,
    warehouseUnbound: reportCharts.length - warehouseBound,
    dimensionCount: dimSet.size,
    measureCount: measureSet.size,
    metricCount: boardMetrics.length,
    yaml,
    charts: reportCharts.slice(0, 12).map((c) => ({
      id: c.id,
      title: c.title,
      chartType: c.chartType,
      certified: c.certified,
      hasWarehouseSql: Boolean(
        c.config?.sqlFallback || c.config?.warehouseSql || c.datasetId,
      ),
    })),
  }
}
