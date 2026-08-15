/**
 * Signed tokens for Slack/Teams Approve · Reject without browser session.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

function secret() {
  return (
    process.env.QUE_JOIN_ACTION_HMAC_SECRET ||
    process.env.QUE_ATTESTATION_HMAC_SECRET ||
    process.env.QUE_SECRETS_KEY ||
    'que-local-dev-join-action'
  )
}

export function appPublicUrl() {
  return String(
    process.env.QUE_APP_URL ||
      process.env.QUE_PUBLIC_URL ||
      'http://localhost:5174',
  ).replace(/\/$/, '')
}

export function apiPublicUrl() {
  return String(
    process.env.QUE_PUBLIC_API_URL ||
      process.env.QUE_API_PUBLIC_URL ||
      `http://localhost:${process.env.PORT || 8787}`,
  ).replace(/\/$/, '')
}

/**
 * @param {{ workspaceId: string, relationshipId: string, action: 'promote'|'reject', expSec?: number }} opts
 */
export function signJoinActionToken(opts) {
  const exp = Math.floor(Date.now() / 1000) + (opts.expSec || 72 * 3600)
  const payload = [
    opts.workspaceId,
    opts.relationshipId,
    opts.action,
    String(exp),
  ].join('|')
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url')
  return Buffer.from(`${payload}|${sig}`).toString('base64url')
}

export function verifyJoinActionToken(token) {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8')
    const parts = raw.split('|')
    if (parts.length !== 5) return null
    const [workspaceId, relationshipId, action, expStr, sig] = parts
    if (action !== 'promote' && action !== 'reject') return null
    const exp = Number(expStr)
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null
    }
    const payload = [workspaceId, relationshipId, action, expStr].join('|')
    const expected = createHmac('sha256', secret())
      .update(payload)
      .digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return { workspaceId, relationshipId, action, exp }
  } catch {
    return null
  }
}

export function joinActionLink(action, workspaceId, relationshipId) {
  const token = signJoinActionToken({ workspaceId, relationshipId, action })
  return `${apiPublicUrl()}/webhooks/join-action?token=${encodeURIComponent(token)}`
}
