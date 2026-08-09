import { useEffect, useState } from 'react'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createWorkspaceRuleApi,
  fetchWorkspaceRules,
} from '@/services/stitchApi'

/** Cursor-like always-on org rules. */
export function RulesPage() {
  const { canWrite } = useWorkspaceRole()
  const [items, setItems] = useState<
    {
      id: string
      kind: string
      title: string
      body: string
      enabled: boolean
      source: string
    }[]
  >([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('join')
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setItems(await fetchWorkspaceRules())
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  async function create() {
    if (!canWrite || !title.trim() || !body.trim()) return
    await createWorkspaceRuleApi({ kind, title: title.trim(), body: body.trim() })
    setTitle('')
    setBody('')
    await reload()
  }

  return (
    <QueAppChrome eyebrow="RULES · CURSOR MEMORY">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-3xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Workspace rules</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Always-on guidance for AI chat, joins, and transforms — learned from
          Promote and written by admins (like Cursor rules).
        </p>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {canWrite ? (
          <div className="mt-lg space-y-sm rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
            >
              <option value="join">join</option>
              <option value="naming">naming</option>
              <option value="privacy">privacy</option>
              <option value="sql">sql</option>
              <option value="transform">transform</option>
              <option value="general">general</option>
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Rule title"
              className="w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="When stitching X to Y, prefer…"
              className="w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
            />
            <button
              type="button"
              onClick={() => void create()}
              className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary"
            >
              Add rule
            </button>
          </div>
        ) : null}
        <ul className="mt-lg space-y-sm">
          {items.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md"
            >
              <p className="font-label text-[13px] font-semibold">
                [{r.kind}] {r.title}
              </p>
              <p className="mt-1 text-[12px] text-on-surface-variant">{r.body}</p>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                source {r.source} · {r.enabled ? 'on' : 'off'}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </QueAppChrome>
  )
}

export default RulesPage
