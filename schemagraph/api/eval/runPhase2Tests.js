/**
 * Phase 2 — SSM-A/B unified context pack (unit tests, no DB).
 */
import {
  enforceMandatorySamples,
  buildJoinGraphJson,
  buildJoinGraphMermaid,
} from '../src/ssm/schemaContextService.js'
import { routeSsmIntent, compressWorkspaceEvents } from '../src/ssm/ssmRouter.js'
import {
  validateAgainstContextPack,
  validateContextPackStructure,
  SSM_SYSTEM_PROMPT_ANCHOR,
} from '../src/ssm/contextPackValidate.js'
import {
  evaluateSampleGate,
  formatSampleGateBlockMessage,
} from '../src/ssm/sampleGate.js'

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

const samplePack = {
  tables: [
    {
      name: 'orders',
      connection: 'Shop',
      columns: [
        { name: 'id', dataType: 'bigint', samples: ['1', '2', '3', '4', '5'] },
        { name: 'brand_id', dataType: 'bigint', samples: ['10', '11'] },
      ],
    },
    {
      name: 'brands',
      connection: 'Shop',
      columns: [{ name: 'id', dataType: 'bigint', samples: ['10'] }],
    },
  ],
  relationships: [
    {
      from: 'orders.brand_id',
      to: 'brands.id',
      type: 'explicit',
      status: 'accepted',
      confidence: 1,
    },
  ],
  stats: { tableCount: 2, columnCount: 3, relationshipCount: 1 },
}

const pinned = [
  {
    table: 'orders',
    columns: ['id', 'brand_id'],
    rows: [
      { id: '1', brand_id: '10' },
      { id: '2', brand_id: '11' },
      { id: '3', brand_id: '12' },
      { id: '4', brand_id: '13' },
      { id: '5', brand_id: '14' },
    ],
  },
]

const enriched = enforceMandatorySamples(samplePack, pinned)
assert(enriched.pack.tables[0].pinnedRowCount === 5, 'mandatory samples merged from pins')
assert(enriched.warnings.length === 0 || enriched.warnings.some((w) => w.includes('brands')), 'sample warnings tracked')

const graph = buildJoinGraphJson(samplePack)
assert(graph.nodeCount === 2 && graph.edgeCount === 1, 'join graph json')
const mermaid = buildJoinGraphMermaid(samplePack, ['orders', 'brands'])
assert(mermaid.includes('graph LR') && mermaid.includes('orders'), 'mermaid diagram')

const route = routeSsmIntent('create a job to combine orders and brands', {})
assert(route.intent === 'create_job', 'ssm intent create_job')
const metricRoute = routeSsmIntent('what is our revenue KPI?', {})
assert(metricRoute.intent === 'metric', 'ssm intent metric')

const summary = compressWorkspaceEvents([
  { eventType: 'sync_completed', meta: { connectionName: 'Shop' } },
  { eventType: 'chat_query', meta: { tableName: 'orders' } },
])
assert(summary.includes('sync_completed'), 'event compression')

const focused = { tables: samplePack.tables }
const validation = validateContextPackStructure({
  pack: enriched.pack,
  focusedPack: focused,
  pinnedSamples: pinned,
})
assert(validation.tablesWithSamples >= 1, 'context pack structure validation')

const allowCheck = validateAgainstContextPack(
  'SELECT o.id FROM orders o JOIN brands b ON o.brand_id = b.id',
  { focusedPack: focused },
)
assert(allowCheck.ok, 'sql allowed against context pack')

const blockCheck = validateAgainstContextPack(
  'SELECT * FROM phantom_table',
  { focusedPack: focused },
)
assert(!blockCheck.ok && blockCheck.unknown.includes('phantom_table'), 'sql blocked for unknown table')

assert(SSM_SYSTEM_PROMPT_ANCHOR.includes('ONLY use tables'), 'system prompt anchor')

const badValidation = validateContextPackStructure({
  pack: samplePack,
  focusedPack: { tables: samplePack.tables },
  pinnedSamples: [],
})
assert(!badValidation.ok, 'validation fails without enough samples')

const gateBlocked = evaluateSampleGate({
  validation: badValidation,
  sampleWarnings: ['brands: no scrubbed samples'],
  settings: { enforceMandatorySamples: true },
  tableCount: 2,
})
assert(gateBlocked.blocked === true, 'sample gate blocks AI')
assert(
  formatSampleGateBlockMessage(gateBlocked).includes('Sample gate'),
  'sample gate message',
)

const gateOpen = evaluateSampleGate({
  validation: {
    ok: true,
    warnings: [],
    tablesWithSamples: 1,
    tableCount: 1,
    minSamples: 5,
    maxSamples: 10,
  },
  sampleWarnings: [],
  settings: { enforceMandatorySamples: true },
  tableCount: 1,
})
assert(gateOpen.blocked === false, 'sample gate open when validation ok')

if (failed > 0) {
  console.error(`\nPhase 2 tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase 2 tests passed')
