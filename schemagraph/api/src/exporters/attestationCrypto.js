/**
 * Cryptographic attestation — HMAC-SHA256 (MVP) with optional Ed25519 later.
 *
 * Env: QUE_ATTESTATION_HMAC_SECRET (required in production).
 * Falls back to QUE_SECRETS_KEY only when NODE_ENV !== 'production' (logged).
 */
import {
  createHmac,
  createHash,
  timingSafeEqual,
  randomBytes,
} from 'node:crypto'

const ALG = 'HMAC-SHA256'

function resolveHmacSecret() {
  const dedicated = String(process.env.QUE_ATTESTATION_HMAC_SECRET || '').trim()
  if (dedicated) return dedicated
  const secretsKey = String(process.env.QUE_SECRETS_KEY || '').trim()
  const isProd =
    String(process.env.NODE_ENV || '').toLowerCase() === 'production' ||
    String(process.env.QUE_ENV || '').toLowerCase() === 'production'
  if (isProd) {
    const err = new Error(
      'QUE_ATTESTATION_HMAC_SECRET (or QUE_SECRETS_KEY) required in production for attestation signing',
    )
    err.status = 500
    err.code = 'ATTESTATION_KEY_MISSING'
    throw err
  }
  if (secretsKey) {
    console.warn(
      '[Que attestation] Using QUE_SECRETS_KEY as HMAC secret (dev only). Set QUE_ATTESTATION_HMAC_SECRET for production.',
    )
    return secretsKey
  }
  console.warn(
    '[Que attestation] Using ephemeral in-memory HMAC secret (dev only — signatures will not verify across restarts).',
  )
  if (!globalThis.__queAttestationEphemeral) {
    globalThis.__queAttestationEphemeral = randomBytes(32).toString('hex')
  }
  return globalThis.__queAttestationEphemeral
}

/** Canonical JSON: sorted keys, no whitespace. */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`
  }
  const keys = Object.keys(value).sort()
  return `{${keys
    .filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
    .join(',')}}`
}

export function payloadHash(attestation) {
  const { signature, ...rest } = attestation || {}
  void signature
  return createHash('sha256').update(canonicalize(rest)).digest('hex')
}

/**
 * Stable fingerprint = first 32 hex of payload hash (crypto-backed, not base64 slice).
 */
export function attestationFingerprint(attestation) {
  return payloadHash(attestation).slice(0, 32)
}

/**
 * Sign attestation in place (returns new object with signature block).
 */
export function signAttestation(attestation) {
  const secret = resolveHmacSecret()
  const keyId = createHash('sha256')
    .update(secret)
    .digest('hex')
    .slice(0, 12)
  const body = { ...attestation }
  delete body.signature
  const hash = payloadHash(body)
  const sig = createHmac('sha256', secret).update(hash).digest('base64url')
  return {
    ...body,
    signature: {
      alg: ALG,
      keyId,
      payloadHash: hash,
      sig,
      signedAt: new Date().toISOString(),
    },
  }
}

/**
 * Verify signature. Returns { ok, reason? }.
 */
export function verifyAttestationSignature(attestation) {
  try {
    const signature = attestation?.signature
    if (!signature?.sig || !signature?.payloadHash) {
      return { ok: false, reason: 'missing signature' }
    }
    if (signature.alg !== ALG) {
      return { ok: false, reason: `unsupported alg ${signature.alg}` }
    }
    const secret = resolveHmacSecret()
    const hash = payloadHash(attestation)
    if (hash !== signature.payloadHash) {
      return { ok: false, reason: 'payload hash mismatch' }
    }
    const expected = createHmac('sha256', secret).update(hash).digest('base64url')
    const a = Buffer.from(expected)
    const b = Buffer.from(String(signature.sig))
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad signature' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: String(err.message || err) }
  }
}
