import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { QueLogo } from '@/components/QueLogo'
import { ThemeToggle } from '@/components/ThemeToggle'

type QuePublicShellProps = {
  section?: string
  children: ReactNode
  footer?: boolean
  headerRight?: ReactNode
}

const FOOTER_LINKS = [
  { label: 'System Architecture', href: '/product' },
  { label: 'Incident History', href: '/status' },
  { label: 'Support Center', href: '/sales' },
  { label: 'Contact Engineering', href: '/sales' },
] as const

/** Public page chrome — Figma header + optional footer. */
export function QuePublicShell({
  section,
  children,
  footer = true,
  headerRight,
}: QuePublicShellProps) {
  return (
    <div className="flex min-h-full flex-col bg-canvas text-on-surface">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-low px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/login" aria-label="Que home">
            <QueLogo size={24} withWordmark />
          </Link>
          {section ? (
            <>
              <span
                className="hidden h-4 w-px bg-outline-variant sm:block"
                aria-hidden
              />
              <span className="hidden font-body text-sm text-on-surface-variant sm:inline">
                {section}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {headerRight}
          <ThemeToggle compact />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>

      {footer ? (
        <footer className="flex shrink-0 flex-col gap-3 border-t border-outline-variant bg-surface-container-low px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-body text-xs text-on-surface-variant">
            © {new Date().getFullYear()} Que Data Engine. All rights reserved.
          </p>
          <nav
            className="flex flex-wrap gap-x-6 gap-y-2"
            aria-label="Public footer"
          >
            {FOOTER_LINKS.map((l) => (
              <Link
                key={l.label}
                to={l.href}
                className="font-body text-xs text-on-surface-variant transition-colors hover:text-secondary"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </footer>
      ) : null}
    </div>
  )
}

/** Small caps divider label (OR CONTINUE WITH). */
export function QueDividerLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 border-t border-outline-variant" />
      <span className="font-label text-[10px] font-bold tracking-[0.1em] text-on-surface-variant uppercase">
        {children}
      </span>
      <div className="h-px flex-1 border-t border-outline-variant" />
    </div>
  )
}

/** Operational status pill — Figma teal badge. */
export function QueStatusPill({
  label,
  operational = true,
}: {
  label: string
  operational?: boolean
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 font-label text-xs font-semibold tracking-wide',
        operational
          ? 'border-secondary/20 bg-secondary-container text-secondary'
          : 'border-error/30 bg-error-container text-error',
      ].join(' ')}
    >
      <span
        className={[
          'size-2 rounded-full',
          operational
            ? 'bg-secondary shadow-[0_0_8px_rgba(122,236,208,0.6)]'
            : 'bg-error',
        ].join(' ')}
        aria-hidden
      />
      {label}
    </span>
  )
}
