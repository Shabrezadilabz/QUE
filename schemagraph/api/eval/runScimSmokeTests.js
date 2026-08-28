/**
 * Sprint 8 — SCIM smoke tests (idempotent provision/deprovision logic, no DB).
 */
import {
  parseScimFilter,
  normalizeScimMemberRole,
  planScimIdempotentProvision,
} from '../src/scim.js'
import { oidcReady } from '../src/oidc.js'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

const filter = parseScimFilter('userName eq "Steward@Example.COM"')
assert(filter?.field === 'userName', 'parseScimFilter field')
assert(filter?.value === 'steward@example.com', 'parseScimFilter lowercases email')

assert(normalizeScimMemberRole('Admin') === 'admin', 'normalize admin')
assert(normalizeScimMemberRole('superuser') === 'member', 'unknown role → member')

const first = planScimIdempotentProvision({
  email: '  User@Corp.in  ',
  role: 'admin',
  active: true,
})
assert(first.action === 'create_user', 'new user create')
assert(first.email === 'user@corp.in', 'email normalized')
assert(first.memberAction === 'upsert_member', 'active upsert')

const second = planScimIdempotentProvision({
  email: 'user@corp.in',
  existingUserId: 'uuid-1',
  active: true,
})
assert(second.action === 'reuse_user', 'idempotent reuse')
assert(second.role === 'member', 'default role when omitted on reuse')

const deprov = planScimIdempotentProvision({
  email: 'user@corp.in',
  existingUserId: 'uuid-1',
  active: false,
})
assert(deprov.memberAction === 'remove_member', 'deprovision removes member')

assert(typeof oidcReady() === 'boolean', 'oidcReady callable')

console.log(failed ? `\n${failed} failed` : '\nAll SCIM smoke tests passed')
process.exit(failed ? 1 : 0)
