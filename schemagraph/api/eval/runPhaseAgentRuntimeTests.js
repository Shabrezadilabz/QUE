/**
 * Que Agent runtime + SSM unified pack — unit tests (no DB).
 */
import { summarizeAgentRuntime, SSM_CONSUMERS } from '../src/agent/queAgentHub.js'
import {
  detectQueAgentIntent,
  detectQueAgentIntentWithSsm,
  buildSsmRoutingMeta,
} from '../src/queAgentRuntime.js'
import { validateContextPackStructure } from '../src/ssm/contextPackValidate.js'

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

const ready = summarizeAgentRuntime({
  enabled: true,
  validation: { ok: true, tableCount: 3, warnings: [] },
  tableCount: 8,
  sampleWarnings: [],
  intent: 'create_job',
})
assert(ready.status === 'ready', 'enabled + validation ok → ready')

const disabled = summarizeAgentRuntime({ enabled: false })
assert(disabled.status === 'unavailable', 'disabled → unavailable')

const review = summarizeAgentRuntime({
  enabled: true,
  validation: { ok: false, warnings: ['orders: no samples'] },
  tableCount: 2,
  sampleWarnings: ['orders: no samples'],
})
assert(review.status === 'review', 'sample warnings → review')

const pipeIntent = detectQueAgentIntent(
  'Build a daily pipeline and create job for revenue mart',
  { pageId: 'pipes' },
)
assert(pipeIntent?.autoExecute === true, 'pipeline job intent detected')

assert(
  typeof detectQueAgentIntentWithSsm === 'function',
  'SSM agent fallback exported',
)

const blocked = summarizeAgentRuntime({
  enabled: true,
  validation: { ok: false, warnings: ['orders: no samples'] },
  tableCount: 2,
  sampleWarnings: ['orders: no samples'],
  sampleGate: { blocked: true, code: 'samples_insufficient' },
})
assert(blocked.status === 'blocked', 'sample gate → blocked status')

const validation = validateContextPackStructure({
  pack: {
    tables: [
      {
        name: 'orders',
        columns: [{ name: 'id', samples: ['1', '2', '3', '4', '5'] }],
      },
    ],
  },
  focusedPack: {
    tables: [
      {
        name: 'orders',
        columns: [{ name: 'id', samples: ['1', '2', '3', '4', '5'] }],
      },
    ],
  },
})
assert(validation.tablesWithSamples === 1, 'pack validation counts samples')

assert(
  SSM_CONSUMERS.filter((c) => c.wired).length >= 4,
  'chat/genie/pipes/live wired',
)

const routing = buildSsmRoutingMeta({
  intent: 'create_job',
  ssmRoute: { routingSource: 'ml_trained', confidence: 0.91 },
})
assert(routing.routingSource === 'ml_trained', 'ssm routing meta from unified pack')
assert(routing.confidence === 0.91, 'ssm routing confidence')

if (failed > 0) {
  console.error(`\nPhase Agent runtime tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Agent runtime tests passed')
