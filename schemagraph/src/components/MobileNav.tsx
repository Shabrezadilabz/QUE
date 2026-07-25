import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'

const links = [
  { to: '/chat', label: 'AI Chat' },
  { to: '/sources', label: 'Sources' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/settings', label: 'Settings' },
] as const

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'block border-l-2 border-primary-fixed bg-secondary-container px-md py-sm font-label text-[11px] font-bold tracking-[0.12em] text-primary-fixed uppercase'
    : 'block border-l-2 border-transparent px-md py-sm font-label text-[11px] font-bold tracking-[0.12em] text-on-surface-variant uppercase hover:text-primary-fixed'

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
        className="border border-outline-variant px-sm py-xs font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant uppercase hover:border-primary-fixed hover:text-primary-fixed"
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
            className="absolute top-full left-0 z-[100] mt-sm w-64 border border-outline-variant bg-surface-container py-sm shadow-none"
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
                    ? 'border-primary-fixed bg-secondary-container text-primary-fixed'
                    : 'border-transparent text-on-surface-variant hover:text-primary-fixed',
                ].join(' ')}
              >
                {w.name}
              </button>
            ))}
            <div className="my-sm border-t border-outline-variant" />
            <NavLink
              to="/workspace"
              className={linkClass}
              onClick={() => setOpen(false)}
            >
              Canvas
            </NavLink>
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </>
      ) : null}
    </div>
  )
}
