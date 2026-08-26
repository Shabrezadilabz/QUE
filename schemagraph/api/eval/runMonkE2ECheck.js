/**
 * Monk E2E readiness checklist (local module smoke — run against live Neon separately).
 * Run: node eval/runMonkE2ECheck.js
 */
import { listFullIndustryPacks } from '../src/packs/index.js'
import { runMonkAutopilotCertLoop } from '../src/monkAutopilot.js'
import { buildBlendedPackFromRanked } from '../src/packVariantMerger.js'
import { learnAndSyncGoldenPairs } from '../src/learnGoldenPairs.js'
import { exportLookerPack } from '../src/biPlatformExport.js'
import { mergePackVariants } from '../src/packVariantMerger.js'

const checks = []

function ok(name, cond) {
  checks.push({ name, ok: cond })
  console.log(cond ? `✓ ${name}` : `✗ ${name}`)
}

ok('4+ industry packs', listFullIndustryPacks().length >= 4)
ok('autopilot module loads', typeof runMonkAutopilotCertLoop === 'function')
ok('pack blend loads', typeof buildBlendedPackFromRanked === 'function')
ok('golden learn loads', typeof learnAndSyncGoldenPairs === 'function')
ok('looker export loads', typeof exportLookerPack === 'function')

const ecom = listFullIndustryPacks()[0]
const fin = listFullIndustryPacks()[1]
ok('merge packs', Boolean(mergePackVariants([ecom, fin], [
  { packId: ecom.id, weight: 0.5 },
  { packId: fin.id, weight: 0.5 },
]).id))

console.log('\n--- Production E2E (manual on Neon) ---')
console.log('1. Apply migrations: 042, 043, 046, 047')
console.log('2. Bootstrap SportEdge Postgres connection')
console.log('3. POST /monk/start { packId: ecommerce-v1 }')
console.log('4. Verify autopilot cert + dbt export events in Monk feed')
console.log('5. CEO chat: "What is Puma revenue?"')
console.log('6. /pack-studio — save blend, learn golden pairs, export Looker')

const failed = checks.filter((c) => !c.ok).length
process.exit(failed ? 1 : 0)
