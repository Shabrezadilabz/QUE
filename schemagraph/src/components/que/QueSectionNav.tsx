import { NavLink, useLocation } from 'react-router-dom'
import {
  QUE_SECTION_NAV,
  resolveActiveNav,
  type QueNavId,
} from '@/components/que/queNavConfig'

/** Secondary tabs for grouped nav areas (Platform · Build · Analytics · Govern). */
export function QueSectionNav() {
  const { pathname } = useLocation()
  if (pathname === '/hub') return null
  const active = resolveActiveNav(pathname)
  const links = QUE_SECTION_NAV[active as QueNavId]
  if (!links?.length) return null

  return (
    <nav
      className="hidden shrink-0 border-b border-solid border-[var(--pdf-border)] bg-[color-mix(in_srgb,var(--pdf-bg-canvas)_92%,black)] px-3 md:flex md:px-[20px]"
      aria-label="Section"
    >
      <div className="flex gap-[2px] overflow-x-auto py-[6px]">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              [
                'shrink-0 rounded-[4px] px-[10px] py-[5px] text-[11px] font-semibold no-underline transition-colors',
                isActive
                  ? 'bg-[color-mix(in_srgb,var(--pdf-accent)_18%,transparent)] text-[var(--pdf-accent)]'
                  : 'text-[var(--pdf-text-faint)] hover:text-[var(--pdf-text-secondary)]',
              ].join(' ')
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
