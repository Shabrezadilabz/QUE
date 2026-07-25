import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { MobileNav } from '@/components/MobileNav'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'border-b-2 border-primary-fixed pb-1 font-label text-[11px] font-bold tracking-[0.12em] text-primary-fixed uppercase sm:text-xs'
    : 'font-label text-[11px] font-bold tracking-[0.12em] text-on-surface-variant uppercase transition-colors hover:text-primary-fixed sm:text-xs'

interface QueAppChromeProps {
  children: ReactNode
  eyebrow?: string
}

/** Shared top chrome for Chat / Jobs / other non-canvas pages. */
export function QueAppChrome({
  children,
  eyebrow = 'SCHEMA-ONLY · NO RAW DATA',
}: QueAppChromeProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-md border-b border-outline-variant px-md sm:h-16">
        <div className="flex min-w-0 items-center gap-sm sm:gap-md lg:gap-lg">
          <MobileNav showBelow="md" />
          <Link
            to="/workspace"
            className="shrink-0 font-headline text-xl font-bold tracking-tight text-on-surface sm:text-2xl"
          >
            Que
          </Link>
          <nav className="hidden items-center gap-md md:flex lg:gap-lg">
            <WorkspaceSwitcher variant="nav" />
            <NavLink to="/chat" className={navClass}>
              AI Chat
            </NavLink>
            <NavLink to="/sources" className={navClass}>
              Sources
            </NavLink>
            <NavLink to="/jobs" className={navClass}>
              Jobs
            </NavLink>
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-sm sm:gap-md">
          <p className="hidden font-label text-[10px] tracking-[0.14em] text-on-surface-variant xl:block">
            {eyebrow}
          </p>
          <AuthSessionControls />
        </div>
      </header>
      {children}
    </div>
  )
}
