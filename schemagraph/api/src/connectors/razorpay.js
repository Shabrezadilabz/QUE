/**
 * Razorpay payments API — fixture introspection (S9 India commerce).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

export async function introspectRazorpay(config = {}) {
  const mode = config.mode || (config.keyId && config.keySecret ? 'live' : 'fixture')
  if (mode === 'live') {
    return introspectFromJsonFixture(
      { ...config, fixturesPath: config.fixturesPath },
      'fixtures/razorpay_demo.json',
      'razorpay',
    )
  }
  return introspectFromJsonFixture(config, 'fixtures/razorpay_demo.json', 'razorpay')
}
