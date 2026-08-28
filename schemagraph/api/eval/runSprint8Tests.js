/**
 * Sprint 8 — Multi-source Monk, replication v2 scope, India compliance, SOC2 kickoff helpers.
 */
import {
  buildMultiSourceAnalysis,
  detectMultiSourceProfile,
  MULTI_SOURCE_PROFILES,
} from '../src/multiSourceMonk.js'
import { REPLICATION_V2_WAREHOUSES } from '../src/replicationV2.js'
import { defaultSoc2Kickoff } from '../src/soc2Kickoff.js'
import { INDIA_ENTERPRISE_SKU, getIndiaCompliancePack } from '../src/enterpriseCompliance.js'
import { scorePackAgainstSchema } from '../src/templateMatcher.js'
import { getIndustryPack } from '../src/templateMatcher.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const tables = [
  { name: 'public.orders', sourceType: 'postgresql', connection: 'pg-main' },
  { name: 'public.customers', sourceType: 'postgresql', connection: 'pg-main' },
  { name: 'Account', sourceType: 'salesforce', connection: 'sf-prod' },
  { name: 'Opportunity', sourceType: 'salesforce', connection: 'sf-prod' },
]

const pack = getIndustryPack('ecommerce-v1')
const matchResult = scorePackAgainstSchema(tables, pack)
const analysis = buildMultiSourceAnalysis(tables, matchResult, pack)

assert(MULTI_SOURCE_PROFILES.length >= 2, 'multi-source profiles defined')
assert(detectMultiSourceProfile(tables)?.profile.id === 'postgres-salesforce', 'detect postgres+sf')
assert(analysis.ready === true, 'multi-source ready')
assert(analysis.sources.length === 2, 'two source buckets')
assert(typeof analysis.canCertMultiSource === 'boolean', 'canCertMultiSource boolean')

assert(REPLICATION_V2_WAREHOUSES.includes('snowflake'), 'snowflake in v2 warehouses')
assert(REPLICATION_V2_WAREHOUSES.includes('databricks'), 'databricks in v2 warehouses')

const kickoff = defaultSoc2Kickoff()
assert(kickoff.phase === 'pre_kickoff', 'default kickoff phase')

assert(INDIA_ENTERPRISE_SKU.currency === 'INR', 'INR sku')
const india = getIndiaCompliancePack()
assert(india.dpaTemplate.includes('DPA') || india.dpaTemplate.includes('Data'), 'DPA template')
assert(india.residencyFaq.length > 100, 'residency FAQ content')

console.log(failed ? `\n${failed} failed` : '\nAll Sprint 8 tests passed')
process.exit(failed ? 1 : 0)
