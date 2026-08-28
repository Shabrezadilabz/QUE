/**
 * Que Platform Hub — unit tests (no DB).
 */
import { buildPlatformModulePages } from '../src/platform/platformModuleSignals.js'
import {
  QUE_PLATFORM_MODULES,
  mapPlatformModuleCards,
} from '../src/platform/quePlatformHub.js'

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

const signals = {
  syncSched: { connections: [{ id: '1' }, { id: '2' }] },
  models: [{ status: 'ready' }, { status: 'draft' }],
  catalogTotal: 42,
  pipeProposals: [{ status: 'pending' }],
  pendingPipes: [{ status: 'pending' }],
  worker: { queued: 1, failed7d: 0, warehouseProvisioned: true },
  driftOpen: [],
  goldenSched: { lastRecall: 0.82 },
  loadErrors: [],
  chartCount: 5,
  gridTables: 12,
  warehouse: {
    tableCount: 4,
    replicateDefaultOn: true,
    readiness: { status: 'ready', label: 'Warehouse ready' },
  },
}

const pages = buildPlatformModulePages(signals, { score: 78, signals: { dashboardScore: 80 } })
assert(pages.load.status === 'ready', 'load ready with WH tables')
assert(pages.load.headline.includes('4 raw'), 'load WH headline')

const pipesOnly = buildPlatformModulePages({
  ...signals,
  warehouse: {
    tableCount: 0,
    readiness: { status: 'review', label: 'Sync a connector' },
  },
})
assert(pipesOnly.load.status === 'review', 'load review until raw tables land')
assert(pages.model.headline.includes('2 SQL'), 'model count headline')
assert(pages.pipes.status === 'review', 'pending pipe → review')
assert(pages.catalog.headline.includes('42'), 'catalog asset count')

const cards = mapPlatformModuleCards(pages)
assert(cards.length === QUE_PLATFORM_MODULES.length, 'six module cards')
assert(cards[0].id === 'load' && cards[0].icon === '⇅', 'load card metadata')
assert(cards.every((c) => c.route && c.label), 'cards have route + label')

assert(QUE_PLATFORM_MODULES.length === 6, 'six platform modules defined')

if (failed > 0) {
  console.error(`\nPhase Platform Hub tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Platform Hub tests passed')
