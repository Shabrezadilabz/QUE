/**
 * Sprint 6 — vertical packs, proof datasets, marketplace→Monk, Genie RS-2.
 */
import { listIndustryPacks, getIndustryPack } from '../src/packs/index.js'
import { listMarketplaceCatalog } from '../src/industryTemplates.js'
import {
  listProofDatasets,
  loadGoldenPairsForPack,
  getProofDataset,
} from '../src/proofDatasets.js'
import {
  resolveMonkPackId,
} from '../src/marketplaceMonk.js'
import {
  detectPackIdFromPrompt,
} from '../src/genieDashboardDraft.js'
import { getPackDashboardTemplates } from '../src/dashboardTemplates.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const monkPacks = listIndustryPacks()
assert(monkPacks.length >= 10, `≥10 Monk packs (${monkPacks.length})`)

const catalog = listMarketplaceCatalog()
assert(catalog.total >= 10, `≥10 marketplace items (${catalog.total})`)
assert(catalog.monkPackCount >= 10, `monkPackCount tracked (${catalog.monkPackCount})`)

const withMonk = catalog.packs.filter((p) => p.hasMonk || p.monkPackId)
assert(withMonk.length >= 8, `≥8 packs linked to Monk (${withMonk.length})`)

const finPairs = loadGoldenPairsForPack(getIndustryPack('finance-v1'))
assert(finPairs.length >= 2, `finance golden pairs (${finPairs.length})`)

const hcPairs = loadGoldenPairsForPack(getIndustryPack('healthcare-v1'))
assert(hcPairs.length >= 2, `healthcare golden pairs (${hcPairs.length})`)

const proof = listProofDatasets()
assert(proof.length === 2, 'two proof datasets listed')

const finProof = getProofDataset('finance')
assert(finProof?.schema?.tables?.length >= 2, 'finance anonymized schema')

assert(
  resolveMonkPackId('finance-reconciliation') === 'finance-v1',
  'template → monk pack resolve',
)
assert(
  resolveMonkPackId('india-gst-v1') === 'india-gst-v1',
  'monk pack id passthrough',
)

assert(
  detectPackIdFromPrompt('Build GST dashboard for India ITC') === 'india-gst-v1',
  'Genie detects India GST pack',
)
assert(
  detectPackIdFromPrompt('logistics SLA late shipments') === 'logistics-v1',
  'Genie detects logistics pack',
)

const finDash = getPackDashboardTemplates(getIndustryPack('finance-v1'))
assert(finDash[0]?.widgets?.length >= 3, 'finance dashboard template widgets')

console.log(failed ? `\n${failed} failed` : '\nAll Sprint 6 tests passed')
process.exit(failed ? 1 : 0)
