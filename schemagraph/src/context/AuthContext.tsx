import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  AUTH_EXPIRED_EVENT,
  fetchMe,
  getStoredUser,
  loginRequest,
  logoutRequest,
  setAuthSession,
  type AuthUser,
  type AuthWorkspace,
} from '@/services/auth'
import {
  getActiveWorkspaceId,
  setActiveWorkspaceId,
} from '@/services/apiConfig'

interface AuthContextValue {
  user: AuthUser | null
  workspaces: AuthWorkspace[]
  workspaceId: string
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  acceptToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setWorkspaceId: (id: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function pickWorkspaceId(workspaces: AuthWorkspace[]): string {
  const stored = getActiveWorkspaceId()
  if (workspaces.some((w) => w.id === stored)) return stored
  return workspaces[0]?.id ?? stored
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser())
  const [workspaces, setWorkspaces] = useState<AuthWorkspace[]>([])
  const [workspaceId, setWorkspaceIdState] = useState(getActiveWorkspaceId)
  const [ready, setReady] = useState(false)

  const setWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceId(id)
    setWorkspaceIdState(id)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe()
      if (me) {
        setUser(me.user)
        setWorkspaces(me.workspaces)
        const next = pickWorkspaceId(me.workspaces)
        setActiveWorkspaceId(next)
        setWorkspaceIdState(next)
      } else {
        setUser(null)
        setWorkspaces([])
      }
    } catch {
      /* brief API blip — keep stored user */
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setWorkspaces([])
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password)
    setUser(result.user)
    setWorkspaces(result.workspaces)
    const next = pickWorkspaceId(result.workspaces)
    setActiveWorkspaceId(next)
    setWorkspaceIdState(next)
  }, [])

  const acceptToken = useCallback(async (token: string) => {
    setAuthSession(token, {
      id: 'pending',
      email: 'sso@pending',
    })
    const me = await fetchMe()
    if (!me) throw new Error('SSO token rejected')
    setAuthSession(token, me.user)
    setUser(me.user)
    setWorkspaces(me.workspaces)
    const next = pickWorkspaceId(me.workspaces)
    setActiveWorkspaceId(next)
    setWorkspaceIdState(next)
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest()
    setUser(null)
    setWorkspaces([])
  }, [])

  const value = useMemo(
    () => ({
      user,
      workspaces,
      workspaceId,
      ready,
      login,
      acceptToken,
      logout,
      refresh,
      setWorkspaceId,
    }),
    [
      user,
      workspaces,
      workspaceId,
      ready,
      login,
      acceptToken,
      logout,
      refresh,
      setWorkspaceId,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth requires AuthProvider')
  return ctx
}
