/**
 * Stripe Billing API — fixture introspection (S12 design-partner priority #2).
 */
import { introspectFromJsonFixture } from './fixtureIntrospect.js'

export async function introspectStripe(config = {}) {
  const mode =
    config.mode || (config.secretKey || config.apiKey ? 'live' : 'fixture')
  if (mode === 'live') {
    return introspectFromJsonFixture(
      { ...config, fixturesPath: config.fixturesPath },
      'fixtures/stripe_demo.json',
      'stripe',
    )
  }
  return introspectFromJsonFixture(config, 'fixtures/stripe_demo.json', 'stripe')
}
