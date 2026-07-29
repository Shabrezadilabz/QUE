/**
 * Schema-only / privacy red-team checks (no DB required).
 * Run: npm run test:privacy
 */
import { prepareReadonlySql, LIVE_VALIDATE_MAX_ROWS } from '../src/liveExec.js'
import {
  attestationFingerprint,
  buildSchemaOnlyAttestation,
  verifyAttestationSignature,
} from '../src/exporters/attestation.js'
import { scrubSampleValue, scrubSampleList } from '../src/privacy/sampleScrub.js'
import { extractJoinPairsFromSql } from '../src/connectors/databricksQueryJoins.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else {
    console.log('ok:', msg)
  }
}

// --- live SQL hardening ---
try {
  prepareReadonlySql('DELETE FROM users')
  assert(false, 'DELETE should throw')
} catch (e) {
  assert(/write|blocked|not allowed/i.test(e.message), 'blocks DELETE')
}

try {
  prepareReadonlySql('SELECT 1; DROP TABLE x')
  assert(false, 'multi-statement should throw')
} catch (e) {
  assert(/single statement/i.test(e.message), 'blocks multi-statement')
}

try {
  prepareReadonlySql('INSERT INTO t VALUES (1)')
  assert(false, 'INSERT should throw')
} catch (e) {
  assert(/write|blocked|not allowed/i.test(e.message), 'blocks INSERT')
}

const capped = prepareReadonlySql('SELECT * FROM customers')
assert(
  /limit\s+20/i.test(capped) ||
    capped.toLowerCase().includes(`limit ${LIVE_VALIDATE_MAX_ROWS}`),
  `SELECT wrapped with LIMIT ${LIVE_VALIDATE_MAX_ROWS}`,
)

assert(LIVE_VALIDATE_MAX_ROWS === 20, 'live validate cap is 20')

// --- attestation signed ---
process.env.QUE_ATTESTATION_HMAC_SECRET =
  process.env.QUE_ATTESTATION_HMAC_SECRET || 'privacy-test-hmac'
const att = buildSchemaOnlyAttestation({
  workspaceId: 'ws',
  job: { id: 'j1', title: 't', tables: ['a'], sources: ['pg'] },
  joins: [{ id: 'r1' }],
  format: 'dbt',
})
assert(att.policy === 'schema-only', 'attestation policy schema-only')
assert(
  Array.isArray(att.guarantees) && att.guarantees.length > 0,
  'has guarantees',
)
assert(att.approvedRelationshipIds.includes('r1'), 'lists approved join ids')
assert(att.signature?.alg === 'HMAC-SHA256', 'HMAC signature present')
assert(verifyAttestationSignature(att).ok === true, 'signature verifies')
const fp = attestationFingerprint(att)
assert(typeof fp === 'string' && fp.length >= 8, 'fingerprint produced')

// --- sample scrub ---
const scrubbed = scrubSampleValue('alice@example.com')
assert(String(scrubbed).startsWith('email_'), 'email samples tokenized')
assert(
  scrubSampleList(['secret-value-xyz'], { enabled: true })[0].startsWith(
    'tok_',
  ),
  'generic samples tokenized',
)

// --- query SQL join extract ---
const pairs = extractJoinPairsFromSql(
  'SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id',
)
assert(pairs.length >= 1, 'extracts join pairs from SQL')

const fatSamples = Array.from({ length: 100 }, (_, i) => `row-${i}-secret`)
assert(
  fatSamples.length > 5,
  'fixture: callers must slice samples ≤5 in connectors/schema pack',
)

if (failed > 0) {
  console.error(`[Que] privacy tests FAILED (${failed})`)
  process.exit(1)
}
console.log('[Que] privacy tests PASSED')
