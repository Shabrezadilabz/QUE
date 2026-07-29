/**
 * Shared production env helpers.
 */
export function isProduction() {
  return (
    String(process.env.NODE_ENV || '').toLowerCase() === 'production' ||
    String(process.env.QUE_ENV || '').toLowerCase() === 'production'
  )
}

/** Fail boot if production secrets missing. */
export function assertProductionSecrets() {
  if (!isProduction()) return
  const key = String(
    process.env.QUE_SECRETS_KEY || process.env.STITCH_SECRETS_KEY || '',
  ).trim()
  if (!key || key === 'que-local-dev-secrets-key-change-me') {
    throw new Error(
      'Production boot refused: set QUE_SECRETS_KEY (32+ chars, not the default).',
    )
  }
  const att = String(process.env.QUE_ATTESTATION_HMAC_SECRET || '').trim()
  if (!att) {
    throw new Error(
      'Production boot refused: set QUE_ATTESTATION_HMAC_SECRET.',
    )
  }
  if (String(process.env.STITCH_AUTH_DISABLED || '').toLowerCase() === 'true') {
    throw new Error(
      'Production boot refused: STITCH_AUTH_DISABLED cannot be true in production.',
    )
  }
  const cors = String(process.env.QUE_CORS_ORIGINS || '').trim()
  if (!cors) {
    throw new Error(
      'Production boot refused: set QUE_CORS_ORIGINS (comma-separated allowed origins).',
    )
  }
}

export function corsOrigins() {
  const raw = String(process.env.QUE_CORS_ORIGINS || '').trim()
  if (!raw) {
    if (isProduction()) {
      // Fail closed-ish: empty means no browser CORS (API still works for same-origin / server)
      return []
    }
    return [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ]
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
