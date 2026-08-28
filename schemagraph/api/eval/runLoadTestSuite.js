/**
 * Sprint 11 — Load test entrypoint for CI (`npm run test:load`).
 */
import { runLoadTestSuite, LOAD_TEST_DEFAULTS } from '../src/loadTestSuite.js'

const concurrency = Number(process.env.QUE_LOAD_TEST_CONCURRENCY) || 50
const maxP95Ms = Number(process.env.QUE_LOAD_TEST_MAX_P95_MS) || LOAD_TEST_DEFAULTS.maxP95Ms

const report = await runLoadTestSuite({ concurrency, maxP95Ms })
console.log(JSON.stringify(report, null, 2))
if (!report.ok) {
  console.error(
    `Load test failed: p95=${report.p95Ms}ms threshold=${maxP95Ms}ms failures=${report.failures}`,
  )
  process.exit(1)
}
console.log(`Load test passed (${concurrency} workspaces, p95=${report.p95Ms}ms)`)
process.exit(0)
