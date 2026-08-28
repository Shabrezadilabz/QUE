/**
 * S5 connector depth unit tests.
 * Run: node eval/runConnectorDepthTests.js
 */
import {
  applySalesforceFieldMap,
} from '../src/connectors/salesforce.js'
import { introspectStripe } from '../src/connectors/stripe.js'
import { introspectHubspot } from '../src/connectors/hubspot.js'
import { introspectShopify } from '../src/connectors/shopify.js'
import { introspectMysql } from '../src/connectors/mysql.js'
import { introspectChargebee } from '../src/connectors/chargebee.js'
import { introspectGoogleAds } from '../src/connectors/googleAds.js'
import { getConnectorMatrix } from '../src/connectorMatrix.js'
import { getExtendedConnectorMatrix } from '../src/connectorLongTail.js'
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
assert(matrix.queConnectors.some((c) => c.id === 'stripe'), 'Stripe in que list')
assert(matrix.queConnectors.some((c) => c.id === 'hubspot'), 'HubSpot in que list')
assert(matrix.queConnectors.some((c) => c.id === 'mysql'), 'MySQL in que list')
assert(matrix.queConnectors.some((c) => c.id === 'chargebee'), 'Chargebee in que list')
assert(matrix.queConnectors.some((c) => c.id === 'google_ads'), 'Google Ads in que list')

const extended = getExtendedConnectorMatrix()
assert(extended.liveConnectorCount >= 16, 'extended live connector count')

const stripe = await introspectStripe({})
assert(stripe.tables.length >= 3, 'stripe fixture tables')
assert(stripe.foreignKeys.length >= 2, 'stripe fixture fks')

const hubspot = await introspectHubspot({})
assert(hubspot.tables.some((t) => t.name === 'deals'), 'hubspot deals table')

const shopify = await introspectShopify({})
assert(shopify.tables.some((t) => t.name === 'orders'), 'shopify orders table')

const mysql = await introspectMysql({ mode: 'fixture' })
assert(mysql.tables.length >= 4, 'mysql fixture tables')
assert(mysql.foreignKeys.some((fk) => fk.fromTable === 'order_items'), 'mysql order_items fk')

const chargebee = await introspectChargebee({})
assert(chargebee.tables.some((t) => t.name === 'subscriptions'), 'chargebee subscriptions table')
assert(chargebee.foreignKeys.some((fk) => fk.fromTable === 'transactions'), 'chargebee transaction fks')

const googleAds = await introspectGoogleAds({})
assert(googleAds.tables.some((t) => t.name === 'campaign_stats_daily'), 'google ads campaign stats')
assert(googleAds.foreignKeys.some((fk) => fk.fromTable === 'ad_groups'), 'google ads ad group fks')

const sql = prepareReadonlySql('SELECT * FROM `proj.ds.orders`')
assert(/\blimit\s+\d+/i.test(sql), 'readonly sql capped')

console.log(failed ? `\n${failed} failed` : '\nAll connector depth tests passed')
process.exit(failed ? 1 : 0)
