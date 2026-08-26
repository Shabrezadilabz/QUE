/**
 * Phase 5 — Monk autopilot cert loop + pack policy gates.
 * Run: node eval/runPhase5Tests.js
 */
import { getIndustryPack } from '../src/packs/index.js'
import {
  getPackAutopilotMinRecall,
  getMonkAutopilotPromoteMinConfidence,
  allowMonkAutopilotCrossSource,
  shouldEnableMonkAutopilot,
} from '../src/packPolicies.js'
import { formatMonkEvidenceMarkdown } from '../src/monkEvidenceExport.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const ecommerce = getIndustryPack('ecommerce-v1')
const healthcare = getIndustryPack('healthcare-v1')
const finance = getIndustryPack('finance-v1')

assert(shouldEnableMonkAutopilot(ecommerce), 'ecommerce autopilot enabled')
assert(getMonkAutopilotPromoteMinConfidence(healthcare) >= 0.95, 'healthcare 95% promote gate')
assert(allowMonkAutopilotCrossSource(healthcare) === false, 'healthcare blocks cross-source')
assert(allowMonkAutopilotCrossSource(ecommerce) === true, 'ecommerce allows cross-source')
assert(getPackAutopilotMinRecall(finance) <= 0.45, 'finance autopilot recall bootstrap')

const md = formatMonkEvidenceMarkdown({
  generatedAt: new Date().toISOString(),
  workspaceId: 'test',
  controls: [{ id: 'MONK-1', title: 'Log', status: 'ok', evidence: '1 run' }],
  runs: [{ runId: 'r1', packId: 'ecommerce-v1', status: 'completed', matchScore: 100, events: [] }],
})
assert(md.includes('MONK-1'), 'evidence markdown includes controls')

console.log(failed ? `\n${failed} failed` : '\nAll Phase 5 tests passed')
process.exit(failed ? 1 : 0)
