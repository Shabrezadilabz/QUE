/**
 * Classify connector sync / introspect failures for Day-2 health UI.
 * Returns: auth | network | config | unknown
 */
export function classifySyncError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  const code = String(err?.code || err?.status || '').toLowerCase()

  if (
    code === '28p01' ||
    code === '28000' ||
    code === '401' ||
    code === '403' ||
    /password authentication failed/.test(msg) ||
    /authentication failed/.test(msg) ||
    /auth failed/.test(msg) ||
    /unauthorized/.test(msg) ||
    /invalid (access )?token/.test(msg) ||
    /token (expired|revoked|invalid)/.test(msg) ||
    /expired.*token/.test(msg) ||
    /sasl/.test(msg) ||
    /login failed/.test(msg) ||
    /invalid credentials/.test(msg) ||
    /access denied/.test(msg) ||
    /permission denied.*auth/.test(msg) ||
    /oidc|oauth/.test(msg) && /fail|invalid|expired/.test(msg)
  ) {
    return 'auth'
  }

  if (
    code === 'econnrefused' ||
    code === 'enotfound' ||
    code === 'etimedout' ||
    code === 'econnreset' ||
    code === 'enetunreach' ||
    /econnrefused|enotfound|etimedout|econnreset/.test(msg) ||
    /getaddrinfo/.test(msg) ||
    /socket hang up/.test(msg) ||
    /network/.test(msg) ||
    /timed? ?out/.test(msg) ||
    /could not connect/.test(msg) ||
    /connection refused/.test(msg)
  ) {
    return 'network'
  }

  if (
    /required|missing|not configured|invalid (host|uri|url|database|warehouse)/.test(
      msg,
    ) ||
    /unknown (database|collection|schema|catalog)/.test(msg) ||
    /no such (file|table|database)/.test(msg) ||
    /fixture.*not found/.test(msg)
  ) {
    return 'config'
  }

  return 'unknown'
}

export function needsReauth(kind) {
  return kind === 'auth'
}
