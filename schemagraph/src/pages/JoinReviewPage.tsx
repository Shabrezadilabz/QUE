import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CatalogAssetCard,
  CatalogCodeBlock,
  CatalogSection,
} from '@/components/catalog/CatalogSplitLayout'
import {
  JoinReviewCatalogShell,
  joinTitle,
  PdfGhostButton,
  PdfPrimaryButton,
} from '@/components/joins/JoinReviewCatalogShell'
import { SqlHighlight } from '@/components/code/SqlHighlight'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  fetchJoinReviews,
  reviewRelationship,
  runJoinInference,
  runMappingAssistApi,
  reviewRenameSuggestionApi,
  runGoldenSetEvalApi,
  fetchWorkspaceSettings,
  fetchTableColumns,
  fetchJoinComments,
  addJoinCommentApi,
  type JoinReviewItem,
  type RenameSuggestion,
} from '@/services/stitchApi'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import { PresenceBar } from '@/components/collab/PresenceBar'
import {
  fetchJoinReviewCollab,
  claimJoinReviewLockApi,
  releaseJoinReviewLockApi,
} from '@/services/stitchApi'

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
}

type Filter = 'suggested' | 'accepted' | 'rejected' | 'all'

/**
 * Wave 2.1 — Join Review inbox: queue of suggested joins + evidence.
 * HITL Promote / Reject — never auto-accept.
 */
export function JoinReviewPage() {
  const { canWrite, role } = useWorkspaceRole()
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
  const [promoteMinRole, setPromoteMinRole] = useState('member')
  const [proposeMinRole, setProposeMinRole] = useState('member')
  const canPromote =
    canWrite &&
    (ROLE_RANK[role || ''] || 0) >= (ROLE_RANK[promoteMinRole] || 2)
  const canPropose =
    canWrite &&
    (ROLE_RANK[role || ''] || 0) >= (ROLE_RANK[proposeMinRole] || 2)
  const [goldenText, setGoldenText] = useState(
    'orders,order_id,customers,id\nfact_orders,customer_id,dim_customer,customer_id',
  )
  const [goldenBusy, setGoldenBusy] = useState(false)
  const [editFromCol, setEditFromCol] = useState('')
  const [editToCol, setEditToCol] = useState('')
  const [fromColOpts, setFromColOpts] = useState<
    { id: string; name: string; dataType: string }[]
  >([])
  const [toColOpts, setToColOpts] = useState<
    { id: string; name: string; dataType: string }[]
  >([])
  const [comments, setComments] = useState<
    {
      id: string
      body: string
      authorName?: string
      authorEmail?: string
      createdAt: string
      parentId?: string | null
      replies?: {
        id: string
        body: string
        authorName?: string
        authorEmail?: string
        createdAt: string
      }[]
    }[]
  >([])
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const { page: autofillPage } = usePageAutofill('joins')
  const [detailTab, setDetailTab] = useState('evidence')
  const [collabLock, setCollabLock] = useState<{
    userId: string
    displayName: string
  } | null>(null)
  const [canCoEdit, setCanCoEdit] = useState(true)

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

  useEffect(() => {
    fetchWorkspaceSettings()
      .then((s) => {
        setPromoteMinRole(s.settings.joinPromoteMinRole || 'member')
        setProposeMinRole(s.settings.joinProposeMinRole || 'member')
      })
      .catch(() => undefined)
  }, [])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        joinTitle(i).toLowerCase().includes(q) ||
        i.from.connection.toLowerCase().includes(q) ||
        i.to.connection.toLowerCase().includes(q),
    )
  }, [items, query])

  const selected = useMemo(
    () => filteredItems.find((i) => i.id === selectedId) ?? items.find((i) => i.id === selectedId) ?? null,
    [filteredItems, items, selectedId],
  )

  useEffect(() => {
    if (!selected) {
      setFromColOpts([])
      setToColOpts([])
      setComments([])
      return
    }
    setEditFromCol(selected.from.columnId)
    setEditToCol(selected.to.columnId)
    void Promise.all([
      fetchTableColumns(selected.from.tableId),
      fetchTableColumns(selected.to.tableId),
      fetchJoinComments(selected.id),
    ])
      .then(([fromCols, toCols, cmts]) => {
        setFromColOpts(fromCols)
        setToColOpts(toCols)
        setComments(cmts)
      })
      .catch(() => {
        setFromColOpts([])
        setToColOpts([])
        setComments([])
      })
  }, [selected?.id, selected?.from.tableId, selected?.to.tableId])

  useEffect(() => {
    if (!selected?.id) {
      setCollabLock(null)
      setCanCoEdit(true)
      return
    }
    let cancelled = false
    async function pollCollab() {
      try {
        const collab = await fetchJoinReviewCollab(selected!.id)
        if (cancelled) return
        setCollabLock(collab.lock)
        setCanCoEdit(collab.canEdit)
      } catch {
        /* optional */
      }
    }
    void pollCollab()
    const id = window.setInterval(() => void pollCollab(), 20_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
      void releaseJoinReviewLockApi(selected!.id).catch(() => undefined)
    }
  }, [selected?.id])

  async function saveEdit() {
    if (!selected || !canWrite || !editFromCol || !editToCol) return
    if (!canCoEdit) {
      setError(
        collabLock
          ? `${collabLock.displayName} is editing this join — try again shortly`
          : 'Another steward holds the edit lock',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      await claimJoinReviewLockApi(selected.id)
      await reviewRelationship(selected.id, 'edit', {
        fromColumnId: editFromCol,
        toColumnId: editToCol,
      })
      await releaseJoinReviewLockApi(selected.id).catch(() => undefined)
      setToast('Join columns updated — review pinned overlap, then Promote')
      notifySchemaChanged('join-review')
      await reload()
    } catch (err) {
      const e = err as Error & { code?: string }
      if (e.code === 'JOIN_LOCK_HELD') {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function act(action: 'promote' | 'reject') {
    if (!selected || !canWrite) return
    if (action === 'promote' && !canPromote) {
      setError(`Promote requires ${promoteMinRole}+ (Settings → Team OS)`)
      return
    }
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
    if (!canPropose) {
      setError(`Propose/infer requires ${proposeMinRole}+ (Settings → Team OS)`)
      return
    }
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

  async function runGolden() {
    if (!canWrite) return
    setGoldenBusy(true)
    setError(null)
    try {
      const pairs = goldenText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [fromTable, fromColumn, toTable, toColumn] = line
            .split(',')
            .map((s) => s.trim())
          return { fromTable, fromColumn, toTable, toColumn }
        })
        .filter((p) => p.fromTable && p.fromColumn && p.toTable && p.toColumn)
      const { report, markdown } = await runGoldenSetEvalApi(pairs)
      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'que-golden-set-report.md'
      a.click()
      URL.revokeObjectURL(url)
      const recall = Number((report as { recall?: number }).recall || 0)
      setToast(
        `Golden-set recall ${(recall * 100).toFixed(1)}% · report downloaded`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGoldenBusy(false)
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

  const joinSql = selected
    ? (selected.evidence as { sqlSnippet?: string }).sqlSnippet ||
      `SELECT *\nFROM ${selected.from.table} a\nJOIN ${selected.to.table} b\n  ON a.${selected.from.column} = b.${selected.to.column}\nLIMIT 20;`
    : ''

  return (
    <JoinReviewCatalogShell
      filter={filter}
      summary={summary}
      onFilter={setFilter}
      query={query}
      onQuery={setQuery}
      items={filteredItems}
      selectedId={selectedId}
      onSelect={setSelectedId}
      selected={selected}
      detailTab={detailTab}
      onDetailTab={setDetailTab}
      headerActions={
        canWrite ? (
          <>
            <PdfGhostButton type="button" disabled={inferBusy || mapBusy} onClick={() => void reInfer()}>
              {inferBusy ? 'Inferring…' : 'Re-run inference'}
            </PdfGhostButton>
            <PdfPrimaryButton type="button" disabled={inferBusy || mapBusy} onClick={() => void suggestMappings()}>
              {mapBusy ? 'Suggesting…' : 'Suggest mappings'}
            </PdfPrimaryButton>
          </>
        ) : null
      }
      detailActions={
        selected?.status === 'suggested' && canWrite ? (
          <>
            <PdfPrimaryButton type="button" disabled={busy || !canPromote} onClick={() => void act('promote')}>
              Promote
            </PdfPrimaryButton>
            <PdfGhostButton type="button" disabled={busy} onClick={() => void act('reject')}>
              Reject
            </PdfGhostButton>
          </>
        ) : null
      }
      banner={
        <>
          <div className="shrink-0 border-b border-solid border-[#2a313c] px-[24px] py-[8px]">
            <PresenceBar pagePath="/joins" />
          </div>
          <PageAutofillBanner page={autofillPage} compact />
          {error ? (
            <p className="shrink-0 border-b border-solid border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)] px-[24px] py-[8px] text-[12px] text-[#ff6b6b]">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="shrink-0 border-b border-solid border-[#424850] px-[24px] py-[8px] text-[12px] text-[#7aecd0]">
              {toast}{' '}
              <button type="button" className="underline" onClick={() => setToast(null)}>
                dismiss
              </button>
            </p>
          ) : null}
        </>
      }
      footer={
        <span>
          {summary.pending} pending · {renames.length} rename suggestions
        </span>
      }
      detailBody={
        !selected ? null : detailTab === 'evidence' ? (
          <>
            <CatalogSection title="Calculation Logic">
              <CatalogCodeBlock>
                <SqlHighlight code={joinSql} />
              </CatalogCodeBlock>
            </CatalogSection>
            <CatalogSection title={`Signals (${selected.evidence.signals.length})`}>
              {selected.evidence.signals.length ? (
                <ul className="space-y-[8px]">
                  {selected.evidence.signals.map((s, i) => (
                    <li
                      key={`${s.code || 'sig'}-${i}`}
                      className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[12px] py-[10px]"
                    >
                      <p className="text-[10px] font-bold tracking-[0.6px] text-[#7aecd0] uppercase">
                        {s.code || 'signal'}
                      </p>
                      <p className="mt-[4px] text-[12px] text-[#c8cdd3]">{s.label || '—'}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-[#a3afbe]">
                  No structured signals — review names and samples carefully.
                </p>
              )}
            </CatalogSection>
            <div className="grid gap-[12px] sm:grid-cols-2">
              <CatalogAssetCard
                icon="⎔"
                title={selected.from.table}
                platform={selected.from.connection}
                field={selected.from.column}
                fieldType={selected.from.dataType}
              />
              <CatalogAssetCard
                icon="⎔"
                title={selected.to.table}
                platform={selected.to.connection}
                field={selected.to.column}
                fieldType={selected.to.dataType}
              />
            </div>
            {renames.length > 0 ? (
              <CatalogSection title="Rename suggestions">
                <ul className="space-y-[8px]">
                  {renames.map((r, i) => (
                    <li
                      key={r.id || `${r.from.table}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-[8px] rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[12px] py-[10px] text-[12px] text-[#c8cdd3]"
                    >
                      <span>
                        {r.from.table}.{r.from.column} ↔ {r.to.table}.{r.to.column} → {r.suggestedAlias}
                      </span>
                      {canWrite && r.id ? (
                        <span className="flex gap-[6px]">
                          <PdfGhostButton type="button" disabled={busy} onClick={() => void actRename(r.id, 'accept')}>
                            Accept
                          </PdfGhostButton>
                          <PdfGhostButton type="button" disabled={busy} onClick={() => void actRename(r.id, 'reject')}>
                            Reject
                          </PdfGhostButton>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CatalogSection>
            ) : null}
            {canWrite ? (
              <CatalogSection title="Golden-set eval">
                <textarea
                  value={goldenText}
                  onChange={(e) => setGoldenText(e.target.value)}
                  rows={3}
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[8px] font-mono text-[11px] text-[#d4dbe3]"
                />
                <PdfGhostButton type="button" disabled={goldenBusy} onClick={() => void runGolden()} className="mt-[8px]">
                  {goldenBusy ? 'Evaluating…' : 'Run golden-set eval'}
                </PdfGhostButton>
              </CatalogSection>
            ) : null}
          </>
        ) : detailTab === 'columns' ? (
          <>
            {collabLock && !canCoEdit ? (
              <p className="mb-[8px] rounded-[4px] border border-solid border-[#ffb06b]/40 bg-[rgba(255,176,107,0.1)] px-[12px] py-[8px] text-[12px] text-[#ffb06b]">
                {collabLock.displayName} is co-editing this join review.
              </p>
            ) : null}
            {selected.status === 'suggested' && canWrite ? (
              <CatalogSection title="Edit join columns">
                <div className="grid gap-[12px] sm:grid-cols-2">
                  <label className="block text-[11px] text-[#a3afbe]">
                    From column
                    <select
                      value={editFromCol}
                      onChange={(e) => setEditFromCol(e.target.value)}
                      className="mt-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[8px] text-[12px] text-[#d4dbe3]"
                    >
                      {fromColOpts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.dataType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-[#a3afbe]">
                    To column
                    <select
                      value={editToCol}
                      onChange={(e) => setEditToCol(e.target.value)}
                      className="mt-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[8px] text-[12px] text-[#d4dbe3]"
                    >
                      {toColOpts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.dataType}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <PdfGhostButton
                  type="button"
                  disabled={
                    busy ||
                    !editFromCol ||
                    !editToCol ||
                    (editFromCol === selected.from.columnId && editToCol === selected.to.columnId)
                  }
                  onClick={() => void saveEdit()}
                  className="mt-[12px]"
                >
                  Save column edit
                </PdfGhostButton>
              </CatalogSection>
            ) : null}
            <div className="grid gap-[12px] sm:grid-cols-2">
              <EndpointCard side="From" ep={selected.from} />
              <EndpointCard side="To" ep={selected.to} />
            </div>
          </>
        ) : (
          <CatalogSection title="Team discussion">
            <ul className="max-h-[240px] space-y-[8px] overflow-y-auto">
              {comments.length === 0 ? (
                <li className="text-[12px] text-[#a3afbe]">No comments yet.</li>
              ) : (
                comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[12px] py-[10px] text-[12px] text-[#c8cdd3]"
                  >
                    <span className="font-semibold text-[#d4dbe3]">
                      {c.authorName || c.authorEmail || 'member'}
                    </span>
                    <span className="text-[#8a9099]"> · {new Date(c.createdAt).toLocaleString()}</span>
                    <p className="mt-[4px]">{c.body}</p>
                  </li>
                ))
              )}
            </ul>
            {canWrite ? (
              <div className="mt-[12px] flex gap-[8px]">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment…"
                  className="min-w-0 flex-1 rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[8px] text-[13px] text-[#d4dbe3]"
                />
                <PdfGhostButton
                  type="button"
                  disabled={!commentText.trim() || busy}
                  onClick={() => {
                    if (!selected) return
                    void addJoinCommentApi(selected.id, commentText.trim(), { parentId: replyTo })
                      .then(() => fetchJoinComments(selected.id))
                      .then((cmts) => {
                        setComments(cmts)
                        setCommentText('')
                        setReplyTo(null)
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                  }}
                >
                  Post
                </PdfGhostButton>
              </div>
            ) : null}
          </CatalogSection>
        )
      }
    />
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
    <div className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[14px]">
      <p className="text-[10px] font-bold tracking-[0.6px] text-[#8a9099] uppercase">{side}</p>
      <p className="mt-[6px] text-[13px] font-semibold text-[#d4dbe3]">
        {ep.table}.{ep.column}
      </p>
      <p className="mt-[4px] text-[12px] text-[#a3afbe]">
        {ep.connection} · {ep.sourceType} · {ep.dataType}
      </p>
      {ep.samples.length ? (
        <p className="mt-[8px] text-[11px] text-[#8a9099]">
          Samples: {ep.samples.map(String).join(', ')}
        </p>
      ) : null}
    </div>
  )
}

export default JoinReviewPage
