/**
 * Phase 6 — Pack Studio + replication + exports.
 */
import { mergePackVariants, buildBlendedPackFromRanked } from '../src/packVariantMerger.js'
import { getIndustryPack } from '../src/packs/index.js'
import { scorePackAgainstSchema } from '../src/templateMatcher.js'
import { exportLookerPack, exportMetabasePack } from '../src/biPlatformExport.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const ecom = getIndustryPack('ecommerce-v1')
const fin = getIndustryPack('finance-v1')
const merged = mergePackVariants([ecom, fin], [
  { packId: 'ecommerce-v1', weight: 0.6 },
  { packId: 'finance-v1', weight: 0.4 },
])
assert(merged.kpis.length >= ecom.kpis.length, 'merged pack keeps ecommerce KPIs')
assert(merged.policies.noAutoMaterialize === true, 'finance policy merges strict')
assert(merged.blendedFrom?.length === 2, 'blendedFrom tracks sources')

const ranked = [
  { pack: { id: 'ecommerce-v1', displayName: 'Ecom' }, score: 0.9, scorePct: 90, canRunMonk: true, missing: [] },
  { pack: { id: 'finance-v1', displayName: 'Fin' }, score: 0.5, scorePct: 50, canRunMonk: false, missing: ['ledger'] },
]
const blend = buildBlendedPackFromRanked(ranked)
assert(blend?.tableMatchers?.length >= 4, 'blended matchers from two packs')

const sportedge = scorePackAgainstSchema(
  [{ name: 'orders' }, { name: 'brands' }],
  ecom,
)
assert(sportedge.matches.length >= 2, 'sportedge maps orders and brands')

console.log(failed ? `\n${failed} failed` : '\nAll Phase 6 tests passed')
process.exit(failed ? 1 : 0)
