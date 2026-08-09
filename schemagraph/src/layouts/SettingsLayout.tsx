import { NavLink, Outlet } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

const NAV = [
  { to: '/settings/members', label: 'Members', hint: 'Roles & invites' },
  { to: '/settings/security', label: 'Security', hint: 'SSO · API keys · BYOK' },
  {
    to: '/settings/enterprise',
    label: 'Enterprise',
    hint: 'SCIM · CMK · SIEM · SOC2 pack',
    adminOnly: true,
  },
  { to: '/settings/automation', label: 'Automation', hint: 'Schedules · runners' },
  { to: '/settings/governance', label: 'Governance', hint: 'Drift · audit · attest' },
  { to: '/settings/team', label: 'Team OS', hint: 'Roles · Slack digests' },
  { to: '/settings/billing', label: 'Billing', hint: 'Seats · checkout', adminOnly: true },
  { to: '/settings/ai-policy', label: 'AI & Policy', hint: 'Flags · GitHub · dbt' },
] as const

/**
 * Settings shell — primary chrome + secondary side nav + nested outlet.
 */
export function SettingsLayout() {
  const { canAdmin } = useWorkspaceRole()

  return (
    <QueAppChrome eyebrow="SETTINGS · WORKSPACE">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-secondary-container/30 bg-background md:flex lg:w-64">
          <div className="border-b border-outline-variant/20 px-md py-md">
            <p className="font-label text-[10px] tracking-[0.16em] text-on-surface-variant/70 uppercase">
              Workspace
            </p>
            <h1 className="mt-xs font-headline text-base font-semibold text-on-surface">
              Settings
            </h1>
          </div>
          <nav className="flex flex-1 flex-col gap-xs overflow-y-auto p-sm" aria-label="Settings sections">
            {NAV.map((item) => {
              if ('adminOnly' in item && item.adminOnly && !canAdmin) return null
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'rounded-lg px-md py-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
                    ].join(' ')
                  }
                >
                  <span className="block font-label text-[12px] font-medium tracking-wide">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block font-body text-[11px] opacity-70">
                    {item.hint}
                  </span>
                </NavLink>
              )
            })}
          </nav>
        </aside>

        {/* Mobile section strip */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex gap-xs overflow-x-auto border-b border-outline-variant/20 bg-background px-sm py-sm md:hidden">
            {NAV.map((item) => {
              if ('adminOnly' in item && item.adminOnly && !canAdmin) return null
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'shrink-0 rounded-full px-md py-xs font-label text-[11px] tracking-wide',
                      isActive
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface-variant',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              )
            })}
          </div>
          <Outlet />
        </div>
      </div>
    </QueAppChrome>
  )
}
