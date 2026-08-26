/**
 * Dashboard template unit tests.
 * Run: node eval/runDashboardTemplateTests.js
 */
import {
  getPackDashboardTemplates,
  ECOMMERCE_CEO_DASHBOARD,
} from '../src/dashboardTemplates.js'
import { getIndustryPack } from '../src/packs/index.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const pack = getIndustryPack('ecommerce-v1')
const templates = getPackDashboardTemplates(pack)
assert(templates.length >= 1, 'ecommerce has dashboard templates')
assert(
  templates.some((t) => t.id === 'ceo-revenue'),
  'ceo-revenue dashboard exists',
)
assert(ECOMMERCE_CEO_DASHBOARD.widgets.length >= 5, 'CEO dashboard has 5+ widgets')
assert(
  ECOMMERCE_CEO_DASHBOARD.widgets.some((w) => w.kpiId === 'revenue_by_brand'),
  'revenue widget binds to KPI',
)

console.log(failed ? `\n${failed} failed` : '\nAll dashboard template tests passed')
process.exit(failed ? 1 : 0)
