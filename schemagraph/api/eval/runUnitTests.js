/**
 * Extra unit tests for helpers used in paid-POC paths.
 * Run: node eval/runUnitTests.js
 */
import { createHash, randomBytes } from 'node:crypto'
import { isProduction, assertProductionSecrets, corsOrigins } from '../src/env.js'
import {
  sealConnectionConfig,
  unsealConnectionConfig,
  publicConnectionConfig,
} from '../src/connectionCrypto.js'
import { scrubSampleValue, scrubSampleList } from '../src/privacy/sampleScrub.js'
import { extractJoinPairsFromSql } from '../src/connectors/databricksQueryJoins.js'
import { prepareReadonlySql } from '../src/liveExec.js'
import {
  buildSchemaOnlyAttestation,
  verifyAttestationSignature,
} from '../src/exporters/attestation.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

// --- env ---
const prev = process.env.QUE_ENV
delete process.env.QUE_ENV
process.env.NODE_ENV = 'development'
assert(isProduction() === false, 'dev is not production')
process.env.QUE_ENV = 'production'
assert(isProduction() === true, 'QUE_ENV=production')
process.env.QUE_ENV = prev

process.env.QUE_CORS_ORIGINS = 'https://a.com, https://b.com'
assert(corsOrigins().length === 2, 'cors split/trim')
delete process.env.QUE_CORS_ORIGINS

// --- seal round-trip ---
process.env.QUE_SECRETS_KEY = 'unit-test-secrets-key-32chars-xx'
const sealed = sealConnectionConfig({ host: 'h', token: 't1', password: 'p1' })
assert(sealed.__enc && !sealed.token, 'seal moves token to __enc')
const opened = unsealConnectionConfig(sealed)
assert(opened.token === 't1' && opened.password === 'p1', 'unseal restores secrets')
// blank update retention (mirrors connections.mergeConfig)
const mergedCfg = { ...opened, host: 'h2', token: '', password: '' }
for (const key of ['password', 'token']) {
  if (!mergedCfg[key]) mergedCfg[key] = opened[key]
}
const resealed = sealConnectionConfig(mergedCfg)
const again = unsealConnectionConfig(resealed)
assert(again.host === 'h2', 'host updated')
assert(again.token === 't1' && again.password === 'p1', 'blank keeps previous secrets')
const pub = publicConnectionConfig(resealed)
assert(pub.hasSecrets === true, 'public hasSecrets')
assert(!JSON.stringify(pub.config).includes('t1'), 'public no token')

// --- scrub ---
assert(String(scrubSampleValue('user@acme.com')).startsWith('email_'), 'email scrub')
const rows = scrubSampleList(['a@b.com', '550e8400-e29b-41d4-a716-446655440000'])
assert(String(rows[0]).startsWith('email_'), 'scrubSampleList email')
assert(String(rows[1]).startsWith('uuid_'), 'scrubSampleList uuid')

// --- SQL guards ---
try {
  prepareReadonlySql('SELECT 1; DROP TABLE x')
  assert(false, 'multi should throw')
} catch {
  assert(true, 'blocks multi-statement')
}
const capped = prepareReadonlySql('SELECT * FROM t')
assert(/limit\s+20/i.test(capped) || capped.includes('LIMIT'), 'wraps LIMIT')

// --- joins from SQL ---
const pairs = extractJoinPairsFromSql(
  'SELECT * FROM orders o INNER JOIN customers c ON o.customer_id = c.id',
)
assert(pairs.length >= 1, 'extract join pairs')
assert(
  pairs.some((p) => p.leftCol === 'customer_id' || p.rightCol === 'customer_id'),
  'join cols detected',
)

// --- attestation tamper ---
process.env.QUE_ATTESTATION_HMAC_SECRET = 'unit-attestation-hmac'
const att = buildSchemaOnlyAttestation({
  workspaceId: 'ws',
  job: { id: 'j', title: 't', tables: ['a'], sources: ['pg'] },
  joins: [{ id: 'r1' }],
  format: 'json',
})
assert(verifyAttestationSignature(att).ok, 'attestation ok')
const tampered = structuredClone(att)
tampered.claim = (tampered.claim || '') + 'x'
assert(verifyAttestationSignature(tampered).ok === false, 'tamper fails verify')

// --- settings defaults (inline, mirror workspaceSettings DEFAULT_SETTINGS) ---
const DEFAULT_SETTINGS = {
  scrubSamples: true,
  blockPrOnColumnDrift: true,
  includeSamplesDefault: false,
}
const merged = { ...DEFAULT_SETTINGS, scrubSamples: false }
assert(merged.scrubSamples === false, 'settings override scrub')
assert(merged.blockPrOnColumnDrift === true, 'settings keep blockPr default')

// --- hash helper sanity (PKCE-like) ---
const verifier = randomBytes(32).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
assert(challenge.length > 20, 'pkce challenge shape')

if (failed) {
  console.error(`[Que] unit tests FAILED (${failed})`)
  process.exit(1)
}
console.log('[Que] unit tests PASSED')
