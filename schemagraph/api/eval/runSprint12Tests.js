/**
 * Sprint 12 — Phase 2 finish line tests (no DB).
 */
import { getExtendedConnectorMatrix, DESIGN_PARTNER_CONNECTOR_PRIORITY } from '../src/connectorLongTail.js'
import {
  forkPackDefinition,
  diffPackDefinitions,
  mergePackForkVariants,
} from '../src/packStudioFork.js'
import { getIndustryPack } from '../src/packs/index.js'
import {
  listBiTemplateMarketplace,
  buildEmbedSdkSnippet,
  EMBED_SDK_VERSION,
} from '../src/reportStudioEmbed.js'
import {
  buildPublicEvalSnapshot,
  buildAgentSuccessMetrics,
} from '../src/publicEvalDashboard.js'
import { getGlobalGtmPack, GLOBAL_CASE_STUDIES } from '../src/globalGtm.js'
import { defaultSoc2Kickoff } from '../src/soc2Kickoff.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const matrix = getExtendedConnectorMatrix()
assert(matrix.connectorCount >= 25, '25+ connector types')
assert(matrix.liveConnectorCount >= 11, '11+ live connectors')
assert(DESIGN_PARTNER_CONNECTOR_PRIORITY.length === 10, 'top 10 partner requests')

const base = getIndustryPack('ecommerce-v1')
const fork = forkPackDefinition(base, { suffix: 'india', displayName: 'India D2C fork' })
assert(fork.forkedFrom === 'ecommerce-v1', 'fork lineage')
assert(fork.id.includes('india'), 'fork id suffix')

const diff = diffPackDefinitions(base, fork)
assert(diff.leftId === base.id, 'diff left id')

const merged = mergePackForkVariants(base, fork)
assert(merged.blendedFrom?.length === 2, 'merge two packs')

const marketplace = listBiTemplateMarketplace()
assert(marketplace.items.length >= 4, 'BI template marketplace')
assert(marketplace.version === EMBED_SDK_VERSION, 'embed sdk version')

const snippet = buildEmbedSdkSnippet({ token: 'tok-demo', baseUrl: 'https://app.que.dev' })
assert(snippet.html.includes('iframe'), 'embed html')
assert(snippet.react.includes('QueEmbed'), 'embed react')

const agent = buildAgentSuccessMetrics({ sessions: 50, succeeded: 43 })
assert(agent.successRatePct === 86, 'agent success rate')

const pub = buildPublicEvalSnapshot(
  { scoreboard: { lastGoldenRecall: 0.91, greenEligible: true }, joins: { promoteRatePct: 72 }, jobs: { successRatePct: 88 } },
  { sessions: 50, succeeded: 43 },
)
assert(pub.goldenRecallPct === 91, 'public golden recall')
assert(pub.certSla.meetsTarget === true, 'cert SLA target')

const gtm = getGlobalGtmPack()
assert(gtm.pricing.currency === 'USD', 'USD pricing')
assert(GLOBAL_CASE_STUDIES.length >= 3, 'case studies')
assert(gtm.caseStudies.some((c) => c.region === 'United States'), 'US case study')
assert(gtm.caseStudies.some((c) => c.region === 'European Union'), 'EU case study')

const kickoff = defaultSoc2Kickoff()
assert(kickoff.phase === 'pre_kickoff', 'soc2 default phase')

console.log(failed ? `\n${failed} failed` : '\nAll Sprint 12 tests passed')
process.exit(failed ? 1 : 0)
