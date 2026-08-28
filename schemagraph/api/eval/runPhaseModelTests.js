/**
 * Phase P3.2 — Que Model IDE (unit tests, no DB).
 */
import {
  slugifyModelName,
  parseModelRefs,
  buildModelsSchemaYml,
} from '../src/queModel.js'

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

assert(slugifyModelName('Stg Orders!') === 'stg_orders', 'slugify model name')

const refs = parseModelRefs(
  "SELECT * FROM {{ ref('raw_orders') }} o JOIN customers c ON o.id = c.id",
)
assert(refs.includes('raw_orders'), 'parse ref()')
assert(refs.includes('customers'), 'parse from join')

const yml = buildModelsSchemaYml([
  { name: 'fct_revenue', description: 'Revenue mart', layer: 'mart' },
])
assert(yml.includes('fct_revenue'), 'schema yml includes model')

if (failed > 0) {
  console.error(`\nPhase Model tests FAILED (${failed})`)
  process.exit(1)
}
console.log('\nAll Phase Model tests passed')
