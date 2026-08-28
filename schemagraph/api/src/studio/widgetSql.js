/**
 * Phase 4 — BI Studio warehouse widget execution.
 * Every widget resolves stored SQL → Que Warehouse read → cached rows (UI only).
 */
import { executeWarehouseReadonlySql } from '../queWarehouse.js'
import { buildBiChartDrillSql, getBiChart } from '../certifiedBi.js'
import { getMetric } from '../metricDefinitions.js'
import {
  applyFiltersToSql,
  applyDrillFilter,
  filtersFromParameters,
  mergeBoardFilters,
  normalizeBoardFilters,
} from './boardFilters.js'
import {
  cacheKey,
  getCached,
  setCached,
  DEFAULT_CACHE_TTL_MS,
} from './sessionCache.js'

/**
 * Resolve executable SQL for a BI chart widget.
 * @param {object} chart
 * @param {object|null} [dataset]
 */
export function resolveWidgetSql(chart, dataset = null) {
  const built = buildBiChartDrillSql(chart, dataset)
  return String(built.sql || '').trim()
}

/**
 * Resolve warehouse SQL for a metric definition.
 * @param {object} metric
 */
export function resolveMetricSql(metric) {
  const expr = String(metric?.expressionSql || '').trim()
  if (/^\s*(with|select)\b/i.test(expr)) return expr

  const table =
    metric?.config?.tableName ||
    metric?.dimensions?.[0] ||
    'que_marts.certified_mart'
  const lower = expr.toLowerCase()

  if (!expr || lower === 'count(*)') {
    return `SELECT COUNT(*) AS value FROM ${table}`
  }
  if (lower.startsWith('sum(')) {
    const field = expr.slice(4, -1).trim()
    return `SELECT COALESCE(SUM(${field}), 0) AS value FROM ${table}`
  }
  if (lower.startsWith('avg(')) {
    const field = expr.slice(4, -1).trim()
    return `SELECT AVG(${field}) AS value FROM ${table}`
  }
  if (!expr.includes('(')) {
    return `SELECT COUNT(DISTINCT ${expr}) AS value FROM ${table}`
  }
  return `SELECT ${expr} AS value FROM ${table} LIMIT 1`
}

/**
 * Execute widget SQL on Que Warehouse with session cache.
 * @param {string} workspaceId
 * @param {string} chartId
 * @param {{ limit?: number, skipCache?: boolean, cacheTtlMs?: number, sql?: string, filters?: object[], parameters?: object[], parameterOverrides?: object, crossFilter?: object|null, drill?: object|null }} [opts]
 */
export async function executeWidgetSql(workspaceId, chartId, opts = {}) {
  const chart = await getBiChart(workspaceId, chartId)
  if (!chart) {
    const err = new Error('chart not found')
    err.status = 404
    throw err
  }

  let dataset = null
  if (chart.datasetId) {
    const { listManagedDatasets } = await import('../managedDataPlane.js')
    const datasets = await listManagedDatasets(workspaceId)
    dataset = datasets.find((d) => d.id === chart.datasetId) || null
  }

  let sql = String(opts.sql || resolveWidgetSql(chart, dataset)).trim()
  if (!sql) {
    return {
      chart,
      sql: '',
      rows: [],
      columns: [],
      rowCount: 0,
      source: 'none',
      cached: false,
      note: 'No SQL resolved for widget',
    }
  }

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
    const { applyBiAccessToSql, maskBiAccessColumns } = await import(
      './biAccessGroups.js'
    )
    sql = applyBiAccessToSql(sql, opts.biAccess)
  }

  const key = cacheKey([
    workspaceId,
    'widget',
    chartId,
    sql,
    String(opts.limit || 100),
  ])

  if (!opts.skipCache) {
    const hit = getCached(key)
    if (hit) return { ...hit, cached: true }
  }

  const exec = await executeWarehouseReadonlySql(workspaceId, sql, {
    biWidget: true,
    maxRows: opts.limit ?? 100,
  })

  const payload = {
    chart,
    sql,
    rows: exec.rows || [],
    columns: (exec.columns || []).map((c) => c.name),
    rowCount: exec.rowCount ?? (exec.rows || []).length,
    durationMs: exec.durationMs,
    engine: exec.engine,
    schema: exec.schema,
    source: 'que_warehouse',
    aiAccess: 'denied',
    note: 'Warehouse preview — row payloads never sent to AI',
    cached: false,
    filtersApplied: merged.length,
  }

  if (opts.biAccess) {
    const { maskBiAccessColumns } = await import('./biAccessGroups.js')
    const masked = maskBiAccessColumns(
      payload.rows,
      payload.columns,
      opts.biAccess,
    )
    payload.rows = masked.rows
    payload.columns = masked.columns
  }

  setCached(key, payload, opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS)
  return payload
}

/**
 * Execute metric SQL on Que Warehouse (single scalar or small row set).
 * @param {string} workspaceId
 * @param {string} metricId
 * @param {{ skipCache?: boolean, cacheTtlMs?: number }} [opts]
 */
export async function executeMetricSql(workspaceId, metricId, opts = {}) {
  const metric = await getMetric(workspaceId, metricId)
  if (!metric) {
    const err = new Error('metric not found')
    err.status = 404
    throw err
  }

  const sql = resolveMetricSql(metric)
  let execSql = sql
  if (opts.biAccess) {
    const { applyBiAccessToSql } = await import('./biAccessGroups.js')
    execSql = applyBiAccessToSql(sql, opts.biAccess)
  }
  const key = cacheKey([workspaceId, 'metric', metricId, execSql])

  if (!opts.skipCache) {
    const hit = getCached(key)
    if (hit) return { ...hit, cached: true }
  }

  const exec = await executeWarehouseReadonlySql(workspaceId, execSql, {
    biWidget: true,
    maxRows: 20,
  })
  const row = (exec.rows || [])[0] || {}
  const value =
    row.value ??
    row.count ??
    Object.values(row).find((v) => v != null) ??
    null

  const payload = {
    metric,
    sql: execSql,
    value,
    rows: exec.rows || [],
    rowCount: exec.rowCount ?? (exec.rows || []).length,
    durationMs: exec.durationMs,
    source: 'que_warehouse',
    aiAccess: 'denied',
    cached: false,
  }

  setCached(key, payload, opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS)
  return payload
}

/**
 * Map warehouse rows to chart preview series (x/y enrichment).
 * @param {object} chart
 * @param {object[]} rows
 */
export function mapRowsForChartPreview(chart, rows) {
  const x = chart.config?.xField
  const y = chart.config?.yField
  if (!x && !y) return rows
  return (rows || []).map((row) => ({
    x: x ? row?.[x] : undefined,
    y: y ? row?.[y] : undefined,
    ...row,
  }))
}

/** Extract scalar KPI value from preview rows. */
export function scalarFromPreviewRows(rows, yField) {
  const list = rows || []
  if (!list.length) return null
  const y = yField || Object.keys(list[0] || {}).find((k) => k !== 'x')
  const first = list[0]
  if (y && first?.[y] != null) return first[y]
  const val = first?.value ?? first?.count
  if (val != null) return val
  const nums = list
    .map((r) => Number(y ? r[y] : 0))
    .filter(Number.isFinite)
  if (nums.length) return nums.reduce((a, b) => a + b, 0)
  return list.length
}
