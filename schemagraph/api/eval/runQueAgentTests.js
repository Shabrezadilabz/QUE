/**
 * Smoke tests for unified Que Agent intent detection.
 */
import { detectQueAgentIntent } from '../src/queAgentRuntime.js'
import { parseAgentIntent } from '../src/agentSessions.js'
import { parseBiStyleFromPrompt } from '../src/certifiedBi.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const jobIntent = detectQueAgentIntent(
  'Create a job joining orders and brands',
  { pageId: 'chat' },
)
ok(jobIntent?.autoExecute === true, 'create job autoExecute')
ok(jobIntent?.kind === 'general', 'create job kind')

const biIntent = detectQueAgentIntent(
  'Build a blue bar chart dashboard by revenue',
  { pageId: 'bi' },
)
ok(biIntent?.kind === 'bi', 'bi build kind')

const editIntent = detectQueAgentIntent('Update this job SQL to add tax column', {
  pageId: 'jobs',
  jobId: 'abc-123',
})
ok(editIntent?.kind === 'edit_job', 'edit job with page context')

const parsed = parseAgentIntent(
  'Materialize table and build BI report with pie chart in green',
  {},
)
ok(parsed.tools.some((t) => t.id === 'materialize_job'), 'parse materialize tool')
ok(parsed.tools.some((t) => t.id === 'scaffold_bi'), 'parse scaffold_bi tool')

const style = parseBiStyleFromPrompt(
  'Build bar and line charts in blue and green by region measure revenue',
)
ok(style.chartTypes?.includes('bar'), 'BI style bar')
ok(style.colors?.includes('#2563eb'), 'BI style blue')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll Que Agent smoke tests passed')
