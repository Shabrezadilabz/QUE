/**
 * Pack Studio hub — unit tests (no DB).
 */
import {
  summarizePackStudioReadiness,
  PACK_STUDIO_EXPORT_TARGETS,
} from '../src/packStudio/packStudioHub.js'

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

const ready = summarizePackStudioReadiness({
  ranked: [{ packId: 'ecommerce-v1', displayName: 'Ecom', scorePct: 82 }],
  goldenPairCount: 5,
  pipelineCount: 2,
  customPackCount: 1,
  certificationStatus: 'passed',
})
assert(ready.status === 'ready', 'high score + golden + pipelines → ready')
assert(ready.topPackScore === 82, 'top pack score')

const empty = summarizePackStudioReadiness({ ranked: [] })
assert(empty.status === 'empty', 'no data → empty')

const review = summarizePackStudioReadiness({
  ranked: [{ packId: 'x', scorePct: 55 }],
  goldenPairCount: 1,
})
assert(review.status === 'review', 'partial data → review')

assert(PACK_STUDIO_EXPORT_TARGETS.length >= 4, 'export targets defined')

if (failed > 0) {
  console.error(`\nPhase Pack Studio hub tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Pack Studio hub tests passed')
