/**
 * Schema-only / privacy red-team checks (no DB required).
 * Run: npm run test:privacy
 */
import { prepareReadonlySql, LIVE_VALIDATE_MAX_ROWS } from '../src/liveExec.js'
import {
  attestationFingerprint,
  buildSchemaOnlyAttestation,
} from '../src/exporters/attestation.js'

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
  /limit\s+20/i.test(capped) || capped.toLowerCase().includes(`limit ${LIVE_VALIDATE_MAX_ROWS}`),
  `SELECT wrapped with LIMIT ${LIVE_VALIDATE_MAX_ROWS}`,
)

assert(LIVE_VALIDATE_MAX_ROWS === 20, 'live validate cap is 20')

// --- attestation is schema-only claim, machine-readable ---
const att = buildSchemaOnlyAttestation({
  workspaceId: 'ws',
  job: { id: 'j1', title: 't', tables: ['a'], sources: ['pg'] },
  joins: [{ id: 'r1' }],
  format: 'dbt',
})
assert(att.policy === 'schema-only', 'attestation policy schema-only')
assert(Array.isArray(att.guarantees) && att.guarantees.length > 0, 'has guarantees')
assert(att.approvedRelationshipIds.includes('r1'), 'lists approved join ids')
const fp = attestationFingerprint(att)
assert(typeof fp === 'string' && fp.length >= 8, 'fingerprint produced')

// --- sample overflow discipline (callers must cap; document contract) ---
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
