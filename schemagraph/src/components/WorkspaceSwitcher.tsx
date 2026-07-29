import { useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { workspaceNavTriggerClass } from '@/components/primaryNavStyles'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'

/**
 * Workspace picker — click to open dropdown and switch active workspace.
 * Switching reloads schema/sources/jobs for the selected workspace.
 */
export function WorkspaceSwitcher({
  variant = 'nav',
}: {
  /** nav = primary nav look; compact = denser header chip */
  variant?: 'nav' | 'compact'
}) {
  const { workspaces, workspaceId, setWorkspaceId, createWorkspace } = useAuth()
  const { role } = useWorkspaceRole()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const current =
    workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? null
  const onCanvas = location.pathname.startsWith('/workspace')

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function selectWorkspace(id: string) {
    if (id === workspaceId) {
      setOpen(false)
      navigate('/workspace')
      return
    }
    setWorkspaceId(id)
    setOpen(false)
    notifySchemaChanged('manual')
    navigate('/workspace')
  }

  async function onCreateWorkspace() {
    const name = newName.trim()
    if (!name) {
      setCreateError('Name required')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const ws = await createWorkspace(name)
      setNewName('')
      setOpen(false)
      notifySchemaChanged('manual')
      navigate('/workspace')
      void ws
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  if (!current && workspaces.length === 0) {
    return (
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={workspaceNavTriggerClass({ emphasized: open })}
        >
          Create workspace ▾
        </button>
        {open ? (
          <div className="absolute top-full left-0 z-[120] mt-sm min-w-[16rem] rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md shadow-lg">
            <p className="mb-sm font-label text-[9px] tracking-widest text-on-surface-variant">
              NEW WORKSPACE
            </p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name"
              className="mb-sm w-full border border-outline-variant px-sm py-sm font-body text-sm outline-none focus:border-primary"
            />
            {createError ? (
              <p className="mb-sm font-body text-xs text-error">{createError}</p>
            ) : null}
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCreateWorkspace()}
              className="w-full rounded-lg bg-primary-container py-sm font-label text-[11px] text-on-primary disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const triggerClass =
    variant === 'nav'
      ? workspaceNavTriggerClass({ emphasized: open || onCanvas })
      : 'flex max-w-[12rem] items-center gap-xs rounded-lg border border-outline-variant/50 bg-surface-container-high px-sm py-xs font-label text-[10px] font-semibold tracking-[0.12em] text-primary-container uppercase hover:border-primary'

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        title={
          current
            ? `${current.name} · ${role ?? current.role}`
            : 'Select workspace'
        }
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
      >
        <span className="inline-flex max-w-[10rem] items-center gap-1 truncate sm:max-w-[14rem]">
          <span className="truncate">{current?.name ?? 'Workspace'}</span>
          <span aria-hidden className="shrink-0 text-[10px] opacity-70">
            ▾
          </span>
        </span>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Workspaces"
          className="absolute top-full left-0 z-[120] mt-sm min-w-[15rem] overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest py-xs shadow-lg"
        >
          <p className="px-md py-xs font-label text-[9px] tracking-widest text-on-surface-variant">
            SWITCH WORKSPACE
          </p>
          {workspaces.map((w) => {
            const active = w.id === workspaceId
            return (
              <button
                key={w.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => selectWorkspace(w.id)}
                className={[
                  'flex w-full items-start justify-between gap-md px-md py-sm text-left transition-colors',
                  active
                    ? 'border-l-2 border-primary bg-secondary-container'
                    : 'border-l-2 border-transparent hover:bg-surface-container-high',
                ].join(' ')}
              >
                <span>
                  <span className="block font-body text-sm font-semibold text-on-surface">
                    {w.name}
                  </span>
                  <span className="mt-xs block font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
                    {w.slug} · {w.role}
                  </span>
                </span>
                {active ? (
                  <span className="font-label text-[9px] tracking-widest text-primary">
                    ACTIVE
                  </span>
                ) : null}
              </button>
            )
          })}
          <div className="mt-xs border-t border-outline-variant/30 px-md py-sm">
            <p className="mb-xs font-label text-[9px] tracking-widest text-on-surface-variant">
              NEW WORKSPACE
            </p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="mb-xs w-full border border-outline-variant/40 bg-surface-container-low px-sm py-xs font-body text-xs outline-none focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void onCreateWorkspace()
                }
              }}
            />
            {createError ? (
              <p className="mb-xs font-body text-[11px] text-error">{createError}</p>
            ) : null}
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCreateWorkspace()}
              className="mb-sm w-full rounded-lg bg-primary-container py-xs font-label text-[10px] tracking-widest text-on-primary disabled:opacity-40"
            >
              {creating ? 'CREATING…' : '+ CREATE WORKSPACE'}
            </button>
            <button
              type="button"
              className="font-label text-[11px] tracking-wide text-primary underline"
              onClick={() => {
                setOpen(false)
                navigate('/workspace')
              }}
            >
              Open canvas
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
