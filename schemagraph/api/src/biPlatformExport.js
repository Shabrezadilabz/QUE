/**
 * Export certified BI dashboards to Looker / Metabase portable JSON.
 */
import { listBiCharts, getBiChart } from './certifiedBi.js'
import { getLatestPackCertification } from './packCertification.js'

export async function exportLookerPack(workspaceId, opts = {}) {
  const reportId = opts.reportId || 'ceo-revenue'
  const allCharts = await listBiCharts(workspaceId)
  const charts = allCharts.filter(
    (ch) =>
      !reportId ||
      ch.config?.reportId === reportId ||
      String(ch.title || '').toLowerCase().includes('revenue'),
  )
  const cert = opts.packId
    ? await getLatestPackCertification(workspaceId, opts.packId)
    : null

  const views = []
  for (const ch of charts) {
    const full = await getBiChart(workspaceId, ch.id).catch(() => ch)
    views.push({
      name: slug(full.title || ch.id),
      sql_table_name: full.datasetRef || full.tableName || 'que_marts.brand_revenue_mart',
      dimensions: (full.dimensions || []).map((d) => ({
        name: slug(d.name || d.field),
        type: mapLookerType(d.type),
        sql: d.sql || `\${TABLE}.${d.field || d.name}`,
      })),
      measures: (full.measures || []).map((m) => ({
        name: slug(m.name || m.field),
        type: mapLookerMeasureType(m.aggregate),
        sql: m.sql || `\${TABLE}.${m.field || m.name}`,
      })),
      chartType: full.chartType || 'bar',
    })
  }

  return {
    format: 'looker',
    version: '1.0',
    disclaimer:
      'Que Looker export — merge into existing LookML project; not a full Looker project generator.',
    generatedAt: new Date().toISOString(),
    workspaceId,
    certification: cert?.status || null,
    lookml: {
      project: `que_${workspaceId.slice(0, 8)}`,
      model: `${reportId}.model.lkml`,
      views,
      explores: views.map((v) => ({
        name: v.name,
        view_name: v.name,
        description: `Que certified explore — ${v.name}`,
      })),
    },
    files: views.flatMap((v) => [
      {
        path: `views/${v.name}.view.lkml`,
        content: renderLookmlView(v),
      },
    ]),
  }
}

export async function exportMetabasePack(workspaceId, opts = {}) {
  const reportId = opts.reportId || 'ceo-revenue'
  const allCharts = await listBiCharts(workspaceId)
  const charts = allCharts.filter(
    (ch) =>
      !reportId ||
      ch.config?.reportId === reportId ||
      String(ch.title || '').toLowerCase().includes('revenue'),
  )

  const cards = charts.map((ch, i) => ({
    name: ch.title || `Widget ${i + 1}`,
    display: ch.chartType || 'bar',
    dataset_query: {
      type: 'native',
      native: {
        query: ch.sql || ch.query || 'SELECT 1 AS placeholder',
      },
      database: opts.databaseId || 1,
    },
    visualization_settings: ch.visualization || {},
  }))

  return {
    format: 'metabase',
    version: '1.0',
    disclaimer:
      'Que Metabase export — import dashboard JSON into Metabase; map database id manually.',
    generatedAt: new Date().toISOString(),
    workspaceId,
    dashboard: {
      name: `Que ${reportId}`,
      description: 'Exported from Que certified BI',
      cards,
    },
  }
}

function slug(s) {
  return String(s || 'field')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'field'
}

function mapLookerType(t) {
  const x = String(t || '').toLowerCase()
  if (x.includes('time') || x.includes('date')) return 'time'
  if (x.includes('int') || x.includes('num')) return 'number'
  return 'string'
}

function mapLookerMeasureType(agg) {
  const a = String(agg || 'sum').toLowerCase()
  if (a === 'count') return 'count'
  if (a === 'avg') return 'average'
  return 'sum'
}

function renderLookmlView(v) {
  const dims = (v.dimensions || [])
    .map(
      (d) =>
        `  dimension: ${d.name} {\n    type: ${d.type}\n    sql: ${d.sql} ;;\n  }`,
    )
    .join('\n\n')
  const measures = (v.measures || [])
    .map(
      (m) =>
        `  measure: ${m.name} {\n    type: ${m.type}\n    sql: ${m.sql} ;;\n  }`,
    )
    .join('\n\n')
  return `view: ${v.name} {\n  sql_table_name: ${v.sql_table_name} ;;\n\n${dims}\n\n${measures}\n}\n`
}

export function formatBiExportMarkdown(pack) {
  const lines = [
    `# Que BI export (${pack.format})`,
    '',
    `Generated: ${pack.generatedAt}`,
    '',
    pack.disclaimer,
    '',
  ]
  if (pack.format === 'looker') {
    for (const f of pack.files || []) {
      lines.push(`## ${f.path}`, '', '```lookml', f.content, '```', '')
    }
  } else if (pack.format === 'tableau') {
    lines.push('```xml', pack.workbookXml || '', '```')
  } else {
    lines.push('```json', JSON.stringify(pack.dashboard || pack.report || pack, null, 2), '```')
  }
  return lines.join('\n')
}

function chartsForReport(allCharts, opts = {}) {
  const reportId = opts.reportId || 'ceo-revenue'
  return allCharts.filter(
    (ch) =>
      !reportId ||
      ch.config?.reportId === reportId ||
      String(ch.title || '').toLowerCase().includes('revenue'),
  )
}

function chartToNativeSql(ch) {
  const x = ch.config?.xField
  const y = ch.config?.yField
  const table = ch.datasetRef || ch.tableName || 'que_marts.certified_mart'
  if (ch.config?.sqlFallback) return ch.config.sqlFallback
  if (x && y) {
    return `SELECT ${x}, SUM(${y}) AS ${y}\nFROM ${table}\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT 500`
  }
  return ch.sql || ch.query || `SELECT * FROM ${table} LIMIT 100`
}

/** Pure builder for unit tests and export. */
export function buildPowerBiPackFromCharts(charts, opts = {}) {
  const reportId = opts.reportId || 'ceo-revenue'
  const tables = charts.map((ch, i) => ({
    name: slug(ch.title || `Visual_${i + 1}`),
    columns: [
      ...(ch.config?.xField
        ? [{ name: ch.config.xField, dataType: 'string' }]
        : []),
      ...(ch.config?.yField
        ? [{ name: ch.config.yField, dataType: 'double' }]
        : []),
    ],
    sourceExpression: chartToNativeSql(ch),
  }))
  const visuals = charts.map((ch, i) => ({
    name: ch.title || `Visual ${i + 1}`,
    type: mapPowerBiVisual(ch.chartType),
    query: chartToNativeSql(ch),
    x: ch.config?.layout?.col ?? 0,
    y: ch.config?.layout?.row ?? 0,
  }))
  return {
    format: 'powerbi',
    version: '1.0',
    disclaimer:
      'Que Power BI export — import JSON template into Power BI Desktop; map data source manually.',
    generatedAt: new Date().toISOString(),
    workspaceId: opts.workspaceId || null,
    reportId,
    model: { name: `Que_${reportId}`, tables },
    report: { name: `Que ${reportId}`, pages: [{ name: 'Page1', visuals }] },
  }
}

/** Pure builder for unit tests and export. */
export function buildTableauPackFromCharts(charts, opts = {}) {
  const reportId = opts.reportId || 'ceo-revenue'
  const worksheets = charts.map((ch, i) => ({
    name: slug(ch.title || `sheet_${i + 1}`),
    sql: chartToNativeSql(ch),
    chartType: ch.chartType || 'bar',
  }))
  const workbookXml = renderTableauWorkbookXml(reportId, worksheets)
  return {
    format: 'tableau',
    version: '1.0',
    disclaimer:
      'Que Tableau export — TWB-compatible XML fragment; connect to warehouse before publish.',
    generatedAt: new Date().toISOString(),
    workspaceId: opts.workspaceId || null,
    reportId,
    worksheets,
    workbookXml,
    files: [{ path: `${reportId}.twb.xml`, content: workbookXml }],
  }
}

/** Power BI importable JSON (dataset + report pages) — not binary PBIX. */
export async function exportPowerBiPack(workspaceId, opts = {}) {
  const allCharts = await listBiCharts(workspaceId)
  const charts = chartsForReport(allCharts, opts)
  return buildPowerBiPackFromCharts(charts, { ...opts, workspaceId })
}

/** Tableau workbook XML fragment — import via Tableau REST or manual TWB merge. */
export async function exportTableauPack(workspaceId, opts = {}) {
  const allCharts = await listBiCharts(workspaceId)
  const charts = chartsForReport(allCharts, opts)
  return buildTableauPackFromCharts(charts, { ...opts, workspaceId })
}

function mapPowerBiVisual(chartType) {
  const t = String(chartType || 'bar').toLowerCase()
  if (t === 'line' || t === 'area') return 'lineChart'
  if (t === 'pie') return 'pieChart'
  if (t === 'kpi' || t === 'card') return 'card'
  if (t === 'table') return 'table'
  return 'clusteredBarChart'
}

function renderTableauWorkbookXml(reportId, worksheets) {
  const sheets = worksheets
    .map(
      (w) =>
        `  <worksheet name='${escapeXml(w.name)}'>\n    <sql>${escapeXml(w.sql)}</sql>\n    <mark class='${w.chartType === 'line' ? 'Line' : 'Bar'}'/>\n  </worksheet>`,
    )
    .join('\n')
  return `<?xml version='1.0'?>\n<workbook source='Que' report='${escapeXml(reportId)}'>\n${sheets}\n</workbook>`
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
}
