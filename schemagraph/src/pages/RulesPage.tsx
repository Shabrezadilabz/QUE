import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { SchemaCustodyBanner } from '@/components/SchemaCustodyBanner'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createWorkspaceRuleApi,
  fetchWorkspaceRules,
} from '@/services/stitchApi'

/** Cursor-like always-on org rules + Promote / marketplace memory. */
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

  const learned = useMemo(
    () => items.filter((r) => r.source === 'promote' || r.source === 'marketplace'),
    [items],
  )

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
          Org memory so CEOs never invent keys — learned from Promote, marketplace
          packs, and admin edits (like Cursor rules).
        </p>
        <SchemaCustodyBanner className="mt-md" />
        <p className="mt-sm text-[12px] text-on-surface-variant">
          <Link to="/marketplace" className="text-secondary underline">
            Install a CEO pack
          </Link>{' '}
          to seed rules + Outcome, or{' '}
          <Link to="/joins" className="text-secondary underline">
            Promote a join
          </Link>{' '}
          to learn one automatically.
        </p>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}

        {learned.length ? (
          <section className="mt-lg rounded-xl border border-secondary/30 bg-secondary/10 p-md">
            <h2 className="font-headline text-sm font-semibold">
              Memory from Promote / packs ({learned.length})
            </h2>
            <ul className="mt-sm space-y-xs text-[12px]">
              {learned.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <span className="text-secondary">{r.source}</span> · [{r.kind}]{' '}
                  {r.title}
                </li>
              ))}
            </ul>
          </section>
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
