/**
 * Verify Slack request signatures (X-Slack-Signature).
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * @param {string|Buffer} rawBody
 * @param {Record<string, string|string[]|undefined>} headers
 * @param {{ requireSecret?: boolean }} [opts]
 */
export function verifySlackSignature(rawBody, headers, opts = {}) {
  const secret = String(process.env.SLACK_SIGNING_SECRET || '').trim()
  if (!secret) {
    if (opts.requireSecret) {
      return {
        ok: false,
        reason: 'SLACK_SIGNING_SECRET not configured',
      }
    }
    return { ok: true, skipped: true }
  }

  const ts = String(headers['x-slack-request-timestamp'] || '')
  const sig = String(headers['x-slack-signature'] || '')
  if (!ts || !sig) {
    return { ok: false, reason: 'missing Slack signature headers' }
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts))
  if (!Number.isFinite(age) || age > 60 * 5) {
    return { ok: false, reason: 'Slack timestamp too old' }
  }

  const base = `v0:${ts}:${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`
  const digest = createHmac('sha256', secret).update(base).digest('hex')
  const expected = `v0=${digest}`
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'invalid Slack signature' }
    }
  } catch {
    return { ok: false, reason: 'invalid Slack signature' }
  }
  return { ok: true }
}

export function slackSigningRequiredInProduction() {
  const prod =
    String(process.env.NODE_ENV || '').toLowerCase() === 'production' ||
    String(process.env.QUE_ENV || '').toLowerCase() === 'production'
  return prod && Boolean(String(process.env.SLACK_SIGNING_SECRET || '').trim())
}
