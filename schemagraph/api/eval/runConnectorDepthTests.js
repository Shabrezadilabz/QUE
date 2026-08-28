/**
 * S5 connector depth unit tests.
 * Run: node eval/runConnectorDepthTests.js
 */
import {
  applySalesforceFieldMap,
} from '../src/connectors/salesforce.js'
import { getConnectorMatrix } from '../src/connectorMatrix.js'
import { prepareReadonlySql } from '../src/liveExec.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const tables = [
  {
    name: 'Account',
    columns: [
      { name: 'Id' },
      { name: 'Name' },
      { name: 'Industry' },
      { name: 'SecretField' },
    ],
  },
]
const mapped = applySalesforceFieldMap(tables, {
  Account: ['Id', 'Name', 'Industry'],
})
assert(mapped[0].columns.length === 3, 'fieldMap filters columns')

const matrix = getConnectorMatrix()
assert(matrix.rows.length >= 8, 'connector matrix has rows')
assert(matrix.queConnectors.some((c) => c.id === 'salesforce'), 'SF in que list')
assert(matrix.queConnectors.some((c) => c.id === 'bigquery'), 'BQ in que list')

const sql = prepareReadonlySql('SELECT * FROM `proj.ds.orders`')
assert(/\blimit\s+\d+/i.test(sql), 'readonly sql capped')

console.log(failed ? `\n${failed} failed` : '\nAll connector depth tests passed')
process.exit(failed ? 1 : 0)
