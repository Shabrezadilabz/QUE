/**
 * Sprint 10 — Orchestration mesh, reverse ETL, RS-5, Looker merge kit.
 */
import {
  buildMonkStartPayload,
  getKestraMonkRecipe,
  getN8nMonkRecipe,
  ORCHESTRATOR_KINDS,
} from '../src/orchestratorRecipes.js'
import { PARTNER_INGEST_SOURCES } from '../src/partnerIngestHook.js'
import {
  buildReverseEtlPlanFromDataset,
  REVERSE_ETL_DESTINATIONS,
} from '../src/reverseEtl.js'
import {
  applyBoardParameterDefaults,
  BOARD_LAYOUT_PRESETS,
  defaultBoardParameters,
} from '../src/reportStudioRefresh.js'
import { buildLookerMergeKitFromExport } from '../src/lookerMergeKit.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const monk = buildMonkStartPayload('ws-1', { packId: 'ecommerce-v1' })
assert(monk.event === 'que.monk.start', 'monk payload event')
assert(monk.api.path.includes('/monk/start'), 'monk api path')

const kestra = getKestraMonkRecipe('ws-1')
assert(kestra.yaml.includes('start_monk'), 'kestra yaml task')
assert(kestra.yaml.includes('monk/start'), 'kestra monk uri')

const n8n = getN8nMonkRecipe('ws-1')
assert(n8n.workflow.nodes.length >= 2, 'n8n workflow nodes')

assert(ORCHESTRATOR_KINDS.includes('kestra'), 'kestra kind')
assert(PARTNER_INGEST_SOURCES.includes('fivetran'), 'fivetran partner')

const retl = buildReverseEtlPlanFromDataset(
  { id: 'd1', name: 'brand mart', certified: true },
  { destination: 'salesforce' },
)
assert(retl.status === 'ready', 'reverse etl ready')
assert(REVERSE_ETL_DESTINATIONS.includes('hubspot'), 'hubspot destination')

const params = applyBoardParameterDefaults(defaultBoardParameters(), {
  brand: 'PUMA',
})
assert(params.brand === 'PUMA', 'board param override')
assert(Object.keys(BOARD_LAYOUT_PRESETS).length >= 3, 'layout presets')

const kit = buildLookerMergeKitFromExport({
  disclaimer: 'test',
  files: [{ path: 'views/a.view.lkml', content: 'view: a {}' }],
  lookml: { explores: [{ name: 'a' }] },
})
assert(kit.fileCount === 1, 'merge kit files')
assert(kit.instructions.steps.length >= 4, 'merge instructions')

console.log(failed ? `\n${failed} failed` : '\nAll Sprint 10 tests passed')
process.exit(failed ? 1 : 0)
