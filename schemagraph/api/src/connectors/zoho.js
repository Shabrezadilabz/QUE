/**
 * Zoho Books / CRM — fixture introspection (S9 India commerce).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

export async function introspectZoho(config = {}) {
  const mode = config.mode || (config.orgId && config.accessToken ? 'live' : 'fixture')
  if (mode === 'live') {
    return introspectFromJsonFixture(
      { ...config, fixturesPath: config.fixturesPath },
      'fixtures/zoho_demo.json',
      'zoho',
    )
  }
  return introspectFromJsonFixture(config, 'fixtures/zoho_demo.json', 'zoho')
}
