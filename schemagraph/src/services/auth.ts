/**
 * FE auth helpers — Bearer token in localStorage.
 */
import { getApiBase } from '@/services/apiConfig'

const TOKEN_KEY = 'stitch_auth_token'
const USER_KEY = 'stitch_auth_user'

export const AUTH_EXPIRED_EVENT = 'stitch:auth-expired'

export interface AuthUser {
  id: string
  email: string
  displayName?: string | null
}

export interface AuthWorkspace {
  id: string
  name: string
  slug: string
  role: string
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function setAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** Clear session + notify AuthContext / UI to log out. */
export function notifyAuthExpired() {
  clearAuthSession()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
  }
}

export function authHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const token = getAuthToken()
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<{
  token: string
  user: AuthUser
  workspaces: AuthWorkspace[]
}> {
  const res = await fetch(`${getApiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    token?: string
    user?: AuthUser
    workspaces?: AuthWorkspace[]
    error?: string
  }
  if (!res.ok || !body.token || !body.user) {
    throw new AuthError(body.error ?? `login ${res.status}`, res.status)
  }
  setAuthSession(body.token, body.user)
  return {
    token: body.token,
    user: body.user,
    workspaces: body.workspaces ?? [],
  }
}

export async function registerRequest(input: {
  email: string
  password: string
  displayName?: string
  workspaceName?: string
  createWorkspace?: boolean
}): Promise<{
  token: string
  user: AuthUser
  workspaces: AuthWorkspace[]
}> {
  const res = await fetch(`${getApiBase()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    token?: string
    user?: AuthUser
    workspaces?: AuthWorkspace[]
    error?: string
  }
  if (!res.ok || !body.token || !body.user) {
    throw new AuthError(body.error ?? `register ${res.status}`, res.status)
  }
  setAuthSession(body.token, body.user)
  return {
    token: body.token,
    user: body.user,
    workspaces: body.workspaces ?? [],
  }
}

export async function createWorkspaceRequest(input: {
  name: string
  slug?: string
}): Promise<AuthWorkspace> {
  const res = await fetch(`${getApiBase()}/workspaces`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    workspace?: AuthWorkspace
    error?: string
  }
  if (!res.ok || !body.workspace) {
    throw new AuthError(body.error ?? `create workspace ${res.status}`, res.status)
  }
  return body.workspace
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    })
  } finally {
    clearAuthSession()
  }
}

export async function fetchMe(): Promise<{
  user: AuthUser
  workspaces: AuthWorkspace[]
} | null> {
  const token = getAuthToken()
  if (!token) return null
  const res = await fetch(`${getApiBase()}/auth/me`, {
    headers: authHeaders(),
  })
  if (res.status === 401) {
    clearAuthSession()
    return null
  }
  if (!res.ok) throw new Error(`me ${res.status}`)
  const body = (await res.json()) as {
    user: AuthUser
    workspaces: AuthWorkspace[]
  }
  setAuthSession(token, body.user)
  return body
}
