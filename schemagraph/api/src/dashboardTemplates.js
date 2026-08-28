/**
 * Phase 3.2 — Pack dashboard templates → BI charts bound to KPIs / marts.
 */
import { query } from './db.js'
import { createBiChart, updateBiChart } from './certifiedBi.js'
import { listManagedDatasets } from './managedDataPlane.js'
import { recordAuditEvent } from './auditLog.js'

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

export const FINANCE_CEO_DASHBOARD = {
  id: 'finance-recon',
  title: 'Finance Reconciliation Board',
  audience: 'CFO',
  widgets: [
    {
      id: 'unmatched_kpi',
      title: 'Unmatched ledger %',
      chartType: 'kpi',
      kpiId: 'unmatched_pct',
      layout: { col: 0, row: 0, w: 4, h: 2 },
      config: { yField: 'unmatched_pct' },
    },
    {
      id: 'variance_kpi',
      title: 'Total variance',
      chartType: 'kpi',
      kpiId: 'variance_total',
      layout: { col: 4, row: 0, w: 4, h: 2 },
      config: { yField: 'variance_total' },
    },
    {
      id: 'tie_out_kpi',
      title: 'Tie-out pass rate',
      chartType: 'kpi',
      kpiId: 'tie_out_status',
      layout: { col: 8, row: 0, w: 4, h: 2 },
      config: { yField: 'tied_out_entities' },
    },
    {
      id: 'unmatched_bar',
      title: 'Unmatched by entity',
      chartType: 'bar',
      kpiId: 'unmatched_pct',
      layout: { col: 0, row: 2, w: 8, h: 4 },
      config: { xField: 'entity', yField: 'unmatched_pct' },
    },
    {
      id: 'unmatched_table',
      title: 'Unmatched ledger lines',
      chartType: 'table',
      kpiId: 'unmatched_pct',
      layout: { col: 8, row: 2, w: 4, h: 4 },
      config: { xField: 'external_ref', yField: 'amount' },
    },
  ],
}

export const LOGISTICS_SLA_DASHBOARD = {
  id: 'logistics-sla',
  title: 'Logistics SLA Dashboard',
  audience: 'Ops',
  widgets: [
    {
      id: 'on_time_kpi',
      title: 'On-time delivery %',
      chartType: 'kpi',
      kpiId: 'on_time_pct',
      layout: { col: 0, row: 0, w: 4, h: 2 },
      config: { yField: 'on_time_pct' },
    },
    {
      id: 'late_kpi',
      title: 'Late shipments',
      chartType: 'kpi',
      kpiId: 'late_shipments',
      layout: { col: 4, row: 0, w: 4, h: 2 },
      config: { yField: 'late_shipments' },
    },
    {
      id: 'transit_kpi',
      title: 'Avg transit days',
      chartType: 'kpi',
      kpiId: 'avg_transit_days',
      layout: { col: 8, row: 0, w: 4, h: 2 },
      config: { yField: 'avg_transit_days' },
    },
    {
      id: 'late_bar',
      title: 'Late by carrier',
      chartType: 'bar',
      kpiId: 'late_shipments',
      layout: { col: 0, row: 2, w: 8, h: 4 },
      config: { xField: 'carrier', yField: 'late_shipments' },
    },
    {
      id: 'sla_table',
      title: 'Late shipment detail',
      chartType: 'table',
      kpiId: 'late_shipments',
      layout: { col: 8, row: 2, w: 4, h: 4 },
      config: { xField: 'shipment_id', yField: 'promised_at' },
    },
  ],
}

/** RS-3 — SportEdge exec board (5 visuals from certified mart). */
export const SPORTEDGE_EXEC_DASHBOARD = {
  id: 'sportedge-exec',
  title: 'SportEdge Executive Board',
  audience: 'CEO',
  widgets: [
    {
      id: 'gmv_kpi',
      title: 'GMV (INR)',
      chartType: 'kpi',
      kpiId: 'revenue_by_brand',
      layout: { col: 0, row: 0, w: 4, h: 2 },
      config: { yField: 'revenue', aggregate: 'sum' },
    },
    {
      id: 'orders_kpi',
      title: 'Orders',
      chartType: 'kpi',
      kpiId: 'order_count',
      layout: { col: 4, row: 0, w: 4, h: 2 },
      config: { yField: 'order_count' },
    },
    {
      id: 'aov_kpi',
      title: 'AOV',
      chartType: 'kpi',
      kpiId: 'aov',
      layout: { col: 8, row: 0, w: 4, h: 2 },
      config: { yField: 'average_order_value' },
    },
    {
      id: 'brand_bar',
      title: 'Revenue by brand',
      chartType: 'bar',
      kpiId: 'revenue_by_brand',
      layout: { col: 0, row: 2, w: 8, h: 4 },
      config: { xField: 'brand', yField: 'revenue' },
    },
    {
      id: 'sku_table',
      title: 'Top SKUs',
      chartType: 'table',
      kpiId: 'top_skus',
      layout: { col: 8, row: 2, w: 4, h: 4 },
      config: { xField: 'sku', yField: 'revenue' },
    },
  ],
}

export const SAAS_METRICS_DASHBOARD = {
  id: 'saas-metrics',
  title: 'SaaS Metrics Board',
  audience: 'CEO',
  widgets: [
    {
      id: 'mrr_kpi',
      title: 'MRR',
      chartType: 'kpi',
      kpiId: 'mrr',
      layout: { col: 0, row: 0, w: 4, h: 2 },
      config: { yField: 'mrr' },
    },
    {
      id: 'wau_kpi',
      title: 'Weekly active accounts',
      chartType: 'kpi',
      kpiId: 'wau',
      layout: { col: 4, row: 0, w: 4, h: 2 },
      config: { yField: 'wau' },
    },
    {
      id: 'churn_kpi',
      title: 'Churn rate',
      chartType: 'kpi',
      kpiId: 'churn_rate',
      layout: { col: 8, row: 0, w: 4, h: 2 },
      config: { yField: 'churn_pct' },
    },
    {
      id: 'wau_bar',
      title: 'Events by account',
      chartType: 'bar',
      kpiId: 'wau',
      layout: { col: 0, row: 2, w: 8, h: 4 },
      config: { xField: 'account', yField: 'events_7d' },
    },
    {
      id: 'mrr_table',
      title: 'Subscription detail',
      chartType: 'table',
      kpiId: 'mrr',
      layout: { col: 8, row: 2, w: 4, h: 4 },
      config: { xField: 'account_id', yField: 'mrr_amount' },
    },
  ],
}

export function getPackDashboardTemplates(pack) {
  if (!pack) return []
  if (pack.dashboards?.length) {
    const byId = {
      'ceo-revenue': ECOMMERCE_CEO_DASHBOARD,
      'finance-recon': FINANCE_CEO_DASHBOARD,
      'logistics-sla': LOGISTICS_SLA_DASHBOARD,
      'saas-metrics': SAAS_METRICS_DASHBOARD,
      'sportedge-exec': SPORTEDGE_EXEC_DASHBOARD,
    }
    return pack.dashboards
      .map((d) => byId[d.id] || { ...d, widgets: d.widgets || [] })
      .filter((d) => d.widgets?.length)
  }
  if (pack.id === 'ecommerce-v1') return [ECOMMERCE_CEO_DASHBOARD, SPORTEDGE_EXEC_DASHBOARD]
  if (pack.id === 'finance-v1') return [FINANCE_CEO_DASHBOARD]
  if (pack.id === 'logistics-v1') return [LOGISTICS_SLA_DASHBOARD]
  if (pack.id === 'saas-metrics-v1') return [SAAS_METRICS_DASHBOARD]
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

  const created = []
  const updated = []
  let reportId = templates[0]?.id || 'ceo-revenue'

  for (const dash of templates) {
    reportId = dash.id
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
        certify: Boolean(opts.certify && martDataset?.certified),
        userId: opts.userId ?? null,
      })
      created.push(chart.id)
    }
  }

  if (opts.certify && martDataset?.certified) {
    for (const chartId of [...created, ...updated]) {
      try {
        await updateBiChart(
          workspaceId,
          chartId,
          { certified: true },
          opts.userId ?? null,
        )
      } catch {
        /* best effort */
      }
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
