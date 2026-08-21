import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

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
    <div className="flex size-full min-h-0 flex-col bg-[#0b0e11] text-[#d4dbe3]">
      <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-solid border-[#424850] bg-[#0f1215] px-[24px]">
        <div className="flex items-center gap-[8px]">
          <Link to="/" className="flex items-center gap-[8px]">
            <div className="relative size-[24px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src={PUBLIC_ASSETS.logo} />
            </div>
            <span className="text-[18px] font-bold text-[#ecf0f4]">Que</span>
          </Link>
          <div className="h-[16px] w-px shrink-0 bg-[#424850]" />
          {sectionBadge ? (
            <span className="rounded-[4px] bg-[#1e2328] px-[8px] py-[2px] text-[11px] font-bold text-[#d4dbe3]">
              {section}
            </span>
          ) : (
            <span className="text-[14px] font-normal text-[#a3afbe]">{section}</span>
          )}
        </div>
        {headerRight}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      {footer}
    </div>
  )
}

export function FigmaStatusFooter() {
  return (
    <footer className="flex shrink-0 items-start justify-between border-t border-solid border-[#424850] bg-[#0f1215] px-[24px] py-[20px] text-[12px] text-[#a3afbe]">
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
