import { NavLink, useLocation } from 'react-router-dom'
import { QueLogo } from '@/components/QueLogo'
import { MobileNav } from '@/components/MobileNav'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { QUE_V2_NAV, resolveActiveNav, type QueNavId } from '@/components/que/queNavConfig'

const NAV_ICONS: Record<QueNavId | 'settings', string> = {
  workspace: '▦',
  hub: '◉',
  load: '⇅',
  model: '◫',
  catalog: '◎',
  pipes: '⎇',
  observe: '◈',
  sources: '⎔',
  joins: '↔',
  chat: '◻',
  jobs: '▶',
  lineage: '⤴',
  compliance: '◆',
  marketplace: '▣',
  metrics: '◉',
  bi: '▥',
  settings: '⚙',
}

function NavItem({
  to,
  label,
  icon,
  active,
}: {
  to: string
  label: string
  icon: string
  active: boolean
}) {
  return (
    <NavLink
      to={to}
      end={to === '/workspace'}
      className={[
        'flex w-full flex-col items-center gap-1 rounded-md p-2 transition-colors',
        active
          ? 'border border-secondary bg-secondary-container text-secondary'
          : 'border border-transparent text-on-surface-muted hover:text-on-surface',
      ].join(' ')}
      title={label}
    >
      <span className="font-mono text-base leading-none" aria-hidden>
        {icon}
      </span>
      <span className="font-label text-[9px] font-semibold leading-tight">
        {label}
      </span>
    </NavLink>
  )
}

/** Figma v2 — 80px icon rail + mobile menu. */
export function QueV2Sidebar() {
  const { pathname } = useLocation()
  const active = resolveActiveNav(pathname)

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden h-full w-20 shrink-0 flex-col border-r border-outline-variant bg-surface md:flex">
        <div className="flex flex-col items-center gap-6 px-3 py-6">
          <NavLink to="/workspace" aria-label="Que home">
            <QueLogo size={32} />
            <span className="mt-1 block text-center font-label text-[10px] font-black tracking-wide text-on-background">
              QUE
            </span>
          </NavLink>
          <nav className="flex w-full flex-col gap-2" aria-label="Main">
            {QUE_V2_NAV.map((item) => (
              <NavItem
                key={item.id}
                to={item.to}
                label={item.label}
                icon={NAV_ICONS[item.id]}
                active={active === item.id}
              />
            ))}
          </nav>
        </div>
        <div className="mt-auto px-3 pb-6">
          <NavItem
            to="/settings"
            label="Settings"
            icon={NAV_ICONS.settings}
            active={active === 'settings'}
          />
        </div>
      </aside>

      {/* Mobile top strip */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-outline-variant bg-surface px-3 md:hidden">
        <MobileNav showBelow="md" />
        <QueLogo size={24} withWordmark />
        <AuthSessionControls />
      </div>
    </>
  )
}
