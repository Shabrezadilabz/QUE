import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import type { SettingsNavId } from '@/components/figma/settingsNavAssets'
import {
  SettingsOrgNavIcon,
  SettingsSearchInput,
} from '@/components/settings/SettingsPdfUi'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

const ORG_NAV: {
  to: string
  label: string
  id: SettingsNavId
  adminOnly?: boolean
}[] = [
  { to: '/settings/members', label: 'Members', id: 'members' },
  { to: '/settings/security', label: 'Security', id: 'security' },
  { to: '/settings/ai-policy', label: 'AI Policy', id: 'ai-policy' },
  { to: '/settings/automation', label: 'Automation', id: 'automation' },
  { to: '/settings/billing', label: 'Billing', id: 'billing', adminOnly: true },
]

function SettingsBellButton() {
  return (
    <button
      type="button"
      aria-label="Notifications"
      className="pdf-btn-ghost inline-flex size-[32px] items-center justify-center rounded-[4px] p-0"
    >
      <div
        aria-hidden
        className="size-[15px] bg-[var(--pdf-text-muted)]"
        style={{
          maskImage: `url(${FIGMA_NAV.bell})`,
          WebkitMaskImage: `url(${FIGMA_NAV.bell})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
        }}
      />
    </button>
  )
}

/** Settings — PDF page 10 layout (org nav + section outlet). */
export function SettingsLayout() {
  const { canAdmin } = useWorkspaceRole()
  const [settingsQuery, setSettingsQuery] = useState('')

  return (
    <QueAppChrome flush hideTopBar>
      <div className="flex h-full min-h-0 flex-col bg-[var(--pdf-bg-canvas)]">
        <header className="pdf-page-header shrink-0 border-b border-solid px-[24px] pb-[20px] pt-[24px]">
          <div className="flex flex-wrap items-center justify-between gap-[16px]">
            <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[var(--pdf-text-primary)]">
              Settings
            </h1>
            <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
              <SettingsSearchInput
                value={settingsQuery}
                onChange={setSettingsQuery}
                placeholder="Search settings..."
                className="hidden w-[240px] sm:block"
              />
              <ThemeToggle compact />
              <SettingsBellButton />
              <AuthSessionControls />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-[24px] p-[24px]">
          <aside className="hidden w-[210px] shrink-0 flex-col gap-[2px] md:flex">
            <p className="mb-[10px] px-[10px] text-[10px] font-extrabold tracking-[1px] text-[var(--pdf-text-faint)] uppercase">
              Organization
            </p>
            {ORG_NAV.map((item) => {
              if (item.adminOnly && !canAdmin) return null
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-[10px] rounded-[4px] border border-solid px-[10px] py-[9px] text-[13px] transition-colors',
                      isActive
                        ? 'pdf-nav-active border-[var(--pdf-border)] font-semibold text-[var(--pdf-text-primary)]'
                        : 'border-transparent font-normal text-[var(--pdf-text-muted)] hover:bg-[var(--pdf-bg-elevated)] hover:text-[var(--pdf-text-secondary)]',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <SettingsOrgNavIcon id={item.id} active={isActive} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              )
            })}
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex gap-[8px] overflow-x-auto border-b border-solid border-[var(--pdf-border)] pb-[8px] md:hidden">
              {ORG_NAV.map((item) => {
                if (item.adminOnly && !canAdmin) return null
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'inline-flex shrink-0 items-center gap-[6px] rounded-[4px] border border-solid px-[12px] py-[6px] text-[11px]',
                        isActive
                          ? 'pdf-nav-active border-[var(--pdf-border)] text-[var(--pdf-text-primary)]'
                          : 'border-transparent bg-[var(--pdf-bg-shell)] text-[var(--pdf-text-muted)]',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <SettingsOrgNavIcon id={item.id} active={isActive} />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Outlet context={{ settingsQuery }} />
            </div>
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}
