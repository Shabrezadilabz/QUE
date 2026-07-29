/**
 * OIDC Authorization Code + PKCE (production-hardening MVP).
 *
 * - Durable PKCE state in Postgres (oidc_pending_states)
 * - id_token verified via JWKS (jose)
 * - Session token returned in URL hash fragment (not query) to reduce Referer/log leakage
 * - Provisioning: domain allowlist + invites; no silent demo-workspace join
 *
 * Env:
 *   QUE_OIDC_ISSUER, QUE_OIDC_CLIENT_ID, QUE_OIDC_CLIENT_SECRET?
 *   QUE_OIDC_REDIRECT_URI (API callback)
 *   QUE_OIDC_POST_LOGIN_REDIRECT (SPA /auth/callback)
 *   QUE_SSO_ALLOWED_DOMAINS=acme.com,partner.io  (optional; if set, enforce)
 *   QUE_SSO_DEFAULT_WORKSPACE_ID=uuid           (optional auto-join for allowed domains)
 *   QUE_SSO_REQUIRE_INVITE=true                 (new users need workspace_invites row)
 */
import {
  createHash,
  createPublicKey,
  createVerify,
  randomBytes,
  randomUUID,
  scryptSync,
} from 'node:crypto'
import { query } from './db.js'
import { acceptPendingInvites } from './invites.js'

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const SESSION_DAYS = Number(process.env.STITCH_SESSION_DAYS || 14)

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function pkcePair() {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function oidcEnv() {
  const issuer = String(process.env.QUE_OIDC_ISSUER || '')
    .trim()
    .replace(/\/$/, '')
  const clientId = String(process.env.QUE_OIDC_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.QUE_OIDC_CLIENT_SECRET || '').trim()
  const apiCallback = String(
    process.env.QUE_OIDC_REDIRECT_URI ||
      'http://localhost:8787/auth/sso/callback',
  ).trim()
  const postLogin = String(
    process.env.QUE_OIDC_POST_LOGIN_REDIRECT ||
      'http://localhost:5173/auth/callback',
  ).trim()
  return { issuer, clientId, clientSecret, apiCallback, postLogin }
}

export function oidcReady() {
  const { issuer, clientId } = oidcEnv()
  return Boolean(issuer && clientId)
}

async function discover(issuer) {
  const url = `${issuer}/.well-known/openid-configuration`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) at ${url}`)
  }
  return res.json()
}

async function savePendingState(state, verifier) {
  const expires = new Date(Date.now() + 10 * 60 * 1000)
  await query(
    `INSERT INTO oidc_pending_states (state, code_verifier, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (state) DO UPDATE SET
       code_verifier = EXCLUDED.code_verifier,
       expires_at = EXCLUDED.expires_at`,
    [state, verifier, expires.toISOString()],
  )
  // opportunistic GC
  await query(`DELETE FROM oidc_pending_states WHERE expires_at < now()`)
}

async function takePendingState(state) {
  const { rows } = await query(
    `DELETE FROM oidc_pending_states
     WHERE state = $1 AND expires_at >= now()
     RETURNING code_verifier`,
    [String(state || '')],
  )
  return rows[0]?.code_verifier || null
}

export async function buildAuthorizeRedirectUrl() {
  if (!oidcReady()) {
    const err = new Error('OIDC not configured')
    err.status = 503
    throw err
  }
  const { issuer, clientId, apiCallback } = oidcEnv()
  const disc = await discover(issuer)
  const { verifier, challenge } = pkcePair()
  const state = b64url(randomBytes(24))
  await savePendingState(state, verifier)

  const u = new URL(disc.authorization_endpoint)
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', apiCallback)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

async function exchangeCode({ code, verifier }) {
  const { issuer, clientId, clientSecret, apiCallback } = oidcEnv()
  const disc = await discover(issuer)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: apiCallback,
    client_id: clientId,
    code_verifier: verifier,
  })
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }
  const res = await fetch(disc.token_endpoint, {
    method: 'POST',
    headers,
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      json.error_description || json.error || `token exchange ${res.status}`,
    )
    err.status = 401
    throw err
  }
  return json
}

async function fetchJwks(jwksUri) {
  const res = await fetch(jwksUri)
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`)
  return res.json()
}

function b64urlToBuf(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

/**
 * Verify RS256 id_token against JWKS. Throws on failure.
 * @returns {object} payload claims
 */
async function verifyIdToken(idToken, disc) {
  const { issuer, clientId } = oidcEnv()
  if (!idToken) {
    const err = new Error('missing id_token')
    err.status = 401
    throw err
  }
  const [h, p, s] = String(idToken).split('.')
  if (!h || !p || !s) {
    const err = new Error('malformed id_token')
    err.status = 401
    throw err
  }
  const header = JSON.parse(b64urlToBuf(h).toString('utf8'))
  const payload = JSON.parse(b64urlToBuf(p).toString('utf8'))
  if (header.alg !== 'RS256') {
    const err = new Error(`unsupported id_token alg ${header.alg}`)
    err.status = 401
    throw err
  }
  if (payload.iss !== issuer && payload.iss !== `${issuer}/`) {
    // allow issuer with/without trailing slash already normalized
    if (String(payload.iss || '').replace(/\/$/, '') !== issuer) {
      const err = new Error('id_token iss mismatch')
      err.status = 401
      throw err
    }
  }
  const aud = payload.aud
  const audOk = Array.isArray(aud)
    ? aud.includes(clientId)
    : aud === clientId
  if (!audOk) {
    const err = new Error('id_token aud mismatch')
    err.status = 401
    throw err
  }
  if (payload.exp && payload.exp * 1000 < Date.now() - 30_000) {
    const err = new Error('id_token expired')
    err.status = 401
    throw err
  }

  const jwks = await fetchJwks(disc.jwks_uri)
  const jwk = (jwks.keys || []).find(
    (k) => k.kid === header.kid || (!header.kid && k.use === 'sig'),
  )
  if (!jwk) {
    const err = new Error('no matching JWKS key for id_token')
    err.status = 401
    throw err
  }
  const keyObject = createPublicKey({ key: jwk, format: 'jwk' })
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${h}.${p}`)
  verifier.end()
  const ok = verifier.verify(keyObject, b64urlToBuf(s))
  if (!ok) {
    const err = new Error('id_token signature invalid')
    err.status = 401
    throw err
  }
  return payload
}

async function fetchUserInfo(accessToken, issuer) {
  const disc = await discover(issuer)
  if (!disc.userinfo_endpoint) return null
  const res = await fetch(disc.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return res.json()
}

function emailDomain(email) {
  const i = String(email).lastIndexOf('@')
  return i >= 0 ? String(email).slice(i + 1).toLowerCase() : ''
}

function allowedDomains() {
  return String(process.env.QUE_SSO_ALLOWED_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

async function ensureOidcUser({ email, displayName }) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) {
    const err = new Error('OIDC profile missing email')
    err.status = 400
    throw err
  }

  const domains = allowedDomains()
  if (domains.length && !domains.includes(emailDomain(normalized))) {
    const err = new Error(
      `SSO email domain not allowed (${emailDomain(normalized)})`,
    )
    err.status = 403
    throw err
  }

  const { rows } = await query(
    `SELECT id, email, display_name FROM users WHERE lower(email) = lower($1)`,
    [normalized],
  )

  let user
  if (rows.length) {
    user = {
      id: rows[0].id,
      email: rows[0].email,
      displayName: rows[0].display_name,
    }
  } else {
    const requireInvite =
      String(process.env.QUE_SSO_REQUIRE_INVITE || '').toLowerCase() === 'true'
    if (requireInvite) {
      const { rows: inv } = await query(
        `SELECT 1 FROM workspace_invites
         WHERE lower(email) = lower($1) AND accepted_at IS NULL
         LIMIT 1`,
        [normalized],
      )
      if (!inv.length) {
        const err = new Error(
          'No workspace invite for this email — ask an admin to invite you',
        )
        err.status = 403
        throw err
      }
    }

    const id = randomUUID()
    const pw = hashPassword(randomBytes(32).toString('hex'))
    await query(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [id, normalized, displayName || normalized.split('@')[0], pw],
    )
    user = {
      id,
      email: normalized,
      displayName: displayName || normalized.split('@')[0],
    }
  }

  await acceptPendingInvites(user.id, normalized)

  // Optional default workspace join for allowed domains only
  const defaultWs = String(process.env.QUE_SSO_DEFAULT_WORKSPACE_ID || '').trim()
  if (defaultWs) {
    const { rows: mem } = await query(
      `SELECT 1 FROM workspace_members WHERE user_id = $1 LIMIT 1`,
      [user.id],
    )
    if (!mem.length) {
      await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [defaultWs, user.id],
      )
    }
  }

  const { rows: memberships } = await query(
    `SELECT 1 FROM workspace_members WHERE user_id = $1 LIMIT 1`,
    [user.id],
  )
  if (!memberships.length) {
    const err = new Error(
      'SSO login succeeded but you have no workspace membership. Ask an admin to invite you.',
    )
    err.status = 403
    throw err
  }

  return user
}

async function createSessionForUser(userId) {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expires.toISOString()],
  )
  return { token, expiresAt: expires.toISOString() }
}

/**
 * Complete OIDC callback → redirectUrl with #token= (hash, not query).
 */
export async function completeOidcCallback({ code, state }) {
  const verifier = await takePendingState(state)
  if (!verifier) {
    const err = new Error('invalid or expired OIDC state')
    err.status = 400
    throw err
  }
  const tokens = await exchangeCode({ code, verifier })
  const { issuer, postLogin } = oidcEnv()
  const disc = await discover(issuer)
  let profile = await verifyIdToken(tokens.id_token, disc)
  if (tokens.access_token) {
    const info = await fetchUserInfo(tokens.access_token, issuer)
    if (info) profile = { ...profile, ...info }
  }
  const email = profile.email || profile.preferred_username
  const displayName =
    profile.name || profile.given_name || String(email || '').split('@')[0]
  const user = await ensureOidcUser({ email, displayName })
  const session = await createSessionForUser(user.id)
  const dest = new URL(postLogin)
  // Hash fragment — not sent to servers in Referer
  dest.hash = `token=${encodeURIComponent(session.token)}&expiresAt=${encodeURIComponent(session.expiresAt)}`
  return { redirectUrl: dest.toString(), user, session }
}
