/**
 * Functional / security automated suite (no live warehouse required).
 * Run: npm run test:functional
 */
import { isProduction, assertProductionSecrets, corsOrigins } from '../src/env.js'
import {
  sealConnectionConfig,
  unsealConnectionConfig,
  publicConnectionConfig,
} from '../src/connectionCrypto.js'
import {
  buildSchemaOnlyAttestation,
  verifyAttestationSignature,
} from '../src/exporters/attestation.js'
import { extractJoinPairsFromSql } from '../src/connectors/databricksQueryJoins.js'
import { scrubSampleValue } from '../src/privacy/sampleScrub.js'
import { prepareReadonlySql } from '../src/liveExec.js'
import { authDisabled } from '../src/auth.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

// --- env / auth bypass ---
const prevEnv = process.env.QUE_ENV
const prevAuth = process.env.STITCH_AUTH_DISABLED
process.env.QUE_ENV = 'production'
process.env.STITCH_AUTH_DISABLED = 'true'
assert(authDisabled() === false, 'auth bypass forced off in production')
process.env.QUE_ENV = prevEnv
process.env.STITCH_AUTH_DISABLED = prevAuth

process.env.QUE_ENV = 'production'
process.env.QUE_SECRETS_KEY = ''
process.env.QUE_ATTESTATION_HMAC_SECRET = ''
delete process.env.QUE_CORS_ORIGINS
let threw = false
try {
  assertProductionSecrets()
} catch {
  threw = true
}
assert(threw, 'assertProductionSecrets throws without keys')
process.env.QUE_SECRETS_KEY = 'functional-test-secrets-key-32chars!!'
process.env.QUE_ATTESTATION_HMAC_SECRET = 'functional-test-attestation-hmac'
threw = false
try {
  assertProductionSecrets()
} catch {
  threw = true
}
assert(threw, 'assertProductionSecrets throws without CORS origins')
process.env.QUE_CORS_ORIGINS = 'https://app.example.com'
threw = false
try {
  assertProductionSecrets()
} catch (e) {
  threw = true
  console.error(e.message)
}
assert(!threw, 'assertProductionSecrets passes with keys + CORS')
// keep STITCH_AUTH_DISABLED true would still fail
process.env.STITCH_AUTH_DISABLED = 'true'
threw = false
try {
  assertProductionSecrets()
} catch {
  threw = true
}
assert(threw, 'assertProductionSecrets blocks AUTH_DISABLED in prod')
process.env.STITCH_AUTH_DISABLED = prevAuth
process.env.QUE_ENV = prevEnv || 'development'

// --- connection seal ---
process.env.QUE_SECRETS_KEY =
  process.env.QUE_SECRETS_KEY || 'functional-test-secrets-key-32chars!!'
const sealed = sealConnectionConfig({
  host: 'db.example',
  token: 'secret-token-value',
  password: 'pw123456',
})
assert(sealed.__enc && !sealed.token && !sealed.password, 'secrets sealed into __enc')
assert(sealed.host === 'db.example', 'non-secret fields retained')
const opened = unsealConnectionConfig(sealed)
assert(opened.token === 'secret-token-value', 'unseal restores token')
assert(opened.password === 'pw123456', 'unseal restores password')
const pub = publicConnectionConfig(sealed)
assert(pub.hasSecrets === true, 'public hasSecrets')
assert(!pub.config.__enc, 'public strips __enc')
assert(pub.config.token !== 'secret-token-value', 'public never echoes token')

// --- attestation ---
process.env.QUE_ATTESTATION_HMAC_SECRET =
  process.env.QUE_ATTESTATION_HMAC_SECRET || 'functional-test-attestation-hmac'
const att = buildSchemaOnlyAttestation({
  workspaceId: 'ws',
  job: { id: 'j', title: 't', tables: ['a'], sources: ['pg'] },
  joins: [{ id: 'r1' }],
  format: 'dbt-pr',
})
assert(verifyAttestationSignature(att).ok, 'attestation verifies')

// --- SQL guards / joins / scrub ---
try {
  prepareReadonlySql('DROP TABLE x')
  assert(false, 'DROP should throw')
} catch {
  assert(true, 'blocks DROP')
}
assert(
  extractJoinPairsFromSql(
    'select * from orders o join customers c on o.customer_id = c.id',
  ).length >= 1,
  'join extract',
)
assert(String(scrubSampleValue('a@b.com')).startsWith('email_'), 'scrub email')

// --- cors helper ---
process.env.QUE_CORS_ORIGINS = 'https://app.example.com'
assert(corsOrigins().includes('https://app.example.com'), 'cors origins parse')
delete process.env.QUE_CORS_ORIGINS

if (failed) {
  console.error(`[Que] functional tests FAILED (${failed})`)
  process.exit(1)
}
console.log('[Que] functional tests PASSED')

// silence unused in case tree-shaken
void isProduction
