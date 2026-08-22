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
              className="w-full rounded bg-secondary py-sm font-label text-[11px] text-on-secondary disabled:opacity-40"
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
      : [
          'inline-flex min-w-[8.5rem] max-w-[13rem] items-center justify-between gap-[8px] rounded-[4px] border border-solid px-[10px] py-[7px] transition-colors',
          open
            ? 'border-[#6b7380] bg-[#1e2328] text-[#ecf0f4]'
            : 'border-[#424850] bg-[#15191e] text-[#d4dbe3] hover:border-[#6b7380] hover:bg-[#1e2328]',
        ].join(' ')

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
        <span className="min-w-0 truncate text-left text-[11px] font-semibold leading-none tracking-[0.02em] normal-case">
          {current?.name ?? 'Workspace'}
        </span>
        <ChevronDown open={open} />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Workspaces"
          className="absolute top-full left-0 z-[120] mt-[6px] min-w-[15rem] overflow-hidden rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] py-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          <p className="px-[12px] py-[6px] text-[9px] font-semibold tracking-[0.6px] text-[#8a9099] uppercase">
            Switch workspace
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
                  'flex w-full items-start justify-between gap-[12px] px-[12px] py-[8px] text-left transition-colors',
                  active
                    ? 'border-l-2 border-[#7aecd0] bg-[rgba(122,236,208,0.08)]'
                    : 'border-l-2 border-transparent hover:bg-[#15191e]',
                ].join(' ')}
              >
                <span>
                  <span className="block text-[13px] font-semibold text-[#d4dbe3]">
                    {w.name}
                  </span>
                  <span className="mt-[2px] block text-[10px] tracking-wide text-[#8a9099] uppercase">
                    {w.slug} · {w.role}
                  </span>
                </span>
                {active ? (
                  <span className="text-[9px] font-semibold tracking-[0.6px] text-[#7aecd0] uppercase">
                    Active
                  </span>
                ) : null}
              </button>
            )
          })}
          <div className="mt-[4px] border-t border-solid border-[#424850] px-[12px] py-[10px]">
            <p className="mb-[6px] text-[9px] font-semibold tracking-[0.6px] text-[#8a9099] uppercase">
              New workspace
            </p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="mb-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#15191e] px-[8px] py-[6px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#6b7380] focus:border-[#6b7380]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void onCreateWorkspace()
                }
              }}
            />
            {createError ? (
              <p className="mb-[6px] text-[11px] text-[#ff6b6b]">{createError}</p>
            ) : null}
            <button
              type="button"
              disabled={creating}
              onClick={() => void onCreateWorkspace()}
              className="pdf-btn-primary mb-[8px] w-full rounded-[4px] py-[7px] text-[10px] font-semibold tracking-[0.6px] uppercase disabled:opacity-40"
            >
              {creating ? 'Creating…' : '+ Create workspace'}
            </button>
            <button
              type="button"
              className="text-[11px] text-[#c8cdd3] underline hover:text-[#ecf0f4]"
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

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={[
        'shrink-0 text-[#8a9099] transition-transform',
        open ? 'rotate-180' : '',
      ].join(' ')}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
