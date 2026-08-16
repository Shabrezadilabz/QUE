import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'
import { sideNavLinkClass } from '@/components/primaryNavStyles'

const primaryLinks = [
  { to: '/chat', label: 'Assistant' },
  { to: '/workspace', label: 'Workspace' },
  { to: '/sources', label: 'Sources' },
  { to: '/joins', label: 'Joins' },
  { to: '/ship', label: 'Ship' },
] as const

const toolLinks = [
  { to: '/jobs', label: 'Jobs' },
  { to: '/proposals', label: 'Proposals' },
  { to: '/transforms', label: 'Transforms' },
  { to: '/rules', label: 'Rules' },
  { to: '/metrics', label: 'Metrics' },
  { to: '/bi', label: 'Certified BI' },
  { to: '/managed', label: 'Managed' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/eval', label: 'Eval' },
  { to: '/lineage', label: 'Lineage' },
  { to: '/validation', label: 'Validation' },
  { to: '/drift-agent', label: 'Drift' },
  { to: '/domains', label: 'Domains' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/glossary', label: 'Glossary' },
  { to: '/steward', label: 'Steward' },
  { to: '/agent', label: 'Agent' },
  { to: '/compliance', label: 'Compliance' },
  { to: '/product', label: 'Product' },
  { to: '/settings', label: 'Settings' },
  { to: '/status', label: 'API status' },
] as const

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
            <div className="my-sm border-t border-outline-variant" />
            <p className="px-md py-xs font-label text-[9px] tracking-widest text-on-surface-variant">
              TOOLS
            </p>
            {toolLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={sideNavLinkClass}
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
