/**
 * Production — certified BI charts + embed tokens on certified datasets / SQL.
 * Charts edit via HITL; embed tokens are opaque and revocable.
 */
import { randomUUID, createHash, randomBytes } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import { readManagedDatasetRows, getManagedDataset } from './managedDataPlane.js'
import {
  applyFiltersToSql,
  applyDrillFilter,
  filtersFromParameters,
  mergeBoardFilters,
  normalizeBoardFilters,
} from './studio/boardFilters.js'
import { applyBiAccessToSql } from './studio/biAccessGroups.js'
import { buildChartMeasureSql } from './studio/queExpr.js'

const CHART_TYPES = new Set([
  'bar',
  'line',
  'pie',
  'table',
  'kpi',
  'area',
  'card',
  'stacked_bar',
])

function mapChart(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    description: r.description || '',
    chartType: r.chart_type,
    datasetId: r.dataset_id,
    config: r.config_json && typeof r.config_json === 'object' ? r.config_json : {},
    certified: Boolean(r.certified),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listBiCharts(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM bi_charts
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT 200`,
    [workspaceId],
  )
  return rows.map(mapChart)
}

export async function getBiChart(workspaceId, chartId) {
  const { rows } = await query(
    `SELECT * FROM bi_charts WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, chartId],
  )
  return rows[0] ? mapChart(rows[0]) : null
}

export async function createBiChart(
  workspaceId,
  {
    title,
    description = '',
    chartType = 'table',
    datasetId = null,
    config = {},
    certify = false,
    userId = null,
  } = {},
) {
  const name = String(title || '').trim()
  if (!name) {
    const err = new Error('title required')
    err.status = 400
    throw err
  }
  const type = String(chartType || 'table').toLowerCase()
  if (!CHART_TYPES.has(type)) {
    const err = new Error(`chartType must be one of ${[...CHART_TYPES].join(', ')}`)
    err.status = 400
    throw err
  }
  if (datasetId) {
    const ds = await getManagedDataset(workspaceId, datasetId)
    if (!ds) {
      const err = new Error('dataset not found')
      err.status = 404
      throw err
    }
    if (certify && !ds.certified) {
      const err = new Error('Certify the managed dataset before certifying the chart')
      err.status = 400
      err.code = 'DATASET_NOT_CERTIFIED'
      throw err
    }
  }
  const id = randomUUID()
  await query(
    `INSERT INTO bi_charts (
       id, workspace_id, title, description, chart_type, dataset_id,
       config_json, certified, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [
      id,
      workspaceId,
      name.slice(0, 200),
      String(description || '').slice(0, 2000),
      type,
      datasetId,
      JSON.stringify(config && typeof config === 'object' ? config : {}),
      Boolean(certify),
      userId,
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'bi_chart.create',
    resourceType: 'bi_chart',
    resourceId: id,
    summary: `Created BI chart “${name}”`,
  })
  return getBiChart(workspaceId, id)
}

export async function updateBiChart(
  workspaceId,
  chartId,
  patch = {},
  userId = null,
) {
  const current = await getBiChart(workspaceId, chartId)
  if (!current) {
    const err = new Error('chart not found')
    err.status = 404
    throw err
  }
  const title =
    typeof patch.title === 'string' && patch.title.trim()
      ? patch.title.trim().slice(0, 200)
      : current.title
  const description =
    typeof patch.description === 'string'
      ? patch.description.slice(0, 2000)
      : current.description
  const chartType =
    typeof patch.chartType === 'string' &&
    CHART_TYPES.has(patch.chartType.toLowerCase())
      ? patch.chartType.toLowerCase()
      : current.chartType
  const config =
    patch.config && typeof patch.config === 'object'
      ? patch.config
      : current.config
  const certified =
    typeof patch.certified === 'boolean' ? patch.certified : current.certified
  const datasetId =
    patch.datasetId !== undefined ? patch.datasetId : current.datasetId

  if (certified && datasetId) {
    const ds = await getManagedDataset(workspaceId, datasetId)
    if (ds && !ds.certified) {
      const err = new Error('Certify the managed dataset before certifying the chart')
      err.status = 400
      throw err
    }
  }

  await query(
    `UPDATE bi_charts SET
       title = $3,
       description = $4,
       chart_type = $5,
       dataset_id = $6,
       config_json = $7::jsonb,
       certified = $8,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      chartId,
      title,
      description,
      chartType,
      datasetId,
      JSON.stringify(config || {}),
      certified,
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'bi_chart.update',
    resourceType: 'bi_chart',
    resourceId: chartId,
    summary: `Updated BI chart “${title}”`,
  })
  return getBiChart(workspaceId, chartId)
}

export async function deleteBiChart(workspaceId, chartId) {
  await query(`DELETE FROM bi_charts WHERE workspace_id = $1 AND id = $2`, [
    workspaceId,
    chartId,
  ])
  return { ok: true }
}

/**
 * Preview chart data from certified/managed dataset (human path — not AI).
 */

/** RS-3 drill-to-SQL — cert mart query for steward review. */
export function buildBiChartDrillSql(chart, dataset = null) {
  if (!chart) return { sql: '', note: 'No chart' }
  const table =
    dataset?.tableName ||
    dataset?.slug ||
    chart.datasetRef ||
    chart.tableName ||
    'que_marts.certified_mart'
  const x = chart.config?.xField
  const y = chart.config?.yField
  const yExpr = chart.config?.yExpr
  const metricSql = chart.config?.sqlFallback || chart.config?.metricSql
  if (metricSql && !yExpr) {
    return {
      sql: String(metricSql),
      certifiedOnly: true,
      datasetId: chart.datasetId || null,
      note: 'Metric expression from certified registry',
    }
  }
  const built = buildChartMeasureSql({
    table,
    xField: x,
    yField: y,
    yExpr,
  })
  if (built.sql) {
    return {
      sql: built.sql,
      certifiedOnly: true,
      datasetId: chart.datasetId || null,
      fields: built.fields,
      measureAlias: built.measureAlias,
      note: built.note,
    }
  }
  return {
    sql: `SELECT *\nFROM ${table}\nLIMIT 100`,
    certifiedOnly: true,
    datasetId: chart.datasetId || null,
  }
}

/**
 * Apply board filters, cross-filter, drill, and BI access policy to base SQL.
 * @param {string} baseSql
 * @param {object} [opts]
 */
export function applyBoardContextToSql(baseSql, opts = {}) {
  let sql = String(baseSql || '').trim()
  const paramFilters = filtersFromParameters(
    opts.parameters || [],
    opts.parameterOverrides || {},
  )
  const merged = mergeBoardFilters(
    [...paramFilters, ...normalizeBoardFilters(opts.filters)],
    opts.crossFilter || null,
  )
  if (merged.length) {
    sql = applyFiltersToSql(sql, merged)
  }
  if (opts.drill?.field) {
    sql = applyDrillFilter(sql, opts.drill)
  }
  if (opts.biAccess) {
    sql = applyBiAccessToSql(sql, opts.biAccess)
  }
  return { sql, filtersApplied: merged.length }
}

export async function getBiChartDrillSql(workspaceId, chartId, opts = {}) {
  const chart = await getBiChart(workspaceId, chartId)
  if (!chart) {
    const err = new Error('chart not found')
    err.status = 404
    throw err
  }
  let dataset = null
  if (chart.datasetId) {
    const { listManagedDatasets } = await import('./managedDataPlane.js')
    const datasets = await listManagedDatasets(workspaceId)
    dataset = datasets.find((d) => d.id === chart.datasetId) || null
    if (dataset && !dataset.certified) {
      const err = new Error('Drill SQL requires a certified dataset')
      err.status = 400
      err.code = 'DATASET_NOT_CERTIFIED'
      throw err
    }
  }
  const built = buildBiChartDrillSql(chart, dataset)
  const applied = applyBoardContextToSql(built.sql, opts)
  return {
    chart,
    ...built,
    sql: applied.sql,
    filtersApplied: applied.filtersApplied,
    crossFilter: opts.crossFilter || null,
  }
}

export async function previewBiChart(
  workspaceId,
  chartId,
  {
    limit = 100,
    skipCache = false,
    filters,
    parameters,
    parameterOverrides,
    crossFilter,
    drill,
    biAccess,
    warehouseOnly = true,
  } = {},
) {
  const chart = await getBiChart(workspaceId, chartId)
  if (!chart) {
    const err = new Error('chart not found')
    err.status = 404
    throw err
  }

  try {
    const { executeWidgetSql, mapRowsForChartPreview } = await import(
      './studio/widgetSql.js'
    )
    const wh = await executeWidgetSql(workspaceId, chartId, {
      limit,
      skipCache,
      filters,
      parameters,
      parameterOverrides,
      crossFilter,
      drill,
      biAccess,
    })
    if (wh.source === 'que_warehouse' && (wh.rows?.length || wh.sql)) {
      const series = mapRowsForChartPreview(chart, wh.rows)
      return {
        chart,
        rows: series,
        sql: wh.sql,
        source: 'que_warehouse',
        cached: wh.cached,
        durationMs: wh.durationMs,
        aiAccess: 'denied',
        note: wh.note,
      }
    }
  } catch (whErr) {
    console.warn('[Que BI] warehouse preview fallback:', whErr.message || whErr)
  }

  if (warehouseOnly) {
    return {
      chart,
      rows: [],
      source: 'warehouse_only',
      aiAccess: 'denied',
      note: chart.config?.sqlFallback || chart.config?.warehouseSql
        ? 'Warehouse-only preview — provision Que Warehouse or run sync'
        : 'Bind sqlFallback on this visual — managed dataset preview disabled in Studio v3',
    }
  }

  if (!chart.datasetId) {
    return { chart, rows: [], note: 'No dataset bound — bind a managed dataset or add sqlFallback' }
  }
  const data = await readManagedDatasetRows(workspaceId, chart.datasetId, {
    limit,
  })
  const x = chart.config?.xField
  const y = chart.config?.yField
  let series = data.rows.map((r) => r.data)
  if (x && y) {
    series = series.map((row) => ({
      x: row?.[x],
      y: row?.[y],
      ...row,
    }))
  }
  return {
    chart,
    rows: series,
    source: 'managed_dataset',
    aiAccess: 'denied',
    note: 'Preview from managed data plane — warehouse unavailable',
  }
}

/**
 * Mint embed token (returns plaintext once).
 */
export async function mintBiEmbedToken(
  workspaceId,
  chartId,
  { label = '', expiresInDays = 30, userId = null } = {},
) {
  const chart = await getBiChart(workspaceId, chartId)
  if (!chart) {
    const err = new Error('chart not found')
    err.status = 404
    throw err
  }
  if (!chart.certified) {
    const err = new Error('Certify the chart before minting an embed token')
    err.status = 400
    err.code = 'CHART_NOT_CERTIFIED'
    throw err
  }
  const raw = `qbi_${randomBytes(24).toString('base64url')}`
  const hash = createHash('sha256').update(raw).digest('hex')
  const id = randomUUID()
  const days = Math.min(Math.max(Number(expiresInDays) || 30, 1), 365)
  const { rows } = await query(
    `INSERT INTO bi_embed_tokens (
       id, workspace_id, chart_id, token_hash, label, expires_at, created_by
     ) VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval, $7)
     RETURNING id, label, expires_at, created_at`,
    [
      id,
      workspaceId,
      chartId,
      hash,
      String(label || 'embed').slice(0, 120),
      String(days),
      userId,
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'bi_embed.mint',
    resourceType: 'bi_chart',
    resourceId: chartId,
    summary: 'Minted BI embed token',
  })
  return {
    tokenId: rows[0].id,
    token: raw,
    label: rows[0].label,
    expiresAt: rows[0].expires_at,
    chartId,
    note: 'Store this token securely — it is shown only once',
  }
}

export async function revokeBiEmbedToken(workspaceId, tokenId) {
  await query(
    `UPDATE bi_embed_tokens SET revoked_at = now()
     WHERE workspace_id = $1 AND id = $2 AND revoked_at IS NULL`,
    [workspaceId, tokenId],
  )
  return { ok: true }
}

/**
 * Public embed resolve (no session) — capped rows.
 */
export async function resolveBiEmbed(rawToken) {
  const token = String(rawToken || '').trim()
  if (!token.startsWith('qbi_')) {
    const err = new Error('invalid embed token')
    err.status = 401
    throw err
  }
  const hash = createHash('sha256').update(token).digest('hex')
  const { rows } = await query(
    `SELECT t.*, c.title, c.chart_type, c.config_json, c.dataset_id, c.certified, c.workspace_id AS chart_ws
     FROM bi_embed_tokens t
     JOIN bi_charts c ON c.id = t.chart_id
     WHERE t.token_hash = $1
       AND t.revoked_at IS NULL
       AND (t.expires_at IS NULL OR t.expires_at > now())`,
    [hash],
  )
  if (!rows[0]) {
    const err = new Error('embed token invalid or expired')
    err.status = 401
    throw err
  }
  const t = rows[0]
  if (!t.certified) {
    const err = new Error('chart certification revoked')
    err.status = 403
    throw err
  }
  await query(
    `UPDATE bi_embed_tokens SET last_used_at = now() WHERE id = $1`,
    [t.id],
  )
  let rowsOut = []
  if (t.dataset_id) {
    const data = await readManagedDatasetRows(t.workspace_id, t.dataset_id, {
      limit: 200,
    })
    rowsOut = data.rows.map((r) => r.data)
  }
  return {
    chart: {
      id: t.chart_id,
      title: t.title,
      chartType: t.chart_type,
      config:
        t.config_json && typeof t.config_json === 'object' ? t.config_json : {},
      certified: true,
    },
    rows: rowsOut,
  }
}

/**
 * Parse NL BI style hints — columns, chart types, colors, title.
 */
export function parseBiStyleFromPrompt(prompt = '') {
  const g = String(prompt || '').toLowerCase()
  const colorMap = {
    blue: '#2563eb',
    red: '#dc2626',
    green: '#16a34a',
    purple: '#9333ea',
    orange: '#ea580c',
    teal: '#0d9488',
    pink: '#db2777',
    yellow: '#ca8a04',
    indigo: '#4f46e5',
  }
  const colors = []
  for (const [name, hex] of Object.entries(colorMap)) {
    if (g.includes(name)) colors.push(hex)
  }
  const chartTypes = []
  if (/\bbar\b/.test(g)) chartTypes.push('bar')
  if (/\b(line|trend)\b/.test(g)) chartTypes.push('line')
  if (/\b(pie|donut)\b/.test(g)) chartTypes.push('pie')
  if (/\b(kpi|metric)\b/.test(g)) chartTypes.push('kpi')
  if (/\btable\b/.test(g)) chartTypes.push('table')
  if (/\bcard\b/.test(g)) chartTypes.push('card')
  if (/\barea\b/.test(g)) chartTypes.push('area')

  const titleMatch = String(prompt || '').match(
    /\btitle\s+["']([^"']+)["']/i,
  )
  const xMatch =
    String(prompt || '').match(/\bx[\s-]?axis\s+(\w+)/i) ||
    String(prompt || '').match(/\bby\s+(\w+)/i)
  const yMatch =
    String(prompt || '').match(/\by[\s-]?axis\s+(\w+)/i) ||
    String(prompt || '').match(/\bmeasure\s+(\w+)/i)

  return {
    title: titleMatch?.[1]?.trim() || null,
    xField: xMatch?.[1] || null,
    yField: yMatch?.[1] || null,
    colors: colors.length ? colors : ['#2563eb', '#16a34a', '#9333ea'],
    chartTypes: chartTypes.length ? chartTypes : null,
  }
}

/**
 * metrics + multi-visual canvas (bar / kpi / table / pie) with layout.
 * Schema-first HITL — does not send lake rows to AI.
 */
export async function scaffoldBiReport(
  workspaceId,
  {
    title = 'Workspace report',
    datasetId = null,
    prompt = '',
    userId = null,
    xField: xFieldOverride = null,
    yField: yFieldOverride = null,
    colors = null,
    chartTypes = null,
  } = {},
) {
  const { listManagedDatasets } = await import('./managedDataPlane.js')
  const { createMetric } = await import('./metricDefinitions.js')

  const all = await listManagedDatasets(workspaceId)
  const certified = all.filter((d) => d.certified)
  const ds =
    (datasetId && certified.find((d) => d.id === datasetId)) || certified[0]
  if (!ds) {
    const err = new Error(
      'No certified managed dataset — run a job, certify on Managed, then scaffold',
    )
    err.status = 400
    err.code = 'NO_CERTIFIED_DATASET'
    throw err
  }

  const cols = (ds.columns || []).map((c) => c.name).filter(Boolean)
  const x = xFieldOverride && cols.includes(xFieldOverride)
    ? xFieldOverride
    : cols[0] || null
  const y = yFieldOverride && cols.includes(yFieldOverride)
    ? yFieldOverride
    : cols[1] || cols[0] || null
  const palette = Array.isArray(colors) && colors.length ? colors : ['#2563eb', '#16a34a', '#9333ea']
  const reportId = randomUUID()
  const reportTitle =
    String(title || '').trim() ||
    `${ds.name} report` ||
    'Workspace report'
  const promptText = String(prompt || '').trim().slice(0, 2000)

  const metric = await createMetric(workspaceId, {
    name: `${ds.name} · count`,
    expressionSql: 'COUNT(*)',
    datasetId: ds.id,
    certify: true,
    tags: ['auto-scaffold', 'report-studio'],
    lineage: x ? { tables: [ds.name], columns: [x] } : {},
    userId,
  })

  const defaultLayouts = [
    {
      chartType: 'kpi',
      title: `${ds.name} KPI`,
      layout: { col: 0, row: 0, w: 4, h: 2 },
      config: { yField: y || undefined, reportId, pageId: 'page1', color: palette[0] },
    },
    {
      chartType: 'card',
      title: `${ds.name} card`,
      layout: { col: 4, row: 0, w: 4, h: 2 },
      config: { yField: y || undefined, reportId, pageId: 'page1', color: palette[1] || palette[0] },
    },
    {
      chartType: 'bar',
      title: `${ds.name} by ${x || 'category'}`,
      layout: { col: 8, row: 0, w: 4, h: 4 },
      config: {
        xField: x || undefined,
        yField: y || undefined,
        reportId,
        pageId: 'page1',
        color: palette[0],
        colors: palette,
      },
    },
    {
      chartType: 'line',
      title: `${ds.name} trend`,
      layout: { col: 0, row: 2, w: 4, h: 4 },
      config: {
        xField: x || undefined,
        yField: y || undefined,
        reportId,
        pageId: 'page1',
        color: palette[2] || palette[0],
      },
    },
    {
      chartType: 'pie',
      title: `${ds.name} mix`,
      layout: { col: 4, row: 2, w: 4, h: 4 },
      config: {
        xField: x || undefined,
        yField: y || undefined,
        reportId,
        pageId: 'page1',
        colors: palette,
      },
    },
    {
      chartType: 'table',
      title: `${ds.name} detail`,
      layout: { col: 0, row: 6, w: 12, h: 4 },
      config: { reportId, pageId: 'page1' },
    },
  ]

  const layouts =
    Array.isArray(chartTypes) && chartTypes.length
      ? chartTypes.map((chartType, i) => ({
          chartType,
          title: `${ds.name} ${chartType}${x ? ` · ${x}` : ''}`,
          layout: {
            col: (i % 3) * 4,
            row: Math.floor(i / 3) * 4,
            w: 4,
            h: chartType === 'table' ? 4 : 3,
          },
          config: {
            xField: x || undefined,
            yField: y || undefined,
            reportId,
            pageId: 'page1',
            color: palette[i % palette.length],
            colors: palette,
            layout: undefined,
          },
        }))
      : defaultLayouts

  const charts = []
  for (const spec of layouts) {
    const draftChart = {
      chartType: spec.chartType,
      datasetId: ds.id,
      config: spec.config,
    }
    const built = buildBiChartDrillSql(draftChart, ds)
    const chart = await createBiChart(workspaceId, {
      title: spec.title,
      description: promptText
        ? `Scaffolded from: ${promptText}`
        : `Auto report for ${ds.name}`,
      chartType: spec.chartType,
      datasetId: ds.id,
      config: {
        ...spec.config,
        layout: spec.layout,
        sqlFallback: built.sql,
      },
      certify: false,
      userId,
    })
    charts.push(chart)
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'bi_report.scaffold',
    resourceType: 'bi_report',
    resourceId: reportId,
    summary: `Scaffolded report “${reportTitle}” (${charts.length} visuals)`,
  })

  return {
    reportId,
    title: reportTitle,
    datasetId: ds.id,
    datasetName: ds.name,
    metric,
    charts,
    note: 'HITL — edit visuals, Run preview, Certify before embed/Ship',
  }
}
