import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'

const PUBLIC_ASSETS = {
  logo: '/figma/public/logo.svg',
  dot: '/figma/public/dot.svg',
  check: '/figma/public/check.svg',
} as const

interface FigmaPublicShellProps {
  section: string
  sectionBadge?: boolean
  headerRight?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Public pages — PDF pages 1, 11, 12. Logo header + content, no sidebar. */
export function FigmaPublicShell({
  section,
  sectionBadge = false,
  headerRight,
  children,
  footer,
}: FigmaPublicShellProps) {
  return (
    <div className="pdf-app-canvas flex size-full min-h-0 flex-col">
      <header className="pdf-page-header flex h-[64px] shrink-0 items-center justify-between border-b border-solid px-[24px]">
        <div className="flex items-center gap-[8px]">
          <Link to="/" className="flex items-center gap-[8px]">
            <div className="relative size-[24px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src={PUBLIC_ASSETS.logo} />
            </div>
            <span className="text-[18px] font-bold text-[var(--pdf-text-heading)]">Que</span>
          </Link>
          <div className="h-[16px] w-px shrink-0 bg-[var(--pdf-border)]" />
          {sectionBadge ? (
            <span className="rounded-[4px] bg-[var(--pdf-bg-elevated)] px-[8px] py-[2px] text-[11px] font-bold text-[var(--pdf-text-primary)]">
              {section}
            </span>
          ) : (
            <span className="text-[14px] font-normal text-[var(--pdf-text-muted)]">{section}</span>
          )}
        </div>
        <div className="flex items-center gap-[12px]">
          {headerRight}
          <ThemeToggle compact />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      {footer}
    </div>
  )
}

export function FigmaStatusFooter() {
  return (
    <footer className="flex shrink-0 items-start justify-between border-t border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[24px] py-[20px] text-[12px] text-[var(--pdf-text-muted)]">
      <p>© 2024 Que Data Engine. All rights reserved.</p>
      <div className="flex gap-[16px]">
        <Link to="/product" className="hover:text-[#ecf0f4]">
          System Architecture
        </Link>
        <Link to="/status" className="hover:text-[#ecf0f4]">
          Incident History
        </Link>
        <Link to="/sales" className="hover:text-[#ecf0f4]">
          Support Center
        </Link>
        <Link to="/sales" className="hover:text-[#ecf0f4]">
          Contact Engineering
        </Link>
      </div>
    </footer>
  )
}

export function FigmaLiveUpdates() {
  return (
    <span className="flex items-center gap-[8px] text-[13px] font-semibold text-[#7aecd0]">
      <img alt="" className="size-[8px]" src={PUBLIC_ASSETS.dot} />
      Live Updates
    </span>
  )
}

export { PUBLIC_ASSETS }
