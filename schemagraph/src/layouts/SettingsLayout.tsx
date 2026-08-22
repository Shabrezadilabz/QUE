import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import {
  SettingsOrgNavIcon,
  SettingsSearchInput,
} from '@/components/settings/SettingsPdfUi'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

const ORG_NAV = [
  { to: '/settings/members', label: 'Members', id: 'members' },
  { to: '/settings/security', label: 'Security', id: 'security' },
  { to: '/settings/ai-policy', label: 'AI Policy', id: 'ai-policy' },
  { to: '/settings/automation', label: 'Automation', id: 'automation' },
  { to: '/settings/billing', label: 'Billing', id: 'billing', adminOnly: true },
] as const

/** Settings — PDF page 10 layout (org nav + section outlet). */
export function SettingsLayout() {
  const { canAdmin } = useWorkspaceRole()
  const [settingsQuery, setSettingsQuery] = useState('')

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <header className="shrink-0 border-b border-solid border-[#424850] bg-[#0f1215] px-[24px] pb-[24px] pt-[28px]">
          <div className="flex flex-wrap items-start justify-between gap-[16px]">
            <div className="min-w-0">
              <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[#d4dbe3]">
                Settings
              </h1>
              <p className="mt-[4px] text-[12px] leading-[18px] text-[#c8cdd3] md:text-[14px] md:leading-[20px]">
                Configure workspaces, integrations, access credentials and billing
                controls.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
              <SettingsSearchInput
                value={settingsQuery}
                onChange={setSettingsQuery}
                placeholder="Search settings..."
                className="hidden w-[220px] sm:block"
              />
              <AuthSessionControls />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-[24px] p-[24px]">
          <aside className="hidden w-[210px] shrink-0 flex-col gap-[4px] md:flex">
            <p className="mb-[8px] px-[10px] text-[10px] font-extrabold tracking-[1px] text-[#8a9099] uppercase">
              Organization
            </p>
            {ORG_NAV.map((item) => {
              if ('adminOnly' in item && item.adminOnly && !canAdmin) return null
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-[10px] rounded-[4px] border border-solid px-[10px] py-[9px] text-[13px] transition-colors',
                      isActive
                        ? 'border-[#424850] bg-[#15191e] font-semibold text-[#d4dbe3]'
                        : 'border-transparent font-normal text-[#a3afbe] hover:bg-[#15191e] hover:text-[#c8cdd3]',
                    ].join(' ')
                  }
                >
                  <SettingsOrgNavIcon id={item.id} />
                  {item.label}
                </NavLink>
              )
            })}
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex gap-[8px] overflow-x-auto border-b border-solid border-[#424850] pb-[8px] md:hidden">
              {ORG_NAV.map((item) => {
                if ('adminOnly' in item && item.adminOnly && !canAdmin) return null
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'shrink-0 rounded-[4px] border border-solid px-[12px] py-[6px] text-[11px]',
                        isActive
                          ? 'border-[#424850] bg-[#15191e] text-[#d4dbe3]'
                          : 'border-transparent bg-[#0f1215] text-[#a3afbe]',
                      ].join(' ')
                    }
                  >
                    {item.label}
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
