import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'
import { sideNavLinkClass } from '@/components/primaryNavStyles'
import { QUE_PDF_NAV, QUE_SECTION_NAV, type QueNavId } from '@/components/que/queNavConfig'

const primaryLinks = [
  { to: '/hub', label: 'Platform' },
  { to: '/workspace', label: 'Workspace' },
  { to: '/sources', label: 'Sources' },
  { to: '/joins', label: 'Joins' },
  { to: '/chat', label: 'Chat' },
] as const

const groupLinks: { group: QueNavId; label: string }[] = [
  { group: 'build', label: 'Build' },
  { group: 'analytics', label: 'Analytics' },
  { group: 'govern', label: 'Govern' },
]

/** Hamburger + drawer for viewports where primary nav is hidden. */
export function MobileNav({ showBelow = 'lg' }: { showBelow?: 'md' | 'lg' }) {
  const [open, setOpen] = useState(false)
  const hideClass = showBelow === 'md' ? 'md:hidden' : 'lg:hidden'
  const { workspaces, workspaceId, setWorkspaceId } = useAuth()
  const navigate = useNavigate()

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
    navigate('/workspace')
  }

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
              PRIMARY
            </p>
            {primaryLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={sideNavLinkClass}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            {groupLinks.map(({ group, label }) => {
              const section = QUE_SECTION_NAV[group]
              const entry = QUE_PDF_NAV.find((n) => n.id === group)
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
            })}
            <div className="my-sm border-t border-outline-variant" />
            <NavLink
              to="/settings"
              className={sideNavLinkClass}
              onClick={() => setOpen(false)}
            >
              Settings
            </NavLink>
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
