/**
 * Phase P3.6 — SSM-B state vector + BI access groups (unit tests, no DB).
 */
import {
  buildSsmStateVector,
  routeSsmIntent,
} from '../src/ssm/ssmRouter.js'
import {
  validateBiSqlAccess,
  maskBiAccessColumns,
  extractSqlTableRefs,
  applyBiAccessToSql,
} from '../src/studio/biAccessGroups.js'
import { applyBoardContextToSql, buildBiChartDrillSql } from '../src/certifiedBi.js'
import { formatSsmRoutingLabel } from '../src/ssm/schemaContextService.js'
import { resolveSsmRouteWithAb, trainSsmRoutingModel } from '../src/ssm/ssmMlExport.js'
import { clearSsmModelsForTests } from '../src/ssm/ssmTrainedModel.js'

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

const events = [
  {
    eventType: 'sync_completed',
    createdAt: new Date().toISOString(),
    meta: { tableName: 'orders' },
  },
  {
    eventType: 'schema_drift',
    createdAt: new Date().toISOString(),
    meta: { tableName: 'orders' },
  },
]

const vec = buildSsmStateVector(events)
assert(vec.eventCounts.sync_completed === 1, 'state vector sync count')
assert(vec.driftBoost > 0, 'drift boost')

const route = routeSsmIntent('build a dashboard for revenue', { events })
assert(route.intent === 'studio_board', 'studio intent')
assert(route.confidence > 0.7, 'intent confidence')
assert(route.stateVector?.totalEvents === 2, 'route includes state vector')

const refs = extractSqlTableRefs('SELECT a FROM raw_orders JOIN customers c ON 1=1')
assert(refs.includes('raw_orders'), 'extract table refs')

const denied = validateBiSqlAccess('SELECT salary FROM employees', {
  unrestricted: false,
  allowedTables: ['employees'],
  deniedColumns: { employees: ['salary'] },
})
assert(!denied.allowed, 'deny restricted column')

const masked = maskBiAccessColumns(
  [{ id: 1, salary: 100, name: 'Ada' }],
  ['id', 'salary', 'name'],
  { unrestricted: false, deniedColumns: { employees: ['salary'] } },
)
assert(!masked.columns.includes('salary'), 'mask denied column')

const rowFiltered = applyBiAccessToSql('SELECT brand, revenue FROM orders', {
  unrestricted: false,
  allowedTables: ['orders'],
  rowFilters: [{ field: 'region', op: 'eq', value: 'US' }],
})
assert(rowFiltered.includes('_que_board') && rowFiltered.includes('US'), 'row filter applied to SQL')

const chart = {
  id: 'c1',
  title: 'Revenue',
  chartType: 'bar',
  config: {
    xField: 'brand',
    yField: 'revenue',
    sqlFallback: 'SELECT brand, SUM(amount) AS revenue FROM orders GROUP BY 1',
  },
  datasetId: null,
}
const drill = buildBiChartDrillSql(chart, null)
const crossDrill = applyBoardContextToSql(drill.sql, {
  crossFilter: { field: 'brand', value: 'Nike' },
})
assert(crossDrill.sql.includes('Nike'), 'cross-filter on drill SQL')
assert(crossDrill.filtersApplied === 1, 'cross-filter count on drill')

assert(
  formatSsmRoutingLabel({ routingSource: 'ml_trained', mlModel: 'ssm-b-trained-v1' }).includes('trained'),
  'routing label trained',
)
assert(
  formatSsmRoutingLabel({ routingSource: 'heuristic' }).includes('heuristic'),
  'routing label heuristic',
)

clearSsmModelsForTests()
trainSsmRoutingModel('p36-ws', { syntheticPerIntent: 12 })
const prodRoute = resolveSsmRouteWithAb('build revenue dashboard for exec board', [
  { eventType: 'board_published', createdAt: new Date().toISOString(), meta: {} },
  { eventType: 'sync_completed', createdAt: new Date().toISOString(), meta: {} },
], { workspaceId: 'p36-ws' })
assert(prodRoute.ssmRoute.routingSource, 'prod routing source set')
assert(prodRoute.recommendedIntent, 'prod recommended intent')
clearSsmModelsForTests()

if (failed > 0) {
  console.error(`\nPhase 3.6 tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 3.6 tests passed')
