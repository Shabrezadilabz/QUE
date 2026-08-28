/**
 * S4 — dbt bundle v2 structure tests (no warehouse / dbt CLI).
 * Run: node eval/runDbtBundleTests.js
 */
import {
  buildDbtProjectYml,
  buildProfilesExample,
  buildGraphSourcesYml,
  buildDbtReadme,
  validateDbtBundleStructure,
} from '../src/exporters/dbtBundleV2.js'
import {
  extractDbtEdges,
  extractDbtColumnRefs,
} from '../src/exporters/dbtManifestAssist.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const project = buildDbtProjectYml('test_proj')
assert(project.includes('name:'), 'dbt_project has name')
assert(project.includes('profile:'), 'dbt_project has profile')

const profiles = buildProfilesExample()
assert(profiles.includes('env_var'), 'profiles uses env_var')

const sources = buildGraphSourcesYml([
  {
    name: 'postgres_main',
    connection: 'Postgres',
    type: 'postgres',
    tables: [{ name: 'orders', identifier: 'orders' }],
  },
])
assert(sources.includes('orders'), 'graph sources yml lists table')

const readme = buildDbtReadme('ws-1', 3, 2)
assert(readme.includes('dbt run'), 'readme has dbt run')

const mockBundle = {
  files: [
    { path: 'dbt_project.yml', content: project },
    { path: 'profiles.yml.example', content: profiles },
    { path: 'models/que/que_test.sql', content: 'select 1' },
    { path: 'models/sources_graph.yml', content: sources },
    { path: 'models/que/staging/stg_orders.sql', content: 'select 1' },
  ],
}
const validation = validateDbtBundleStructure(mockBundle)
assert(validation.ok, `bundle structure valid (${validation.errors.join(', ')})`)

const manifest = {
  nodes: {
    'model.pkg.orders': {
      name: 'orders',
      alias: 'orders',
      depends_on: { nodes: ['model.pkg.customers'] },
      columns: {
        customer_id: { name: 'customer_id', description: 'fk' },
      },
    },
    'model.pkg.customers': {
      name: 'customers',
      alias: 'customers',
      columns: { id: { name: 'id' } },
    },
  },
}
const edges = extractDbtEdges(manifest)
assert(edges.length >= 1, 'manifest edges extracted')

const colRefs = extractDbtColumnRefs(manifest)
assert(colRefs.length >= 1, 'manifest column refs extracted')

console.log(failed ? `\n${failed} failed` : '\nAll dbt bundle v2 tests passed')
process.exit(failed ? 1 : 0)
