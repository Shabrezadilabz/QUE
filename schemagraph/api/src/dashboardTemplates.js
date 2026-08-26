/**
 * Phase 3.2 — Pack dashboard templates → BI charts bound to KPIs / marts.
 */
import { query } from './db.js'
import { createBiChart } from './certifiedBi.js'
import { listManagedDatasets } from './managedDataPlane.js'
import { recordAuditEvent } from './auditLog.js'

/** Ecommerce CEO dashboard widget specs (bind to KPI ids). */
export const ECOMMERCE_CEO_DASHBOARD = {
  id: 'ceo-revenue',
  title: 'CEO Revenue Dashboard',
  audience: 'CEO',
  widgets: [
    {
      id: 'total_revenue_kpi',
      title: 'Total revenue',
      chartType: 'kpi',
      kpiId: 'revenue_by_brand',
      layout: { col: 0, row: 0, w: 4, h: 2 },
      config: { yField: 'revenue', aggregate: 'sum' },
    },
    {
      id: 'order_count_kpi',
      title: 'Order count',
      chartType: 'kpi',
      kpiId: 'order_count',
      layout: { col: 4, row: 0, w: 4, h: 2 },
      config: { yField: 'order_count' },
    },
    {
      id: 'aov_kpi',
      title: 'Average order value',
      chartType: 'kpi',
      kpiId: 'aov',
      layout: { col: 8, row: 0, w: 4, h: 2 },
      config: { yField: 'average_order_value' },
    },
    {
      id: 'revenue_by_brand_bar',
      title: 'Revenue by brand',
      chartType: 'bar',
      kpiId: 'revenue_by_brand',
      layout: { col: 0, row: 2, w: 8, h: 4 },
      config: { xField: 'brand', yField: 'revenue' },
    },
    {
      id: 'top_products_table',
      title: 'Top products',
      chartType: 'table',
      kpiId: 'top_skus',
      layout: { col: 8, row: 2, w: 4, h: 4 },
      config: { xField: 'product', yField: 'revenue' },
    },
  ],
}

export function getPackDashboardTemplates(pack) {
  if (!pack) return []
  if (pack.dashboards?.length) return pack.dashboards
  if (pack.id === 'ecommerce-v1') return [ECOMMERCE_CEO_DASHBOARD]
  return []
}

async function findMetricByKpiId(workspaceId, packId, kpiId) {
  const slug = `pack-${packId}-${kpiId}`
  const { rows } = await query(
    `SELECT id, name, expression_sql FROM metric_definitions
     WHERE workspace_id = $1 AND slug = $2`,
    [workspaceId, slug],
  )
  return rows[0] || null
}

/**
 * Seed BI charts from pack dashboard templates (idempotent by pack+widget id).
 */
export async function seedDashboardsFromPack(
  workspaceId,
  pack,
  opts = {},
) {
  const templates = getPackDashboardTemplates(pack)
  if (!templates.length) {
    return { created: 0, updated: 0, charts: [], skipped: true }
  }

  const datasets = await listManagedDatasets(workspaceId)
  const martDataset =
    datasets.find((d) => d.slug?.includes('brand-revenue')) ||
    datasets.find((d) => d.name?.toLowerCase().includes('brand')) ||
    datasets[0] ||
    null

  const reportId = dash.id
  const created = []
  const updated = []

  for (const dash of templates) {
    for (const widget of dash.widgets || []) {
      const chartKey = `pack-${pack.id}-${dash.id}-${widget.id}`
      const { rows: existing } = await query(
        `SELECT id FROM bi_charts
         WHERE workspace_id = $1 AND config_json->>'packChartKey' = $2`,
        [workspaceId, chartKey],
      )

      const metric = await findMetricByKpiId(workspaceId, pack.id, widget.kpiId)
      const config = {
        ...(widget.config || {}),
        packChartKey: chartKey,
        packId: pack.id,
        dashboardId: dash.id,
        widgetId: widget.id,
        metricId: metric?.id || null,
        kpiId: widget.kpiId,
        reportId,
        pageId: 'page1',
        layout: widget.layout,
        sqlFallback: metric?.expression_sql || null,
      }

      if (existing[0]) {
        await query(
          `UPDATE bi_charts SET
             title = $3, chart_type = $4, config_json = $5::jsonb,
             dataset_id = COALESCE($6, dataset_id), updated_at = now()
           WHERE workspace_id = $1 AND id = $2`,
          [
            workspaceId,
            existing[0].id,
            widget.title,
            widget.chartType,
            JSON.stringify(config),
            martDataset?.id || null,
          ],
        )
        updated.push(existing[0].id)
        continue
      }

      const chart = await createBiChart(workspaceId, {
        title: widget.title,
        description: `${dash.title} · ${pack.displayName}`,
        chartType: widget.chartType,
        datasetId: martDataset?.id || null,
        config,
        certify: false,
        userId: opts.userId ?? null,
      })
      created.push(chart.id)
    }
  }

  if (created.length) {
    void recordAuditEvent({
      workspaceId,
      actorUserId: opts.userId ?? null,
      action: 'bi_dashboard.seed_pack',
      resourceType: 'bi_report',
      resourceId: reportId,
      summary: `Seeded ${created.length} dashboard widgets from ${pack.displayName}`,
    })
  }

  return {
    created: created.length,
    updated: updated.length,
    reportId,
    dashboardIds: templates.map((t) => t.id),
    charts: [...created, ...updated],
    skipped: false,
  }
}
