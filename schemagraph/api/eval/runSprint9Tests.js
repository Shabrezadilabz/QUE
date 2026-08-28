/**
 * Sprint 9 — Report Studio RS-3/4, replication v2 E2E, India connectors, mongo+warehouse.
 */
import { buildBiChartDrillSql } from '../src/certifiedBi.js'
import {
  buildPowerBiPackFromCharts,
  buildTableauPackFromCharts,
} from '../src/biPlatformExport.js'
import { planReplicationV2Run } from '../src/replicationV2.js'
import { buildMultiSourceAnalysis, detectMultiSourceProfile } from '../src/multiSourceMonk.js'
import { introspectShopify } from '../src/connectors/shopify.js'
import { introspectRazorpay } from '../src/connectors/razorpay.js'
import { introspectZoho } from '../src/connectors/zoho.js'
import { SPORTEDGE_EXEC_DASHBOARD } from '../src/dashboardTemplates.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const drill = buildBiChartDrillSql(
  {
    config: { xField: 'brand', yField: 'revenue', sqlFallback: 'SELECT brand, SUM(revenue) FROM mart GROUP BY 1' },
    datasetId: 'ds-1',
  },
  { tableName: 'sportedge.brand_revenue_mart', certified: true },
)
assert(drill.certifiedOnly === true, 'drill sql certified only')
assert(drill.sql.includes('SELECT brand'), 'drill uses metric sql')

const mockCharts = [
  {
    id: 'c1',
    title: 'Revenue by brand',
    chartType: 'bar',
    config: { xField: 'brand', yField: 'revenue', reportId: 'sportedge-exec' },
  },
]

const pbi = buildPowerBiPackFromCharts(mockCharts, { reportId: 'sportedge-exec' })
assert(pbi.format === 'powerbi', 'powerbi format')
assert(pbi.report?.pages?.length >= 1, 'powerbi pages')

const tab = buildTableauPackFromCharts(mockCharts, { reportId: 'sportedge-exec' })
assert(tab.format === 'tableau', 'tableau format')
assert(tab.workbookXml?.includes('workbook'), 'tableau xml')

const scope = {
  warehouse: 'snowflake',
  recommendedTables: [{ name: 'dim_brand' }, { name: 'fact_orders' }],
  plan: { targetSchema: 'que_replica_snowflake' },
}
const plan = planReplicationV2Run(scope)
assert(plan.kind === 'que.replication_v2_run_plan', 'replication v2 plan kind')
assert(plan.tables.length === 2, 'replication plan tables')

const mongoPg = [
  { name: 'events', sourceType: 'mongodb', connection: 'mongo' },
  { name: 'public.users', sourceType: 'postgresql', connection: 'pg' },
]
assert(detectMultiSourceProfile(mongoPg)?.profile.id === 'mongodb-postgresql', 'mongo+pg profile')
const ms = buildMultiSourceAnalysis(mongoPg, { matches: [], canRunMonk: false, scorePct: 0, requiredOk: false })
assert(ms.ready === true, 'mongo multi-source ready')

const shop = await introspectShopify({})
assert(shop.tables.length >= 3, 'shopify fixture tables')
const rz = await introspectRazorpay({})
assert(rz.tables.some((t) => t.name === 'payments'), 'razorpay payments')
const zo = await introspectZoho({})
assert(zo.tables.some((t) => t.name === 'invoices'), 'zoho invoices')

assert(SPORTEDGE_EXEC_DASHBOARD.widgets.length === 5, 'sportedge exec 5 charts')

console.log(failed ? `\n${failed} failed` : '\nAll Sprint 9 tests passed')
process.exit(failed ? 1 : 0)
