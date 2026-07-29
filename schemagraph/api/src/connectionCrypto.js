/**
 * Seal / unseal connection config secrets (password, token, apiKey, secret).
 * Plaintext secret fields are moved into encrypted `__enc` blob at rest.
 */
import { encryptBlob, decryptBlob } from './secrets.js'

const SECRET_FIELD_KEYS = ['password', 'secret', 'token', 'apiKey']

/**
 * @param {Record<string, unknown>} config
 * @returns {Record<string, unknown>}
 */
export function sealConnectionConfig(config) {
  if (!config || typeof config !== 'object') return {}
  const next = { ...config }
  const secrets = {}
  for (const key of SECRET_FIELD_KEYS) {
    if (next[key] != null && String(next[key]).length > 0) {
      // Don't re-encrypt mask placeholders
      if (String(next[key]) === '••••••••') {
        delete next[key]
        continue
      }
      secrets[key] = String(next[key])
      delete next[key]
    }
  }
  // Preserve existing sealed blob if no new secrets provided
  if (Object.keys(secrets).length === 0) {
    return next
  }
  // Merge with previously sealed secrets if updating one field
  let prev = {}
  if (typeof next.__enc === 'string' && next.__enc) {
    try {
      prev = JSON.parse(decryptBlob(next.__enc))
    } catch {
      prev = {}
    }
  }
  next.__enc = encryptBlob(JSON.stringify({ ...prev, ...secrets }))
  next.__encVersion = 1
  return next
}

/**
 * @param {Record<string, unknown>} config
 * @returns {Record<string, unknown>} config with plaintext secrets restored
 */
export function unsealConnectionConfig(config) {
  if (!config || typeof config !== 'object') return {}
  const next = { ...config }
  if (typeof next.__enc === 'string' && next.__enc) {
    try {
      const secrets = JSON.parse(decryptBlob(next.__enc))
      Object.assign(next, secrets)
    } catch (err) {
      console.warn('[Que] connection unseal failed:', err.message || err)
    }
  }
  // Legacy plaintext still in DB (pre-migration) — leave as-is
  delete next.__enc
  delete next.__encVersion
  return next
}

/** Public redaction — never expose __enc blob details beyond hasSecrets. */
export function publicConnectionConfig(config) {
  const { config: redacted, hasSecrets } = (() => {
    if (!config || typeof config !== 'object') {
      return { config: {}, hasSecrets: false }
    }
    const next = { ...config }
    let has = Boolean(next.__enc)
    delete next.__enc
    delete next.__encVersion
    for (const key of SECRET_FIELD_KEYS) {
      if (next[key] != null && String(next[key]).length > 0) {
        has = true
        next[key] = '••••••••'
      }
    }
    return { config: next, hasSecrets: has }
  })()
  return { config: redacted, hasSecrets }
}
