import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AuthSessionControls } from '@/components/AuthSessionControls'

interface ManagedPlaneLayoutProps {
  children: ReactNode
}

/** Standalone SQL workspace chrome — new-tab friendly, no sidebar. */
export function ManagedPlaneLayout({ children }: ManagedPlaneLayoutProps) {
  return (
    <div className="pdf-app-canvas flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--pdf-bg-canvas)]">
      <header className="pdf-top-bar flex h-12 shrink-0 items-center justify-between border-b border-solid px-[16px]">
        <div className="flex min-w-0 items-center gap-[12px]">
          <Link
            to="/workspace"
            className="text-[11px] font-bold tracking-[0.12em] text-[var(--pdf-text-heading)] hover:underline"
          >
            QUE
          </Link>
          <span className="text-[var(--pdf-text-faint)]">/</span>
          <span className="truncate text-[12px] font-semibold text-[var(--pdf-text-primary)]">
            Managed Plane
          </span>
          <span className="hidden rounded-[4px] border border-solid border-[var(--pdf-accent-border)] bg-[var(--pdf-accent-surface)] px-[8px] py-[2px] text-[10px] font-semibold tracking-[0.5px] text-[var(--pdf-accent)] uppercase sm:inline">
            Offer B · SQL
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-[10px]">
          <Link
            to="/managed"
            className="hidden text-[11px] text-[var(--pdf-text-muted)] hover:text-[var(--pdf-text-primary)] sm:inline"
          >
            Datasets
          </Link>
          <Link
            to="/chat"
            className="hidden text-[11px] text-[var(--pdf-text-muted)] hover:text-[var(--pdf-text-primary)] sm:inline"
          >
            AI Chat
          </Link>
          <ThemeToggle compact />
          <AuthSessionControls />
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
