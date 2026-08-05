import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  fetchJoinReviews,
  reviewRelationship,
  runJoinInference,
  runMappingAssistApi,
  reviewRenameSuggestionApi,
  type JoinReviewItem,
  type RenameSuggestion,
} from '@/services/stitchApi'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'

type Filter = 'suggested' | 'accepted' | 'rejected' | 'all'

/**
 * Wave 2.1 — Join Review inbox: queue of suggested joins + evidence.
 * HITL Promote / Reject — never auto-accept.
 */
export function JoinReviewPage() {
  const { canWrite } = useWorkspaceRole()
  const [filter, setFilter] = useState<Filter>('suggested')
  const [items, setItems] = useState<JoinReviewItem[]>([])
  const [summary, setSummary] = useState({
    pending: 0,
    accepted: 0,
    rejected: 0,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inferBusy, setInferBusy] = useState(false)
  const [mapBusy, setMapBusy] = useState(false)
  const [renames, setRenames] = useState<RenameSuggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchJoinReviews({ status: filter, limit: 150 })
      setItems(data.items)
      setSummary(data.summary)
      setSelectedId((prev) => {
        if (prev && data.items.some((i) => i.id === prev)) return prev
        return data.items[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [filter])

  useEffect(() => {
    void reload()
  }, [reload])

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  )

  async function act(action: 'promote' | 'reject') {
    if (!selected || !canWrite) return
    setBusy(true)
    setError(null)
    try {
      await reviewRelationship(selected.id, action)
      setToast(
        action === 'promote'
          ? `Promoted ${selected.from.table}.${selected.from.column} → ${selected.to.table}.${selected.to.column}`
          : `Rejected join suggestion`,
      )
      notifySchemaChanged('join-review')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function reInfer() {
    if (!canWrite) return
    setInferBusy(true)
    setError(null)
    try {
      const result = await runJoinInference()
      setToast(
        `Inference scanned ${result.scanned} columns · created ${result.created} suggestions`,
      )
      notifySchemaChanged('join-infer')
      setFilter('suggested')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInferBusy(false)
    }
  }

  async function suggestMappings() {
    if (!canWrite) return
    setMapBusy(true)
    setError(null)
    try {
      const out = await runMappingAssistApi({ refreshJoins: true })
      setRenames(out.renames || [])
      setToast(
        `Mapping assist · ${out.joins?.length ?? 0} join(s) · ${out.renames?.length ?? 0} rename suggestion(s)`,
      )
      setFilter('suggested')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMapBusy(false)
    }
  }

  async function actRename(
    id: string | null,
    action: 'accept' | 'reject' | 'dismiss',
  ) {
    if (!id || !canWrite) return
    setBusy(true)
    try {
      await reviewRenameSuggestionApi(id, action)
      setRenames((prev) => prev.filter((r) => r.id !== id))
      setToast(`Rename suggestion ${action}ed`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="JOIN REVIEW · HITL">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <div className="shrink-0 border-b border-outline-variant/20 px-md py-md md:px-lg lg:px-margin-desktop">
          <div className="flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Join Review
              </h1>
              <p className="mt-xs max-w-[40rem] font-body text-[13px] leading-snug text-on-surface-variant">
                Suggested joins wait here with evidence. Promote to make them
                explicit — never auto-accept AI edges.
              </p>
            </div>
            <div className="flex flex-wrap gap-sm">
              {canWrite ? (
                <>
                  <button
                    type="button"
                    disabled={inferBusy || mapBusy}
                    onClick={() => void reInfer()}
                    className="rounded-lg border border-primary px-md py-1.5 font-label text-[12px] font-semibold text-primary disabled:opacity-40"
                  >
                    {inferBusy ? 'Inferring…' : 'Re-run inference'}
                  </button>
                  <button
                    type="button"
                    disabled={inferBusy || mapBusy}
                    onClick={() => void suggestMappings()}
                    className="rounded-lg border border-primary/40 bg-primary/5 px-md py-1.5 font-label text-[12px] font-semibold text-primary disabled:opacity-40"
                  >
                    {mapBusy ? 'Suggesting…' : 'Suggest mappings'}
                  </button>
                </>
              ) : null}
              <Link
                to="/workspace"
                className="rounded-lg border border-outline-variant px-md py-1.5 font-label text-[12px] text-on-surface-variant hover:border-primary"
              >
                Open Workspace
              </Link>
            </div>
          </div>

          <div className="mt-md flex flex-wrap gap-sm">
            {(
              [
                ['suggested', `Pending · ${summary.pending}`],
                ['accepted', `Accepted · ${summary.accepted}`],
                ['rejected', `Rejected · ${summary.rejected}`],
                ['all', 'All'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={[
                  'rounded-full px-md py-1 font-label text-[11px] font-semibold',
                  filter === key
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-secondary-container/50',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="border-b border-error/40 bg-error/10 px-md py-sm font-body text-[13px] text-error">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="border-b border-primary/20 bg-primary/5 px-md py-sm font-label text-[12px] text-primary">
            {toast}
            <button
              type="button"
              className="ml-md underline"
              onClick={() => setToast(null)}
            >
              dismiss
            </button>
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
          <aside className="min-h-0 overflow-y-auto border-b border-outline-variant/20 lg:col-span-5 lg:border-r lg:border-b-0">
            {items.length === 0 ? (
              <p className="p-lg font-body text-[13px] text-on-surface-variant">
                {filter === 'suggested'
                  ? 'No pending join suggestions. Sync sources or re-run inference.'
                  : 'Nothing in this filter.'}
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant/10">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={[
                        'w-full px-md py-md text-left transition-colors',
                        selectedId === item.id
                          ? 'bg-primary/5'
                          : 'hover:bg-surface-container-low',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-sm">
                        <p className="min-w-0 font-label text-[13px] font-semibold text-on-surface">
                          <span className="truncate">
                            {item.from.table}.{item.from.column}
                          </span>
                          <span className="mx-1 text-on-surface-variant">→</span>
                          <span className="truncate">
                            {item.to.table}.{item.to.column}
                          </span>
                        </p>
                        <span className="shrink-0 font-label text-[11px] text-primary">
                          {Math.round(item.confidence * 100)}%
                        </span>
                      </div>
                      <p className="mt-1 truncate font-body text-[11px] text-on-surface-variant">
                        {item.crossSource ? 'Cross-source · ' : ''}
                        {item.from.connection} → {item.to.connection}
                      </p>
                      {item.evidence.summary ? (
                        <p className="mt-1 line-clamp-2 font-body text-[11px] text-on-surface-variant">
                          {item.evidence.summary}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main className="min-h-0 overflow-y-auto p-md lg:col-span-7 md:p-lg">
            {!selected ? (
              <p className="font-body text-[13px] text-on-surface-variant">
                Select a join suggestion to review evidence.
              </p>
            ) : (
              <div className="space-y-lg">
                <div>
                  <p className="font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                    {selected.status} · {selected.type}
                    {selected.crossSource ? ' · cross-source' : ''}
                  </p>
                  <h2 className="mt-xs font-headline text-lg font-semibold text-on-surface">
                    {selected.from.table}.{selected.from.column}
                    <span className="mx-sm text-on-surface-variant">→</span>
                    {selected.to.table}.{selected.to.column}
                  </h2>
                  <p className="mt-1 font-body text-[13px] text-on-surface-variant">
                    Confidence {Math.round(selected.confidence * 100)}%
                    {selected.joinCriteria
                      ? ` · ${selected.joinCriteria}`
                      : ''}
                  </p>
                </div>

                <div className="grid gap-md sm:grid-cols-2">
                  <EndpointCard side="From" ep={selected.from} />
                  <EndpointCard side="To" ep={selected.to} />
                </div>

                <section className="rounded-xl border border-outline-variant/30 bg-white p-md">
                  <h3 className="font-headline text-base font-semibold text-on-surface-variant">
                    Evidence
                  </h3>
                  {selected.aiNotes ? (
                    <p className="mt-sm font-body text-[13px] text-on-surface">
                      {selected.aiNotes}
                    </p>
                  ) : null}
                  {selected.evidence.signals.length ? (
                    <ul className="mt-md space-y-sm">
                      {selected.evidence.signals.map((s, i) => (
                        <li
                          key={`${s.code || 'sig'}-${i}`}
                          className="flex items-start justify-between gap-md rounded-lg bg-surface-container-low px-md py-sm"
                        >
                          <div>
                            <p className="font-label text-[11px] tracking-wider text-primary uppercase">
                              {s.code || 'signal'}
                            </p>
                            <p className="mt-0.5 font-body text-[12px] text-on-surface">
                              {s.label || '—'}
                            </p>
                          </div>
                          {typeof s.weight === 'number' ? (
                            <span className="shrink-0 font-label text-[11px] text-on-surface-variant">
                              {s.weight > 0 ? '+' : ''}
                              {s.weight.toFixed(2)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-sm font-body text-[12px] text-on-surface-variant">
                      No structured evidence signals on this edge (legacy
                      suggestion). Review column names and samples carefully.
                    </p>
                  )}
                </section>

                {selected.status === 'suggested' && canWrite ? (
                  <div className="flex flex-wrap gap-sm">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act('promote')}
                      className="rounded-lg bg-primary px-lg py-2 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
                    >
                      {busy ? 'Working…' : 'Promote'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act('reject')}
                      className="rounded-lg border border-error/40 px-lg py-2 font-label text-[12px] font-semibold text-error disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                ) : selected.status === 'suggested' && !canWrite ? (
                  <p className="font-body text-[12px] text-on-surface-variant">
                    Member role required to promote or reject.
                  </p>
                ) : null}
              </div>
            )}
          </main>
        </div>

        {renames.length > 0 ? (
          <section className="shrink-0 border-t border-outline-variant/20 bg-white px-md py-md md:px-lg">
            <h2 className="font-headline text-sm font-semibold text-on-surface">
              Rename suggestions (HITL)
            </h2>
            <p className="mt-xs font-body text-[11px] text-on-surface-variant">
              Wave 4.4 — Accept records intent only; Que never auto-renames
              warehouse columns.
            </p>
            <ul className="mt-sm max-h-40 space-y-sm overflow-y-auto">
              {renames.map((r, i) => (
                <li
                  key={r.id || `${r.from.table}.${r.from.column}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-outline-variant/20 px-md py-sm font-body text-[12px]"
                >
                  <span>
                    {r.from.table}.{r.from.column} ↔ {r.to.table}.{r.to.column}{' '}
                    → alias <strong>{r.suggestedAlias}</strong>{' '}
                    <span className="text-on-surface-variant">
                      ({r.score}) · {r.reason}
                    </span>
                  </span>
                  {canWrite && r.id ? (
                    <span className="flex gap-sm">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void actRename(r.id, 'accept')}
                        className="rounded border border-primary/30 px-sm py-0.5 text-[11px] text-primary"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void actRename(r.id, 'reject')}
                        className="rounded border border-error/30 px-sm py-0.5 text-[11px] text-error"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void actRename(r.id, 'dismiss')}
                        className="rounded border border-outline-variant/40 px-sm py-0.5 text-[11px]"
                      >
                        Dismiss
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </QueAppChrome>
  )
}

function EndpointCard({
  side,
  ep,
}: {
  side: string
  ep: JoinReviewItem['from']
}) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white p-md">
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {side}
      </p>
      <p className="mt-1 font-label text-[13px] font-semibold text-on-surface">
        {ep.table}.{ep.column}
      </p>
      <p className="mt-1 font-body text-[12px] text-on-surface-variant">
        {ep.connection} · {ep.sourceType} · {ep.dataType}
      </p>
      {ep.samples.length ? (
        <p className="mt-sm font-body text-[11px] text-on-surface-variant">
          Samples: {ep.samples.map(String).join(', ')}
        </p>
      ) : null}
    </div>
  )
}

export default JoinReviewPage
