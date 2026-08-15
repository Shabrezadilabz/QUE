import { Link, NavLink } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { MobileNav } from '@/components/MobileNav'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { PresenceBar } from '@/components/PresenceBar'
import {
  primaryNavLinkClass,
  sideNavLinkClass,
} from '@/components/primaryNavStyles'
import {
  OnboardingRoadmapDialog,
  OnboardingRoadmapTrigger,
} from '@/components/OnboardingRoadmapDialog'
import { IdeStatusBar } from '@/components/IdeStatusBar'
import { QueLogo } from '@/components/QueLogo'

interface QueAppChromeProps {
  children: ReactNode
  eyebrow?: string
}

const PRIMARY_LINKS = [
  { to: '/outcome', label: 'Outcome' },
  { to: '/workspace', label: 'Workspace' },
  { to: '/chat', label: 'Chat' },
  { to: '/sources', label: 'Sources' },
  { to: '/joins', label: 'Joins' },
  { to: '/ship', label: 'Ship' },
] as const

const SIDE_LINKS = [
  { to: '/jobs', label: 'Jobs' },
  { to: '/proposals', label: 'Proposals' },
  { to: '/transforms', label: 'Transforms' },
  { to: '/rules', label: 'Rules' },
  { to: '/metrics', label: 'Metrics' },
  { to: '/bi', label: 'Certified BI' },
  { to: '/managed', label: 'Managed' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/eval', label: 'Eval' },
  { to: '/lineage', label: 'Lineage' },
  { to: '/validation', label: 'Validation' },
  { to: '/drift-agent', label: 'Drift' },
  { to: '/domains', label: 'Domains' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/glossary', label: 'Glossary' },
  { to: '/steward', label: 'Steward' },
  { to: '/agent', label: 'Agent' },
  { to: '/compliance', label: 'Compliance' },
  { to: '/product', label: 'Product' },
] as const

/**
 * Shared chrome — dark IDE shell: slim top nav + collapsible left tools.
 * All routes preserved; IA matches training-manual structure.
 */
export function QueAppChrome({
  children,
  eyebrow = 'SCHEMA-ONLY · NO RAW DATA',
}: QueAppChromeProps) {
  const [roadmapForce, setRoadmapForce] = useState(false)
  const [sideOpen, setSideOpen] = useState(true)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-on-surface">
      <header className="z-50 flex h-14 shrink-0 items-center justify-between gap-sm border-b border-outline-variant bg-surface-container-low px-md">
        <div className="flex min-w-0 items-center gap-md">
          <MobileNav showBelow="md" />
          <button
            type="button"
            className="hidden rounded border border-outline-variant px-sm py-xs font-label text-[10px] font-bold tracking-widest text-on-surface-variant uppercase hover:border-secondary hover:text-secondary md:inline-flex"
            onClick={() => setSideOpen((v) => !v)}
            aria-label={sideOpen ? 'Collapse tools sidebar' : 'Expand tools sidebar'}
            title="Toggle tools"
          >
            {sideOpen ? '« Tools' : 'Tools »'}
          </button>
          <Link
            to="/workspace"
            className="shrink-0 inline-flex items-center"
            aria-label="Que home"
          >
            <QueLogo size={28} withWordmark />
          </Link>
          <nav
            className="hidden h-14 items-stretch md:flex"
            aria-label="Primary"
          >
            <div className="mr-md flex items-center">
              <WorkspaceSwitcher variant="nav" />
            </div>
            {PRIMARY_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={primaryNavLinkClass}
                end={l.to === '/workspace' ? false : undefined}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-sm">
          <PresenceBar />
          <p className="hidden font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant/70 uppercase xl:block">
            {eyebrow}
          </p>
          <OnboardingRoadmapTrigger onOpen={() => setRoadmapForce(true)} />
          <AuthSessionControls />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sideOpen ? (
          <aside className="hidden w-[260px] shrink-0 flex-col border-r border-outline-variant bg-surface-container md:flex">
            <div className="border-b border-outline-variant px-md py-md">
              <p className="font-body text-[13px] font-semibold text-on-surface">
                Workspace tools
              </p>
              <p className="mt-0.5 font-label text-[10px] font-bold tracking-[0.05em] text-on-surface-variant uppercase">
                Schema · HITL · Ship
              </p>
              <Link
                to="/jobs"
                className="mt-md flex w-full items-center justify-center gap-2 rounded bg-secondary px-md py-1.5 font-body text-[13px] font-medium text-on-secondary hover:bg-secondary-fixed-dim"
              >
                + New job
              </Link>
            </div>
            <nav
              className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-sm"
              aria-label="Secondary"
            >
              {SIDE_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} className={sideNavLinkClass}>
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <div className="shrink-0 space-y-0.5 border-t border-outline-variant py-sm">
              <NavLink to="/settings" className={sideNavLinkClass}>
                Settings
              </NavLink>
              <NavLink to="/status" className={sideNavLinkClass}>
                API status
              </NavLink>
            </div>
          </aside>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>

      <IdeStatusBar extra={eyebrow} />

      <OnboardingRoadmapDialog
        forceOpen={roadmapForce}
        onCloseForce={() => setRoadmapForce(false)}
      />
    </div>
  )
}
