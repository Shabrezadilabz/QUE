import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'
import { sideNavLinkClass } from '@/components/primaryNavStyles'
import {
  QUE_KPI_SECTION_NAV,
  QUE_SECTION_NAV,
  navItemsForRole,
  type QueNavId,
} from '@/components/que/queNavConfig'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

/** Hamburger + drawer for viewports where primary nav is hidden. */
export function MobileNav({ showBelow = 'lg' }: { showBelow?: 'md' | 'lg' }) {
  const [open, setOpen] = useState(false)
  const hideClass = showBelow === 'md' ? 'md:hidden' : 'lg:hidden'
  const { workspaces, workspaceId, setWorkspaceId } = useAuth()
  const { isBuilder } = useWorkspaceRole()
  const navigate = useNavigate()
  const items = navItemsForRole(isBuilder)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function selectWorkspace(id: string) {
    if (id !== workspaceId) {
      setWorkspaceId(id)
      notifySchemaChanged('manual')
    }
    setOpen(false)
    navigate(isBuilder ? '/workspace' : '/chat')
  }

  const sectionMap = isBuilder ? QUE_SECTION_NAV : QUE_KPI_SECTION_NAV

  return (
    <div className={`relative ${hideClass}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="stitch-mobile-nav"
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-outline-variant px-sm py-xs font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant uppercase hover:border-secondary hover:text-secondary"
      >
        {open ? 'Close' : 'Menu'}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Dismiss menu"
            className="fixed inset-0 z-[90] bg-black/50"
            onClick={() => setOpen(false)}
          />
          <nav
            id="stitch-mobile-nav"
            className="absolute top-full left-0 z-[100] mt-sm max-h-[80vh] w-64 overflow-y-auto rounded border border-outline-variant bg-surface-container-low py-sm shadow-lg"
            aria-label="Primary mobile"
          >
            <p className="px-md py-xs font-label text-[9px] tracking-widest text-on-surface-variant">
              WORKSPACES
            </p>
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => selectWorkspace(w.id)}
                className={[
                  'block w-full border-l-2 px-md py-sm text-left font-label text-[11px] font-bold tracking-[0.12em] uppercase',
                  w.id === workspaceId
                    ? 'border-secondary bg-surface-container-highest text-secondary'
                    : 'border-transparent text-on-surface-variant hover:text-secondary',
                ].join(' ')}
              >
                {w.name}
              </button>
            ))}
            <div className="my-sm border-t border-outline-variant" />
            <p className="px-md py-xs font-label text-[9px] tracking-widest text-on-surface-variant">
              {isBuilder ? 'PRIMARY' : 'KPI'}
            </p>
            {items.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={sideNavLinkClass}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            {isBuilder
              ? (['build', 'analytics', 'govern'] as QueNavId[]).map((group) => {
                  const section = sectionMap[group]
                  const entry = items.find((n) => n.id === group)
                  const label =
                    group === 'build'
                      ? 'Build'
                      : group === 'analytics'
                        ? 'Analytics'
                        : 'Govern'
                  return (
                    <div key={group}>
                      <p className="mt-sm px-md py-xs font-label text-[9px] tracking-widest text-on-surface-variant">
                        {label.toUpperCase()}
                      </p>
                      {entry ? (
                        <NavLink
                          to={entry.to}
                          className={sideNavLinkClass}
                          onClick={() => setOpen(false)}
                        >
                          {label} home
                        </NavLink>
                      ) : null}
                      {(section ?? []).map((l) => (
                        <NavLink
                          key={l.to}
                          to={l.to}
                          className={sideNavLinkClass}
                          onClick={() => setOpen(false)}
                        >
                          {l.label}
                        </NavLink>
                      ))}
                    </div>
                  )
                })
              : (sectionMap.analytics ?? []).map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={sideNavLinkClass}
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </NavLink>
                ))}
            <div className="my-sm border-t border-outline-variant" />
            {isBuilder ? (
              <NavLink
                to="/settings"
                className={sideNavLinkClass}
                onClick={() => setOpen(false)}
              >
                Settings
              </NavLink>
            ) : null}
            <NavLink
              to="/status"
              className={sideNavLinkClass}
              onClick={() => setOpen(false)}
            >
              API status
            </NavLink>
          </nav>
        </>
      ) : null}
    </div>
  )
}
