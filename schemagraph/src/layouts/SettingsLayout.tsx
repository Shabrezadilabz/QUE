import { NavLink, Outlet } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader } from '@/components/pdf/PdfUi'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

const ORG_NAV = [
  { to: '/settings/members', label: 'Members' },
  { to: '/settings/security', label: 'Security' },
  { to: '/settings/ai-policy', label: 'AI Policy' },
  { to: '/settings/automation', label: 'Automation' },
  { to: '/settings/billing', label: 'Billing', adminOnly: true },
] as const

/** Settings — pixel-faithful Figma v2 frame (2:1050). */
export function SettingsLayout() {
  const { canAdmin } = useWorkspaceRole()

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Settings"
          subtitle="Configure workspaces, integrations, access credentials and billing controls."
        />

        <div className="flex min-h-0 flex-1 gap-[24px] p-[24px]">
          <aside className="hidden w-[220px] shrink-0 flex-col gap-[4px] md:flex">
            <p className="text-[11px] font-extrabold tracking-[1px] text-[#a3afbe] uppercase">
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
                      'rounded-[4px] p-[10px] text-[13px]',
                      isActive
                        ? 'pdf-shine font-bold text-[#d0d8e0]'
                        : 'font-normal text-[#a3afbe] hover:bg-[#15191e]',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              )
            })}
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex gap-[8px] overflow-x-auto border-b border-solid border-[#2a313c] pb-[8px] md:hidden">
              {ORG_NAV.map((item) => {
                if ('adminOnly' in item && item.adminOnly && !canAdmin) return null
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'shrink-0 rounded-full px-[12px] py-[4px] text-[11px]',
                        isActive
                          ? 'bg-[#d0d8e0] text-[#323840]'
                          : 'bg-[#15191e] text-[#a3afbe]',
                      ].join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}
