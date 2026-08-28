/**
 * Sprint 7 — DQ dashboard, golden eval alerts, lineage export, drift fix drafts.
 */
import { computeHealthScoreFromSignals } from '../src/healthScorecard.js'
import {
  formatLineageExportMarkdown,
} from '../src/lineageExport.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const score = computeHealthScoreFromSignals({
  connectionScore: 80,
  schemaScore: 70,
  packMatchScore: 60,
  joinScore: 50,
  stewardScore: 40,
  kpiScore: 30,
  dashboardScore: 20,
  certScore: 10,
})
assert(score.score >= 0 && score.score <= 100, 'health score in range')
assert(score.breakdown.length >= 6, 'health breakdown widgets')

const bundle = {
  exportedAt: new Date().toISOString(),
  stats: { joinEdges: 5, dbtEdges: 2, biEdges: 1, jobPaths: 3, openColumnDrift: 1, certifiedCharts: 2 },
}
const md = formatLineageExportMarkdown(bundle)
assert(md.includes('Que lineage export'), 'markdown formatter')
assert(md.includes('Open column-impact drift'), 'markdown includes drift count')

console.log(failed ? `\n${failed} failed` : '\nAll Sprint 7 tests passed')
process.exit(failed ? 1 : 0)
