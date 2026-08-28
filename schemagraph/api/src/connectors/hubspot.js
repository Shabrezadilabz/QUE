/**
 * HubSpot CRM API — fixture introspection (S12 design-partner priority #1).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

export async function introspectHubspot(config = {}) {
  const mode =
    config.mode || (config.accessToken || config.privateAppToken ? 'live' : 'fixture')
  if (mode === 'live') {
    return introspectFromJsonFixture(
      { ...config, fixturesPath: config.fixturesPath },
      'fixtures/hubspot_demo.json',
      'hubspot',
    )
  }
  return introspectFromJsonFixture(config, 'fixtures/hubspot_demo.json', 'hubspot')
}
