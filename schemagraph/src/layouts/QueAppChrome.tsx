import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PdfSidebar } from '@/components/pdf/PdfSidebar'
import { AppTopBarActions } from '@/components/pdf/AppTopBarActions'
import { MobileNav } from '@/components/MobileNav'
import { QueSectionNav } from '@/components/que/QueSectionNav'
import { QueAgentProvider } from '@/context/QueAgentContext'
import { QueGenieAgent } from '@/components/genie/QueGenieAgent'
import { BackendBusyProvider } from '@/context/BackendBusyContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { isKpiAllowedPath } from '@/components/que/queNavConfig'

interface QueAppChromeProps {
  children: ReactNode
  /** Ignored — PDF app frames use sidebar-only chrome */
  eyebrow?: string
  /** Full-bleed page — no scroll wrapper */
  flush?: boolean
  /** Hide global top bar (Settings provides its own header chrome). */
  hideTopBar?: boolean
}

/**
 * App shell — PDF pages 2–10: slate canvas + icon sidebar + theme top bar.
 */
export function QueAppChrome({
  children,
  flush = false,
  hideTopBar = false,
}: QueAppChromeProps) {
  const { isBuilder, role } = useWorkspaceRole()
  const location = useLocation()
  if (role && !isBuilder && !isKpiAllowedPath(location.pathname)) {
    return <Navigate to="/chat" replace />
  }

  return (
    <QueAgentProvider>
      <BackendBusyProvider>
      <div className="pdf-app-canvas flex h-full min-h-0 w-full overflow-hidden">
        <PdfSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="pdf-top-bar flex h-12 shrink-0 items-center justify-between border-b border-solid px-3 md:px-[20px]">
            <div className="flex min-w-0 items-center md:hidden">
              <MobileNav showBelow="md" />
              <span className="ml-3 text-[10px] font-black text-[var(--pdf-text-heading)]">
                QUE
              </span>
            </div>
            <div className="hidden min-w-0 flex-1 md:block" />
            {!hideTopBar ? (
              <AppTopBarActions />
            ) : (
              <div className="hidden md:block" />
            )}
          </div>
          <QueSectionNav />
          <div
            className={[
              'min-h-0 flex-1',
              flush
                ? 'flex h-full min-h-0 flex-col overflow-hidden'
                : 'overflow-y-auto',
            ].join(' ')}
          >
            {children}
          </div>
        </div>
        {isBuilder ? <QueGenieAgent /> : null}
      </div>
      </BackendBusyProvider>
    </QueAgentProvider>
  )
}
