import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createTransformApi,
  fetchProposals,
  fetchTransforms,
  reviewProposalApi,
  reviewTransformApi,
} from '@/services/stitchApi'

type ProposalItem = {
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
}

type TransformEvidence = {
  mode?: string
  model?: string | null
  proposerKind?: string
  nature?: string
  query?: string
  whyReferred?: string
  referredTables?: {
    name: string
    connection?: string | null
    reason?: string
  }[]
  tableCount?: number
  rulesApplied?: number
  ruleTitles?: string[]
}

type TransformItem = {
  id: string
  title: string
  prompt: string
  sqlText: string
  status: string
  jobId?: string | null
  createdBy?: string | null
  createdByName?: string | null
  createdByEmail?: string | null
  createdAt?: string
  evidence?: TransformEvidence
}

/**
 * Unified HITL review — NL→SQL transforms + PR-style proposal diffs.
 * Click a transform to open the right-side attribution / rationale panel.
 */
export function ProposalsPage() {
  const { canWrite } = useWorkspaceRole()
  const [proposals, setProposals] = useState<ProposalItem[]>([])
  const [transforms, setTransforms] = useState<TransformItem[]>([])
  const [prompt, setPrompt] = useState(
    'Clean customer emails and join to orders for a trusted 360 extract',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'unified' | 'side'>('unified')
  const [filter, setFilter] = useState<'all' | 'transforms' | 'diffs'>('all')
  const [selectedTransformId, setSelectedTransformId] = useState<string | null>(
    null,
  )

  async function reload() {
    const [p, t] = await Promise.all([
      fetchProposals({ status: 'open' }),
      fetchTransforms(),
    ])
    setProposals(p)
    setTransforms(t)
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  async function draft() {
    if (!canWrite || !prompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      const item = await createTransformApi({ prompt })
      await reload()
      setFilter('transforms')
      if (item?.id) setSelectedTransformId(item.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function actProposal(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      await reviewProposalApi(id, action)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function actTransform(
    id: string,
    action: 'approve' | 'reject' | 'apply',
  ) {
    setBusy(true)
    setError(null)
    try {
      await reviewTransformApi(id, action)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openTransforms = transforms.filter(
    (d) => d.status === 'proposed' || d.status === 'approved',
  )
  const selectedTransform = useMemo(
    () => openTransforms.find((d) => d.id === selectedTransformId) ?? null,
    [openTransforms, selectedTransformId],
  )
  const showTransforms = filter === 'all' || filter === 'transforms'
  const showDiffs = filter === 'all' || filter === 'diffs'
  const empty =
    (showTransforms ? openTransforms.length === 0 : true) &&
    (showDiffs ? proposals.length === 0 : true)

  return (
    <QueAppChrome eyebrow="REVIEW · APPROVE / REJECT">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-md py-lg md:px-lg">
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-wrap items-end justify-between gap-md">
              <div>
                <h1 className="font-headline text-xl font-semibold">Review</h1>
                <p className="mt-xs text-[13px] text-on-surface-variant">
                  One queue for transform SQL drafts and proposal diffs — click a
                  transform to see who proposed it and why.
                </p>
              </div>
              <div className="flex flex-wrap gap-sm text-[12px]">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={
                    filter === 'all'
                      ? 'rounded bg-secondary px-md py-1 text-on-secondary'
                      : 'rounded-lg border border-outline-variant px-md py-1'
                  }
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('transforms')}
                  className={
                    filter === 'transforms'
                      ? 'rounded bg-secondary px-md py-1 text-on-secondary'
                      : 'rounded-lg border border-outline-variant px-md py-1'
                  }
                >
                  Transforms
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('diffs')}
                  className={
                    filter === 'diffs'
                      ? 'rounded bg-secondary px-md py-1 text-on-secondary'
                      : 'rounded-lg border border-outline-variant px-md py-1'
                  }
                >
                  Diffs
                </button>
                {showDiffs ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setView('unified')}
                      className={
                        view === 'unified'
                          ? 'rounded bg-secondary/80 px-md py-1 text-on-secondary'
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
                          ? 'rounded bg-secondary/80 px-md py-1 text-on-secondary'
                          : 'rounded-lg border border-outline-variant px-md py-1'
                      }
                    >
                      Side-by-side
                    </button>
                  </>
                ) : null}
                <Link
                  to="/agent"
                  className="rounded-lg border border-outline-variant px-md py-1"
                >
                  Agent
                </Link>
              </div>
            </div>

            {error ? (
              <p className="mt-md text-[13px] text-error">{error}</p>
            ) : null}

            {canWrite ? (
              <div className="mt-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
                <p className="mb-sm font-label text-[11px] font-bold tracking-widest text-secondary uppercase">
                  Draft transform · NL → SQL
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-outline-variant/40 bg-surface px-md py-2 text-[13px]"
                />
                <button
                  type="button"
                  disabled={busy || !prompt.trim()}
                  onClick={() => void draft()}
                  className="mt-sm rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                >
                  {busy ? 'Drafting…' : 'Draft SQL'}
                </button>
              </div>
            ) : null}

            <ul className="mt-lg space-y-md pb-lg">
              {empty ? (
                <p className="text-[13px] text-on-surface-variant">
                  Nothing open. Draft a transform above, or promote a join to
                  create a proposal diff.
                </p>
              ) : null}

              {showTransforms
                ? openTransforms.map((d) => (
                    <li key={`t-${d.id}`}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTransformId((prev) =>
                            prev === d.id ? null : d.id,
                          )
                        }
                        className={[
                          'w-full rounded-xl border p-md text-left transition-colors',
                          selectedTransformId === d.id
                            ? 'border-secondary/50 bg-secondary/10'
                            : 'border-outline-variant/30 bg-surface-container-low hover:border-secondary/30',
                        ].join(' ')}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-sm">
                          <p className="font-label text-[13px] font-semibold">
                            <span className="mr-sm rounded bg-secondary/15 px-sm py-px font-label text-[10px] tracking-wide text-secondary uppercase">
                              transform
                            </span>
                            {d.title}
                          </p>
                          <span className="text-[11px] uppercase text-on-surface-variant">
                            {d.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-on-surface-variant">
                          {d.prompt}
                        </p>
                        <pre className="mt-md max-h-40 overflow-auto rounded-lg bg-surface-container-lowest p-md font-mono text-[11px] text-on-surface">
                          {d.sqlText}
                        </pre>
                      </button>
                      {canWrite && d.status === 'proposed' ? (
                        <div className="mt-sm flex gap-sm px-xs">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void actTransform(d.id, 'approve')}
                            className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void actTransform(d.id, 'reject')}
                            className="rounded-lg border border-error/40 px-md py-1.5 text-[12px] text-error disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                      {canWrite && d.status === 'approved' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void actTransform(d.id, 'apply')}
                          className="mt-sm rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                        >
                          Apply to job
                        </button>
                      ) : null}
                      {d.jobId ? (
                        <Link
                          to={`/jobs/${d.jobId}/notebook`}
                          className="mt-sm inline-block text-[12px] text-secondary underline"
                        >
                          Open job
                        </Link>
                      ) : null}
                    </li>
                  ))
                : null}

              {showDiffs
                ? proposals.map((p) => (
                    <li
                      key={`p-${p.id}`}
                      className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-md"
                    >
                      <p className="font-label text-[13px] font-semibold">
                        <span className="mr-sm rounded bg-tertiary/20 px-sm py-px font-label text-[10px] tracking-wide text-tertiary uppercase">
                          {p.kind || 'diff'}
                        </span>
                        {p.title}
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
                                  : line.startsWith('-') &&
                                      !line.startsWith('---')
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
                            disabled={busy}
                            onClick={() => void actProposal(p.id, 'approve')}
                            className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void actProposal(p.id, 'reject')}
                            className="rounded-lg border border-error/40 px-md py-1.5 text-[12px] text-error disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))
                : null}
            </ul>
          </div>
        </div>

        {selectedTransform ? (
          <aside className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-outline-variant bg-surface-container-low md:block lg:w-[26rem]">
            <TransformDetailPanel
              draft={selectedTransform}
              onClose={() => setSelectedTransformId(null)}
            />
          </aside>
        ) : null}
      </div>

      {/* Mobile: bottom sheet style when selected */}
      {selectedTransform ? (
        <div className="border-t border-outline-variant bg-surface-container-low p-md md:hidden">
          <TransformDetailPanel
            draft={selectedTransform}
            onClose={() => setSelectedTransformId(null)}
            compact
          />
        </div>
      ) : null}
    </QueAppChrome>
  )
}

function TransformDetailPanel({
  draft,
  onClose,
  compact = false,
}: {
  draft: TransformItem
  onClose: () => void
  compact?: boolean
}) {
  const ev = draft.evidence || {}
  const mode = ev.mode || 'unknown'
  const isAgent = mode === 'llm'
  const who =
    draft.createdByName ||
    draft.createdByEmail ||
    (draft.createdBy ? `User ${draft.createdBy.slice(0, 8)}` : 'Unknown user')
  const queryText = ev.query || draft.prompt
  const nature =
    ev.nature ||
    (isAgent
      ? 'Agent drafted SQL from the prompt against the schema pack.'
      : 'Heuristic draft — review SQL before Approve / Apply.')
  const referred = ev.referredTables || []

  return (
    <div className={compact ? 'space-y-md' : 'space-y-lg p-md lg:p-lg'}>
      <div className="flex items-start justify-between gap-sm">
        <div>
          <p className="font-label text-[10px] font-bold tracking-widest text-secondary uppercase">
            Proposal detail
          </p>
          <h2 className="mt-xs font-headline text-base font-semibold text-on-surface">
            {draft.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-outline-variant px-sm py-1 font-label text-[10px] text-on-surface-variant"
        >
          Close
        </button>
      </div>

      <section>
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          Proposed by
        </p>
        <p className="mt-xs text-[13px] text-on-surface">{who}</p>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          {isAgent ? (
            <>
              Drafted by <span className="text-secondary">Agent (LLM)</span>
              {ev.model ? ` · ${ev.model}` : ''}
            </>
          ) : (
            <>
              Drafted by <span className="text-secondary">Heuristic</span> (no
              LLM / fallback)
            </>
          )}
        </p>
        {draft.createdAt ? (
          <p className="mt-1 font-label text-[10px] text-on-surface-variant/70">
            {new Date(draft.createdAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      <section>
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          Nature · why proposed
        </p>
        <p className="mt-xs text-[13px] leading-relaxed text-on-surface">
          {nature}
        </p>
      </section>

      <section>
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          Due to query
        </p>
        <p className="mt-xs rounded-lg border border-outline-variant/40 bg-surface p-sm text-[12px] leading-relaxed text-on-surface">
          {queryText}
        </p>
      </section>

      <section>
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          Why these tables were referred
        </p>
        {ev.whyReferred ? (
          <p className="mt-xs text-[12px] leading-relaxed text-on-surface-variant">
            {ev.whyReferred}
          </p>
        ) : null}
        {referred.length > 0 ? (
          <ul className="mt-sm space-y-sm">
            {referred.map((t) => (
              <li
                key={t.name}
                className="rounded-lg border border-outline-variant/25 bg-surface px-sm py-sm"
              >
                <p className="font-label text-[12px] font-semibold text-secondary">
                  {t.name}
                  {t.connection ? (
                    <span className="ml-sm font-normal text-on-surface-variant">
                      · {t.connection}
                    </span>
                  ) : null}
                </p>
                {t.reason ? (
                  <p className="mt-xs text-[11px] text-on-surface-variant">
                    {t.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-xs text-[12px] text-on-surface-variant">
            No table referral metadata on this draft (older item). Re-draft to
            capture rationale.
          </p>
        )}
      </section>

      {(ev.rulesApplied != null && ev.rulesApplied > 0) ||
      (ev.ruleTitles && ev.ruleTitles.length > 0) ? (
        <section>
          <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
            Rules considered
          </p>
          <p className="mt-xs text-[12px] text-on-surface-variant">
            {ev.rulesApplied ?? ev.ruleTitles?.length ?? 0} rule(s)
            {ev.ruleTitles?.length
              ? `: ${ev.ruleTitles.slice(0, 5).join(', ')}`
              : ''}
          </p>
        </section>
      ) : null}

      <section>
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          Status
        </p>
        <p className="mt-xs text-[12px] uppercase text-on-surface">{draft.status}</p>
      </section>
    </div>
  )
}

export default ProposalsPage
