import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useParams } from 'react-router-dom'

export type QuePageContext = {
  route: string
  pageId: string
  jobId?: string
  connectionId?: string
  reportId?: string
  selectedTables?: string[]
  extra?: Record<string, unknown>
}

type QueAgentContextValue = {
  pageContext: QuePageContext
  setPageExtras: (extra: Record<string, unknown>) => void
  chatSessionId: string | null
  setChatSessionId: (id: string | null) => void
}

const QueAgentContext = createContext<QueAgentContextValue | null>(null)

function routeToPageId(pathname: string): string {
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/jobs')) return 'jobs'
  if (pathname.startsWith('/bi')) return 'bi'
  if (pathname.startsWith('/joins')) return 'joins'
  if (pathname.startsWith('/sources')) return 'sources'
  if (pathname.startsWith('/monk')) return 'monk'
  if (pathname.startsWith('/pack-studio')) return 'pack-studio'
  if (pathname.startsWith('/workspace')) return 'workspace'
  return 'app'
}

export function QueAgentProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const params = useParams()
  const [extras, setExtras] = useState<Record<string, unknown>>({})
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)

  const pageContext = useMemo((): QuePageContext => {
    const route = location.pathname + location.search
    const jobId =
      typeof params.jobId === 'string'
        ? params.jobId
        : typeof extras.jobId === 'string'
          ? extras.jobId
          : undefined
    const connectionId =
      typeof params.connectionId === 'string'
        ? params.connectionId
        : typeof extras.connectionId === 'string'
          ? extras.connectionId
          : undefined
    const reportId =
      typeof extras.reportId === 'string' ? extras.reportId : undefined
    const selectedTables = Array.isArray(extras.selectedTables)
      ? (extras.selectedTables as string[])
      : undefined
    return {
      route,
      pageId: routeToPageId(location.pathname),
      jobId,
      connectionId,
      reportId,
      selectedTables,
      extra: extras,
    }
  }, [location.pathname, location.search, params.jobId, params.connectionId, extras])

  const setPageExtras = useCallback((patch: Record<string, unknown>) => {
    setExtras((prev) => ({ ...prev, ...patch }))
  }, [])

  const value = useMemo(
    () => ({
      pageContext,
      setPageExtras,
      chatSessionId,
      setChatSessionId,
    }),
    [pageContext, setPageExtras, chatSessionId],
  )

  return (
    <QueAgentContext.Provider value={value}>{children}</QueAgentContext.Provider>
  )
}

export function useQueAgent() {
  const ctx = useContext(QueAgentContext)
  if (!ctx) {
    throw new Error('useQueAgent must be used within QueAgentProvider')
  }
  return ctx
}

export function useQueAgentOptional() {
  return useContext(QueAgentContext)
}

/** Pages can register job/report context for the genie */
export function useRegisterQuePageContext(
  patch: Record<string, unknown>,
  deps: unknown[] = [],
) {
  const ctx = useQueAgentOptional()
  useEffect(() => {
    ctx?.setPageExtras(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
