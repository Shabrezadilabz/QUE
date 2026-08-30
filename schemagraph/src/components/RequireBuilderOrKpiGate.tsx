import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { isKpiAllowedPath } from '@/components/que/queNavConfig'

/**
 * KPI / viewer users only see Ask + certified BI.
 * Builder routes redirect to /chat.
 */
export function RequireBuilderOrKpiGate({ children }: { children: ReactNode }) {
  const { isBuilder, role } = useWorkspaceRole()
  const location = useLocation()

  if (!role) return children
  if (isBuilder) return children
  if (isKpiAllowedPath(location.pathname)) return children
  return <Navigate to="/chat" replace />
}

/** Home redirect: builders → hub, KPI consumers → Ask. */
export function RoleHomeRedirect() {
  const { homePath } = useWorkspaceRole()
  return <Navigate to={homePath} replace />
}
