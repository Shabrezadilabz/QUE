/**
 * Phase 4 — BI Studio hub: warehouse-bound widgets, metrics, grid, certification.
 */
import { listBiCharts } from '../certifiedBi.js'
import { query } from '../db.js'
import { listGridExploreTables } from './gridExplore.js'

/**
 * @param {object} input
 */
export function summarizeStudioReadiness(input = {}) {
  const chartCount = input.chartCount ?? 0
  const certifiedCharts = input.certifiedCharts ?? 0
  const metricCount = input.metricCount ?? 0
  const warehouseWidgets = input.warehouseWidgets ?? 0
  const gridTables = input.gridTables ?? 0
  const kpiWidgets = input.kpiWidgets ?? 0

  let status = 'empty'
  if (chartCount >= 3 && certifiedCharts >= 1 && warehouseWidgets > 0) {
    status = 'ready'
  } else if (chartCount > 0 || metricCount > 0 || gridTables > 0) {
    status = 'review'
  }

  return {
    status,
    chartCount,
    certifiedCharts,
    metricCount,
    warehouseWidgets,
    gridTables,
    kpiWidgets,
    liveMetricHover: true,
    label:
      status === 'ready'
        ? 'Studio ready — live warehouse charts'
        : chartCount > 0
          ? 'Add certified widgets + warehouse SQL'
          : gridTables > 0
            ? 'Seed boards from grid explore'
            : 'Open grid or scaffold a board',
  }
}

/**
 * @param {string} workspaceId
 */
export async function buildStudioSummary(workspaceId) {
  const [charts, metricRow, gridTables] = await Promise.all([
    listBiCharts(workspaceId).catch(() => []),
    query(
      `SELECT COUNT(*)::int AS n FROM metric_definitions WHERE workspace_id = $1`,
      [workspaceId],
    ).catch(() => ({ rows: [{ n: 0 }] })),
    listGridExploreTables(workspaceId, { describe: false }).catch(() => []),
  ])

  const certifiedCharts = charts.filter((c) => c.certified).length
  const warehouseWidgets = charts.filter((c) => {
    const cfg = c.config || {}
    return Boolean(
      cfg.sqlFallback ||
        cfg.warehouseSql ||
        c.datasetId ||
        c.chartType === 'kpi' ||
        c.chartType === 'card',
    )
  }).length
  const kpiWidgets = charts.filter(
    (c) => c.chartType === 'kpi' || c.chartType === 'card',
  ).length

  const readiness = summarizeStudioReadiness({
    chartCount: charts.length,
    certifiedCharts,
    metricCount: metricRow.rows[0]?.n ?? 0,
    warehouseWidgets,
    gridTables: gridTables.length,
    kpiWidgets,
  })

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    readiness,
    charts: charts.slice(0, 12).map((c) => ({
      id: c.id,
      title: c.title,
      chartType: c.chartType,
      certified: c.certified,
      hasSql: Boolean(c.config?.sqlFallback || c.config?.warehouseSql),
    })),
    gridTableCount: gridTables.length,
    features: {
      metricLiveHover: true,
      boardFilters: true,
      drillToSql: true,
      gridExplore: true,
      runInWarehouse: true,
      warehouseOnlyPreview: true,
      canvasDragResize: true,
      sessionCacheSec: '30–120',
    },
    routes: {
      board: '/bi',
      grid: '/studio/grid',
      metrics: '/metrics',
    },
  }
}
