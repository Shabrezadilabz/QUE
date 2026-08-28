/**
 * Google Ads API — fixture introspection (S12 design-partner priority #3).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

export async function introspectGoogleAds(config = {}) {
  const mode =
    config.mode ||
    (config.developerToken || config.refreshToken || config.customerId
      ? 'live'
      : 'fixture')
  if (mode === 'live') {
    return introspectFromJsonFixture(
      { ...config, fixturesPath: config.fixturesPath },
      'fixtures/google_ads_demo.json',
      'google_ads',
    )
  }
  return introspectFromJsonFixture(
    config,
    'fixtures/google_ads_demo.json',
    'google_ads',
  )
}
