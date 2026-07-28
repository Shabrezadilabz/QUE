import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { MobileNav } from '@/components/MobileNav'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { primaryNavLinkClass } from '@/components/primaryNavStyles'

interface QueAppChromeProps {
  children: ReactNode
  eyebrow?: string
}

/** Shared top chrome — Sunset Clay (cream / terracotta). */
export function QueAppChrome({
  children,
  eyebrow = 'SCHEMA-ONLY · NO RAW DATA',
}: QueAppChromeProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between gap-md border-b border-secondary-container/30 bg-background px-md sm:h-16 sm:px-lg lg:px-xl">
        <div className="flex min-w-0 items-center gap-md sm:gap-lg lg:gap-xl">
          <MobileNav showBelow="md" />
          <Link
            to="/workspace"
            className="shrink-0 font-headline text-[1.35rem] font-bold leading-none tracking-tight text-primary sm:text-[1.65rem]"
          >
            Que
          </Link>
          <nav
            className="hidden items-center gap-5 md:flex lg:gap-7"
            aria-label="Primary"
          >
            <WorkspaceSwitcher variant="nav" />
            <NavLink to="/workspace" className={primaryNavLinkClass} end={false}>
              Workspace
            </NavLink>
            <NavLink to="/chat" className={primaryNavLinkClass}>
              AI Chat
            </NavLink>
            <NavLink to="/sources" className={primaryNavLinkClass}>
              Sources
            </NavLink>
            <NavLink to="/jobs" className={primaryNavLinkClass}>
              Jobs
            </NavLink>
            <NavLink to="/settings" className={primaryNavLinkClass}>
              Settings
            </NavLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-sm sm:gap-md">
          <p className="hidden font-label text-[10px] tracking-[0.14em] text-on-surface-variant/70 xl:block">
            {eyebrow}
          </p>
          <AuthSessionControls />
        </div>
      </header>
      {children}
    </div>
  )
}
