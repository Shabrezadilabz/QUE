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
  } else {
    lines.push('```json', JSON.stringify(pack.dashboard, null, 2), '```')
  }
  return lines.join('\n')
}
