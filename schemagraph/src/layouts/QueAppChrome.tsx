import { Link, NavLink } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { MobileNav } from '@/components/MobileNav'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { PresenceBar } from '@/components/PresenceBar'
import { primaryNavLinkClass } from '@/components/primaryNavStyles'
import {
  OnboardingRoadmapDialog,
  OnboardingRoadmapTrigger,
} from '@/components/OnboardingRoadmapDialog'

interface QueAppChromeProps {
  children: ReactNode
  eyebrow?: string
}

/** Shared top chrome — Sunset Clay (cream / terracotta). */
export function QueAppChrome({
  children,
  eyebrow = 'SCHEMA-ONLY · NO RAW DATA',
}: QueAppChromeProps) {
  const [roadmapForce, setRoadmapForce] = useState(false)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-canvas">
      <header className="flex h-12 shrink-0 items-center justify-between gap-sm border-b border-secondary-container/30 bg-background px-md sm:h-12 sm:px-lg lg:px-xl">
        <div className="flex min-w-0 items-center gap-md sm:gap-lg">
          <MobileNav showBelow="md" />
          <Link
            to="/workspace"
            className="shrink-0 font-headline text-[1.15rem] font-bold leading-none tracking-tight text-primary sm:text-[1.25rem]"
          >
            Que
          </Link>
          <nav
            className="hidden items-center gap-4 md:flex lg:gap-5"
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
            <NavLink to="/joins" className={primaryNavLinkClass}>
              Joins
            </NavLink>
            <NavLink to="/proposals" className={primaryNavLinkClass}>
              Proposals
            </NavLink>
            <NavLink to="/transforms" className={primaryNavLinkClass}>
              Transforms
            </NavLink>
            <NavLink to="/rules" className={primaryNavLinkClass}>
              Rules
            </NavLink>
            <NavLink to="/metrics" className={primaryNavLinkClass}>
              Metrics
            </NavLink>
            <NavLink to="/eval" className={primaryNavLinkClass}>
              Eval
            </NavLink>
            <NavLink to="/marketplace" className={primaryNavLinkClass}>
              Marketplace
            </NavLink>
            <NavLink to="/domains" className={primaryNavLinkClass}>
              Domains
            </NavLink>
            <NavLink to="/catalog" className={primaryNavLinkClass}>
              Catalog
            </NavLink>
            <NavLink to="/jobs" className={primaryNavLinkClass}>
              Jobs
            </NavLink>
            <NavLink to="/managed" className={primaryNavLinkClass}>
              Managed
            </NavLink>
            <NavLink to="/bi" className={primaryNavLinkClass}>
              BI
            </NavLink>
            <NavLink to="/compliance" className={primaryNavLinkClass}>
              Compliance
            </NavLink>
            <NavLink to="/product" className={primaryNavLinkClass}>
              Product
            </NavLink>
            <NavLink to="/lineage" className={primaryNavLinkClass}>
              Lineage
            </NavLink>
            <NavLink to="/steward" className={primaryNavLinkClass}>
              Steward
            </NavLink>
            <NavLink to="/agent" className={primaryNavLinkClass}>
              Agent
            </NavLink>
            <NavLink to="/settings" className={primaryNavLinkClass}>
              Settings
            </NavLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-sm sm:gap-md">
          <PresenceBar />
          <p className="hidden font-label text-[10px] tracking-[0.14em] text-on-surface-variant/70 xl:block">
            {eyebrow}
          </p>
          <OnboardingRoadmapTrigger onOpen={() => setRoadmapForce(true)} />
          <AuthSessionControls />
        </div>
      </header>
      {children}
      <OnboardingRoadmapDialog
        forceOpen={roadmapForce}
        onCloseForce={() => setRoadmapForce(false)}
      />
    </div>
  )
}
