/**
 * Shopify Admin API — fixture introspection (S9 India commerce).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

export async function introspectShopify(config = {}) {
  const mode = config.mode || (config.shopDomain && config.accessToken ? 'live' : 'fixture')
  if (mode === 'live') {
    return introspectFromJsonFixture(
      { ...config, fixturesPath: config.fixturesPath },
      'fixtures/shopify_demo.json',
      'shopify',
    )
  }
  return introspectFromJsonFixture(config, 'fixtures/shopify_demo.json', 'shopify')
}
