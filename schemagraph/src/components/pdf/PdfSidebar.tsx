import { NavLink, useLocation } from 'react-router-dom'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import { QueNavIcon } from '@/components/que/queNavIcons'
import { QUE_PDF_NAV, resolveActiveNav } from '@/components/que/queNavConfig'

function NavItem({
  to,
  label,
  navId,
  active,
  end,
}: {
  to: string
  label: string
  navId: (typeof QUE_PDF_NAV)[number]['id']
  active: boolean
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={[
        'flex w-full flex-col items-center gap-[3px] rounded-[4px] border border-solid px-[6px] py-[6px] transition-colors',
        active
          ? 'pdf-nav-active'
          : 'border-transparent text-[var(--pdf-nav-icon)] hover:text-[var(--pdf-text-secondary)]',
      ].join(' ')}
    >
      <QueNavIcon
        id={navId}
        className={[
          'size-[14px] shrink-0',
          active ? 'text-[var(--pdf-nav-icon-active)]' : 'text-current',
        ].join(' ')}
      />
      <span
        className={[
          'text-center text-[7px] font-semibold leading-none',
          active ? 'text-[var(--pdf-nav-icon-active)]' : '',
        ].join(' ')}
      >
        {label}
      </span>
    </NavLink>
  )
}

function AccountNavIcon({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={[
        'size-[14px] shrink-0',
        active ? 'bg-[var(--pdf-nav-icon-active)]' : 'bg-[var(--pdf-nav-icon)]',
      ].join(' ')}
      style={{
        maskImage: `url(${FIGMA_NAV.account})`,
        WebkitMaskImage: `url(${FIGMA_NAV.account})`,
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

/** PDF app sidebar — condensed groups + distinct icons. */
export function PdfSidebar() {
  const { pathname } = useLocation()
  const active = resolveActiveNav(pathname)

  return (
    <aside className="pdf-sidebar hidden h-full w-[72px] shrink-0 flex-col overflow-hidden border-r border-solid border-[var(--pdf-border)] px-[8px] py-[12px] md:flex">
      <div className="shrink-0 border-b border-solid border-[color-mix(in_srgb,var(--pdf-border)_60%,transparent)] pb-[10px]">
        <NavLink to="/hub" className="flex flex-col items-center gap-[2px]">
          <div className="relative size-[28px] shrink-0">
            <img alt="Que" className="absolute inset-0 block size-full max-w-none" src={FIGMA_NAV.logo} />
          </div>
          <span className="text-[9px] font-black leading-none text-[var(--pdf-text-heading)]">Que</span>
        </NavLink>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-[7px] overflow-y-auto overflow-x-hidden pt-[10px]"
        aria-label="Main"
      >
        {QUE_PDF_NAV.map((item) => (
          <NavItem
            key={item.id}
            to={item.to}
            label={item.label}
            navId={item.id}
            active={active === item.id}
            end={item.to === '/hub' || item.to === '/workspace'}
          />
        ))}
      </nav>

      <div className="mt-[8px] flex shrink-0 flex-col gap-[3px] border-t border-solid border-[color-mix(in_srgb,var(--pdf-border)_60%,transparent)] pt-[8px]">
        <NavLink
          to="/status"
          className="flex flex-col items-center gap-[1px] py-[4px] text-[7px] leading-none text-[var(--pdf-nav-icon)] hover:text-[var(--pdf-text-secondary)]"
        >
          <span className="text-[11px] leading-none">?</span>
          Support
        </NavLink>
        <NavLink
          to="/settings/members"
          className={({ isActive }) =>
            [
              'flex w-full flex-col items-center gap-[3px] rounded-[4px] border border-solid px-[6px] py-[6px] transition-colors',
              isActive
                ? 'pdf-nav-active'
                : 'border-transparent text-[var(--pdf-nav-icon)] hover:text-[var(--pdf-text-secondary)]',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <AccountNavIcon active={isActive} />
              <span
                className={[
                  'text-[7px] font-semibold leading-none',
                  isActive ? 'text-[var(--pdf-nav-icon-active)]' : '',
                ].join(' ')}
              >
                Account
              </span>
            </>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
