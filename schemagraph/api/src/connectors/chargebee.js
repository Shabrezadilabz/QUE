/**
 * Chargebee Billing API — fixture introspection (S12 design-partner priority #10).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

export async function introspectChargebee(config = {}) {
  const mode =
    config.mode || (config.apiKey || config.site ? 'live' : 'fixture')
  if (mode === 'live') {
    return introspectFromJsonFixture(
      { ...config, fixturesPath: config.fixturesPath },
      'fixtures/chargebee_demo.json',
      'chargebee',
    )
  }
  return introspectFromJsonFixture(
    config,
    'fixtures/chargebee_demo.json',
    'chargebee',
  )
}
