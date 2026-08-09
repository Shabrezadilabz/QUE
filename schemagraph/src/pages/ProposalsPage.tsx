import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { fetchProposals, reviewProposalApi } from '@/services/stitchApi'

/** PR-like approve/diff inbox with unified diff view. */
export function ProposalsPage() {
  const { canWrite } = useWorkspaceRole()
  const [items, setItems] = useState<
    {
      id: string
      kind: string
      title: string
      summary: string
      before: Record<string, unknown>
      after: Record<string, unknown>
      unifiedDiff?: string
      status: string
      resourceType?: string | null
      resourceId?: string | null
    }[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'unified' | 'side'>('unified')

  async function reload() {
    setItems(await fetchProposals({ status: 'open' }))
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  async function act(id: string, action: 'approve' | 'reject') {
    await reviewProposalApi(id, action)
    await reload()
  }

  return (
    <QueAppChrome eyebrow="PROPOSALS · APPROVE / DIFF">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-4xl md:px-lg">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <div>
            <h1 className="font-headline text-xl font-semibold">Proposals</h1>
            <p className="mt-xs text-[13px] text-on-surface-variant">
              Cursor-style review queue — unified diff for joins, transforms,
              and SQL before accepting into workspace truth.
            </p>
          </div>
          <div className="flex gap-sm text-[12px]">
            <button
              type="button"
              onClick={() => setView('unified')}
              className={
                view === 'unified'
                  ? 'rounded bg-secondary px-md py-1 text-on-secondary'
                  : 'rounded-lg border border-outline-variant px-md py-1'
              }
            >
              Unified
            </button>
            <button
              type="button"
              onClick={() => setView('side')}
              className={
                view === 'side'
                  ? 'rounded bg-secondary px-md py-1 text-on-secondary'
                  : 'rounded-lg border border-outline-variant px-md py-1'
              }
            >
              Side-by-side
            </button>
            <Link to="/agent" className="rounded-lg border border-outline-variant px-md py-1">
              Agent
            </Link>
          </div>
        </div>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        <ul className="mt-lg space-y-md">
          {items.length === 0 ? (
            <p className="text-[13px] text-on-surface-variant">
              No open proposals. Promote a join or draft a transform.
            </p>
          ) : null}
          {items.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-md"
            >
              <p className="font-label text-[13px] font-semibold">
                [{p.kind}] {p.title}
              </p>
              <p className="mt-1 text-[12px] text-on-surface-variant">
                {p.summary}
              </p>
              {view === 'unified' ? (
                <pre className="mt-md max-h-80 overflow-auto rounded-lg bg-[#1e1e1e] p-md font-mono text-[10px] leading-relaxed text-[#d4d4d4]">
                  {(p.unifiedDiff || '').split('\n').map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith('+') && !line.startsWith('+++')
                          ? 'text-emerald-400'
                          : line.startsWith('-') && !line.startsWith('---')
                            ? 'text-rose-400'
                            : line.startsWith('@@') ||
                                line.startsWith('---') ||
                                line.startsWith('+++')
                              ? 'text-sky-300'
                              : undefined
                      }
                    >
                      {line || ' '}
                    </div>
                  ))}
                </pre>
              ) : (
                <div className="mt-md grid gap-md md:grid-cols-2">
                  <pre className="overflow-x-auto rounded-lg bg-surface-container-low p-md font-mono text-[10px]">
                    BEFORE{'\n'}
                    {JSON.stringify(p.before, null, 2)}
                  </pre>
                  <pre className="overflow-x-auto rounded-lg bg-secondary/5 p-md font-mono text-[10px]">
                    AFTER{'\n'}
                    {JSON.stringify(p.after, null, 2)}
                  </pre>
                </div>
              )}
              {canWrite ? (
                <div className="mt-sm flex gap-sm">
                  <button
                    type="button"
                    onClick={() => void act(p.id, 'approve')}
                    className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(p.id, 'reject')}
                    className="rounded-lg border border-error/40 px-md py-1.5 text-[12px] text-error"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </QueAppChrome>
  )
}

export default ProposalsPage
