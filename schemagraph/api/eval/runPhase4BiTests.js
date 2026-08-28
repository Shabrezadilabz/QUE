/**
 * Phase 4 — BI Studio warehouse widget/metric execution (unit tests, no DB).
 */
import {
  resolveWidgetSql,
  resolveMetricSql,
  mapRowsForChartPreview,
  scalarFromPreviewRows,
} from '../src/studio/widgetSql.js'
import {
  cacheKey,
  getCached,
  setCached,
  clearStudioCache,
  DEFAULT_CACHE_TTL_MS,
} from '../src/studio/sessionCache.js'
import { prepareBiReadonlySql, BI_WIDGET_MAX_ROWS } from '../src/liveExec.js'
import {
  applyBoardContextToSql,
  buildBiChartDrillSql,
} from '../src/certifiedBi.js'
import { buildChartMeasureSql, compileQueExpr } from '../src/studio/queExpr.js'

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

const chart = {
  id: 'c1',
  title: 'Revenue',
  chartType: 'bar',
  config: { xField: 'brand', yField: 'revenue', sqlFallback: 'SELECT brand, SUM(amount) AS revenue FROM raw_shopify_orders GROUP BY 1' },
  datasetId: null,
}

assert(
  resolveWidgetSql(chart, null).includes('SELECT brand'),
  'resolve widget sql from sqlFallback',
)

const built = buildBiChartDrillSql(chart, null)
assert(built.sql.includes('SUM'), 'buildBiChartDrillSql uses fallback')

const filtered = applyBoardContextToSql(built.sql, {
  crossFilter: { field: 'brand', value: 'Nike' },
})
assert(
  filtered.sql.includes('_que_board') && filtered.sql.includes('Nike'),
  'cross-filter wraps drill SQL',
)
assert(filtered.filtersApplied === 1, 'cross-filter count')

const queExprChart = {
  ...chart,
  config: {
    ...chart.config,
    yExpr: 'SUM(amount)',
    yField: undefined,
  },
}
const exprBuilt = buildBiChartDrillSql(queExprChart, null)
assert(exprBuilt.sql.includes('SUM(amount)'), 'QueExpr in drill SQL')
assert(exprBuilt.measureAlias === 'measure_value', 'QueExpr measure alias')

const compiled = compileQueExpr('AVG(price)')
assert(compiled.mode === 'expr' && compiled.expr === 'AVG(price)', 'compile QueExpr')

const measureSql = buildChartMeasureSql({
  table: 'raw_orders',
  xField: 'brand',
  yExpr: 'COUNT(*)',
})
assert(measureSql.sql.includes('GROUP BY') && measureSql.sql.includes('COUNT'), 'QueExpr grouped SQL')

try {
  applyBoardContextToSql('SELECT salary FROM employees', {
    biAccess: {
      unrestricted: false,
      allowedTables: ['employees'],
      deniedColumns: { employees: ['salary'] },
    },
  })
  assert(false, 'denied column should throw')
} catch (e) {
  assert(String(e.message).includes('restricted'), 'denied column throws')
}

const metric = {
  id: 'm1',
  name: 'Orders',
  expressionSql: 'SUM(order_total)',
  dimensions: ['orders'],
}
assert(
  resolveMetricSql(metric).includes('SUM(order_total)'),
  'resolve metric sum sql',
)

const selectMetric = {
  expressionSql: 'SELECT COUNT(*) FROM raw_shopify_orders',
}
assert(
  resolveMetricSql(selectMetric).startsWith('SELECT COUNT'),
  'resolve metric passthrough select',
)

const rows = [{ brand: 'A', revenue: 100 }, { brand: 'B', revenue: 200 }]
const mapped = mapRowsForChartPreview(chart, rows)
assert(mapped[0].x === 'A' && mapped[0].y === 100, 'map rows for chart preview')

assert(scalarFromPreviewRows(rows, 'revenue') === 100, 'scalar from preview rows')

clearStudioCache()
const key = cacheKey(['ws', 'widget', 'c1', 'SELECT 1'])
setCached(key, { rows: [{ n: 1 }] }, DEFAULT_CACHE_TTL_MS)
assert(getCached(key)?.rows?.[0]?.n === 1, 'session cache set/get')
clearStudioCache()
assert(getCached(key) === null, 'session cache clear')

const biSql = prepareBiReadonlySql('SELECT * FROM orders', 200)
assert(/\blimit\s+200/i.test(biSql), 'bi readonly sql allows higher limit')
assert(BI_WIDGET_MAX_ROWS >= 200, 'bi widget max rows constant')

const ds = {
  id: 'd1',
  name: 'orders',
  tableName: 'raw_shop_orders',
  columns: [{ name: 'brand' }, { name: 'revenue' }],
}
const scaffoldDraft = {
  chartType: 'bar',
  datasetId: ds.id,
  config: { xField: 'brand', yField: 'revenue' },
}
const scaffoldSql = buildBiChartDrillSql(scaffoldDraft, ds)
assert(scaffoldSql.sql.includes('raw_shop_orders'), 'scaffold binds warehouse sql')
assert(scaffoldSql.sql.includes('brand'), 'scaffold sql includes dimensions')

if (failed > 0) {
  console.error(`\nPhase 4 BI tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 4 BI tests passed')
