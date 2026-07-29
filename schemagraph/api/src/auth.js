import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'
import { isProduction } from './env.js'
import { oidcReady, oidcEnv } from './oidc.js'

const SESSION_DAYS = Number(process.env.STITCH_SESSION_DAYS || 14)

/**
 * Auth bypass — NEVER in production, even if env is set.
 */
export function authDisabled() {
  if (isProduction()) return false
  return String(process.env.STITCH_AUTH_DISABLED || '').toLowerCase() === 'true'
}

/**
 * SSO config surface for enterprise diligence.
 * Env: QUE_OIDC_ISSUER, QUE_OIDC_CLIENT_ID, QUE_OIDC_CLIENT_SECRET,
 *      QUE_OIDC_REDIRECT_URI (API callback), QUE_OIDC_POST_LOGIN_REDIRECT (SPA).
 */
export function getSsoConfig() {
  const env = oidcEnv()
  const ready = oidcReady()
  const hasSecret = Boolean(env.clientSecret)
  return {
    provider: 'oidc',
    configured: ready,
    issuer: env.issuer || null,
    clientId: env.clientId || null,
    hasClientSecret: hasSecret,
    redirectUri: env.apiCallback,
    postLoginRedirect: env.postLogin,
    status: ready ? 'ready' : 'not_configured',
    loginImplemented: ready,
    authorizePath: '/auth/sso/start',
    note: ready
      ? 'OIDC authorize + PKCE callback implemented. Configure IdP redirect to API /auth/sso/callback.'
      : 'Set QUE_OIDC_ISSUER + QUE_OIDC_CLIENT_ID to enable SSO.',
  }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(':')) return false
  const [salt, hash] = String(stored).split(':')
  const next = scryptSync(String(password), salt, 64)
  const prev = Buffer.from(hash, 'hex')
  if (prev.length !== next.length) return false
  return timingSafeEqual(prev, next)
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export async function login(email, password) {
  const { rows } = await query(
    `SELECT id, email, display_name, password_hash
     FROM users WHERE lower(email) = lower($1)`,
    [String(email || '').trim()],
  )
  if (rows.length === 0) {
    const err = new Error('invalid email or password')
    err.status = 401
    throw err
  }
  const user = rows[0]
  if (!verifyPassword(password, user.password_hash)) {
    const err = new Error('invalid email or password')
    err.status = 401
    throw err
  }

  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashToken(token), expires.toISOString()],
  )

  const workspaces = await listWorkspacesForUser(user.id)
  return {
    token,
    expiresAt: expires.toISOString(),
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
    },
    workspaces,
  }
}

export async function logout(token) {
  if (!token) return
  await query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)])
}

export async function resolveSession(token) {
  if (!token) return null
  const { rows } = await query(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [hashToken(token)],
  )
  if (rows.length === 0) return null
  const row = rows[0]
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query(`DELETE FROM sessions WHERE id = $1`, [row.session_id])
    return null
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
  }
}

export async function listWorkspacesForUser(userId) {
  const { rows } = await query(
    `SELECT w.id, w.name, w.slug, m.role
     FROM workspace_members m
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1
     ORDER BY w.name`,
    [userId],
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    role: r.role,
  }))
}

export async function userCanAccessWorkspace(userId, workspaceId) {
  const { rows } = await query(
    `SELECT role FROM workspace_members
     WHERE user_id = $1 AND workspace_id = $2`,
    [userId, workspaceId],
  )
  return rows[0]?.role || null
}

function extractBearer(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

/** Attach req.user when session valid (optional — does not 401). */
export async function optionalAuth(req, _res, next) {
  try {
    if (authDisabled()) {
      req.user = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'dev@stitch.local',
        displayName: 'Dev User',
      }
      return next()
    }
    const token = extractBearer(req)
    req.authToken = token
    req.user = token ? await resolveSession(token) : null
    next()
  } catch (err) {
    next(err)
  }
}

/** Require authenticated user */
export async function requireAuth(req, res, next) {
  try {
    if (authDisabled()) {
      req.user = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'dev@stitch.local',
        displayName: 'Dev User',
      }
      return next()
    }
    const token = extractBearer(req)
    req.authToken = token
    const user = token ? await resolveSession(token) : null
    if (!user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

/** Require membership on :workspaceId */
export async function requireWorkspaceMember(req, res, next) {
  try {
    if (authDisabled()) {
      req.workspaceRole = 'owner'
      return next()
    }
    const workspaceId = req.params.workspaceId
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId required' })
      return
    }
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    const role = await userCanAccessWorkspace(req.user.id, workspaceId)
    if (!role) {
      res.status(403).json({ error: 'forbidden — not a workspace member' })
      return
    }
    req.workspaceRole = role
    next()
  } catch (err) {
    next(err)
  }
}

/** Role hierarchy for write ACL */
export const ROLE_RANK = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
}

/**
 * Require workspace role at least `minRole` (must run after requireWorkspaceMember).
 * @param {'member' | 'admin' | 'owner'} minRole
 */
export function requireMinRole(minRole) {
  const need = ROLE_RANK[minRole] ?? 99
  return function requireMinRoleMiddleware(req, res, next) {
    if (authDisabled()) return next()
    const have = ROLE_RANK[req.workspaceRole] ?? 0
    if (have < need) {
      res.status(403).json({
        error: `forbidden — requires ${minRole}+`,
      })
      return
    }
    next()
  }
}

async function ensureUserWithPassword({
  id,
  email,
  displayName,
  password,
}) {
  const { rows } = await query(`SELECT id, password_hash FROM users WHERE email = $1`, [
    email,
  ])
  if (rows.length === 0) {
    await query(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [id, email, displayName, hashPassword(password)],
    )
    return id
  }
  if (!rows[0].password_hash) {
    await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      rows[0].id,
      hashPassword(password),
    ])
  }
  return rows[0].id
}

async function ensureMembership(workspaceId, userId, role) {
  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, userId, role],
  )
}

/**
 * Ensure demo owner + viewer accounts (idempotent).
 * Skipped in production unless QUE_SEED_DEMO_USERS=true (explicit opt-in).
 */
export async function ensureDevUserPassword(
  password = process.env.STITCH_DEV_PASSWORD || 'stitch-dev',
) {
  const seed =
    String(process.env.QUE_SEED_DEMO_USERS || '').toLowerCase() === 'true' ||
    (!isProduction() &&
      String(process.env.QUE_SEED_DEMO_USERS || 'true').toLowerCase() !==
        'false')
  if (!seed) {
    console.log('[Que auth] Skipping demo user seed (production / QUE_SEED_DEMO_USERS=false)')
    return
  }
  if (isProduction()) {
    console.warn(
      '[Que auth] QUE_SEED_DEMO_USERS=true in production — demo passwords will be seeded. Prefer false.',
    )
  }
  const demoWs =
    process.env.DEMO_WORKSPACE_ID || '22222222-2222-2222-2222-222222222222'
  const sandboxWs =
    process.env.SANDBOX_WORKSPACE_ID || '33333333-3333-3333-3333-333333333333'

  // Ensure sandbox workspace row exists (seed also creates it)
  await query(
    `INSERT INTO workspaces (id, name, slug)
     VALUES ($1, 'Sandbox Workspace', 'sandbox')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [sandboxWs],
  )
  await query(
    `INSERT INTO workspaces (id, name, slug)
     VALUES ($1, 'Demo Workspace', 'demo')
     ON CONFLICT (id) DO NOTHING`,
    [demoWs],
  )

  const ownerId = await ensureUserWithPassword({
    id: '11111111-1111-1111-1111-111111111111',
    email: 'dev@stitch.local',
    displayName: 'Dev User',
    password,
  })
  await ensureMembership(demoWs, ownerId, 'owner')
  await ensureMembership(sandboxWs, ownerId, 'owner')

  const viewerId = await ensureUserWithPassword({
    id: '11111111-1111-1111-1111-111111111112',
    email: 'viewer@stitch.local',
    displayName: 'Viewer User',
    password: process.env.STITCH_VIEWER_PASSWORD || 'stitch-viewer',
  })
  await ensureMembership(demoWs, viewerId, 'viewer')
  await ensureMembership(sandboxWs, viewerId, 'viewer')

  const memberId = await ensureUserWithPassword({
    id: '11111111-1111-1111-1111-111111111113',
    email: 'member@stitch.local',
    displayName: 'Member User',
    password: process.env.STITCH_MEMBER_PASSWORD || 'stitch-member',
  })
  await ensureMembership(demoWs, memberId, 'member')
  await ensureMembership(sandboxWs, memberId, 'member')
}
