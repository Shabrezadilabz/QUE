/**
 * Phase 4 — Studio hub unit tests (no DB).
 */
import { summarizeStudioReadiness } from '../src/studio/queStudioHub.js'
import { buildQueMlYaml } from '../src/studio/queStudioQueMl.js'
import { buildBiChartDrillSql } from '../src/certifiedBi.js'

let failed = 0

function ok(label) {
  console.log(`ok: ${label}`)
}

function assert(cond, label) {
  if (!cond) {
    failed += 1
    console.error(`FAIL: ${label}`)
  } else {
    ok(label)
  }
}

const ready = summarizeStudioReadiness({
  chartCount: 5,
  certifiedCharts: 2,
  warehouseWidgets: 4,
  metricCount: 3,
  gridTables: 8,
  kpiWidgets: 2,
})
assert(ready.status === 'ready', 'charts + cert + WH widgets → ready')
assert(ready.liveMetricHover === true, 'live metric hover enabled')

const empty = summarizeStudioReadiness({})
assert(empty.status === 'empty', 'no assets → empty')

const review = summarizeStudioReadiness({
  chartCount: 2,
  gridTables: 5,
})
assert(review.status === 'review', 'partial studio → review')

const yaml = buildQueMlYaml({
  reportId: 'sportedge-exec',
  dimensions: [{ name: 'region', chart: 'Revenue by region' }],
  measures: [{ name: 'revenue', chart: 'Revenue by region', agg: 'sum' }],
  metrics: [
    {
      slug: 'total_revenue',
      name: 'Total revenue',
      expressionSql: 'SUM(revenue)',
      certified: true,
    },
  ],
})
assert(yaml.includes('report_id: sportedge-exec'), 'QueML yaml includes report_id')
assert(yaml.includes('name: region'), 'QueML yaml includes dimensions')
assert(yaml.includes('total_revenue'), 'QueML yaml includes metrics')

const scaffoldSql = buildBiChartDrillSql(
  {
    chartType: 'bar',
    datasetId: 'ds1',
    config: { xField: 'region', yField: 'revenue' },
  },
  { tableName: 'raw_orders', columns: [{ name: 'region' }, { name: 'revenue' }] },
)
assert(scaffoldSql.sql.includes('raw_orders'), 'studio scaffold sql table')

if (failed > 0) {
  console.error(`\nPhase Studio hub tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Studio hub tests passed')
