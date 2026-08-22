import { NavLink, useLocation } from 'react-router-dom'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import { QUE_PDF_NAV, resolveActiveNav } from '@/components/que/queNavConfig'

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  return (
    <div
      aria-hidden
      className={[
        'size-[14px] shrink-0',
        active ? 'bg-[#d0d8e0]' : 'bg-[#8a9099]',
      ].join(' ')}
      style={{
        maskImage: `url(${icon})`,
        WebkitMaskImage: `url(${icon})`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  )
}

function NavItem({
  to,
  label,
  icon,
  active,
  end,
}: {
  to: string
  label: string
  icon: string
  active: boolean
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={[
        'flex w-full flex-col items-center gap-[3px] rounded-[4px] border border-solid px-[6px] py-[6px] transition-colors',
        active ? 'pdf-nav-active' : 'border-transparent text-[#8a9099] hover:text-[#c8cdd3]',
      ].join(' ')}
    >
      <NavIcon icon={icon} active={active} />
      <span
        className={[
          'text-center text-[7px] font-semibold leading-none',
          active ? 'text-[#d0d8e0]' : '',
        ].join(' ')}
      >
        {label}
      </span>
    </NavLink>
  )
}

/** PDF app sidebar — icon + label, slate shine active state. No top bar. */
export function PdfSidebar() {
  const { pathname } = useLocation()
  const active = resolveActiveNav(pathname)
  const settingsActive = active === 'settings'

  const icons: Record<string, string> = {
    workspace: FIGMA_NAV.workspace,
    sources: FIGMA_NAV.sources,
    joins: FIGMA_NAV.joins,
    chat: FIGMA_NAV.chat,
    jobs: FIGMA_NAV.jobs,
    lineage: FIGMA_NAV.lineage,
    compliance: FIGMA_NAV.compliance,
    marketplace: FIGMA_NAV.marketplace,
    metrics: FIGMA_NAV.jobs,
    bi: FIGMA_NAV.lineage,
  }

  return (
    <aside className="pdf-sidebar hidden h-full w-[72px] shrink-0 flex-col overflow-hidden border-r border-solid border-[#424850] bg-[#0b0e11] px-[8px] py-[12px] md:flex">
      <div className="shrink-0 border-b border-solid border-[#424850]/60 pb-[10px]">
        <NavLink to="/workspace" className="flex flex-col items-center gap-[1px]">
          <div className="relative size-[28px] shrink-0">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src={FIGMA_NAV.logo} />
          </div>
          <span className="text-[9px] font-black leading-none text-[#ecf0f4]">Que</span>
          <span className="text-[7px] font-medium leading-none text-[#8a9099]">Data Engine</span>
        </NavLink>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-[7px] overflow-hidden pt-[10px]"
        aria-label="Main"
      >
        {QUE_PDF_NAV.map((item) => (
          <NavItem
            key={item.id}
            to={item.to}
            label={item.label}
            icon={icons[item.id] ?? FIGMA_NAV.workspace}
            active={active === item.id}
            end={item.to === '/workspace'}
          />
        ))}
      </nav>

      <div className="mt-[8px] flex shrink-0 flex-col gap-[3px] border-t border-solid border-[#424850]/60 pt-[8px]">
        <NavLink
          to="/status"
          className="flex flex-col items-center gap-[1px] py-[4px] text-[7px] leading-none text-[#8a9099] hover:text-[#c8cdd3]"
        >
          <span className="text-[11px] leading-none">?</span>
          Support
        </NavLink>
        <NavLink
          to="/settings"
          className={[
            'flex w-full flex-col items-center gap-[3px] rounded-[4px] border border-solid px-[6px] py-[6px] transition-colors',
            settingsActive ? 'pdf-nav-active' : 'border-transparent text-[#8a9099] hover:text-[#c8cdd3]',
          ].join(' ')}
        >
          <NavIcon icon={FIGMA_NAV.settings} active={settingsActive} />
          <span
            className={[
              'text-[7px] font-semibold leading-none',
              settingsActive ? 'text-[#d0d8e0]' : '',
            ].join(' ')}
          >
            Settings
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
