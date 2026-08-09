import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'

const links = [
  { to: '/workspace', label: 'Workspace' },
  { to: '/chat', label: 'AI Chat' },
  { to: '/sources', label: 'Sources' },
  { to: '/joins', label: 'Joins' },
  { to: '/proposals', label: 'Proposals' },
  { to: '/transforms', label: 'Transforms' },
  { to: '/rules', label: 'Rules' },
  { to: '/metrics', label: 'Metrics' },
  { to: '/eval', label: 'Eval' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/domains', label: 'Domains' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/managed', label: 'Managed' },
  { to: '/bi', label: 'BI' },
  { to: '/compliance', label: 'Compliance' },
  { to: '/product', label: 'Product' },
  { to: '/lineage', label: 'Lineage' },
  { to: '/steward', label: 'Steward' },
  { to: '/agent', label: 'Agent' },
  { to: '/settings', label: 'Settings' },
] as const

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'block rounded-lg border-l-2 border-primary bg-secondary-container px-md py-sm font-body text-[13px] font-medium text-primary'
    : 'block rounded-lg border-l-2 border-transparent px-md py-sm font-body text-[13px] font-normal text-on-surface-variant hover:text-primary'

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
        className="rounded-lg border border-outline-variant/50 px-sm py-xs font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant uppercase hover:border-primary-fixed hover:text-primary-fixed"
      >
        {open ? 'Close' : 'Menu'}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Dismiss menu"
            className="fixed inset-0 z-[90] bg-[#161a32]/40"
            onClick={() => setOpen(false)}
          />
          <nav
            id="stitch-mobile-nav"
            className="absolute top-full left-0 z-[100] mt-sm w-64 rounded-xl border border-sand/40 bg-surface-container-lowest py-sm shadow-lg"
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
