import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import {
  PdfGhostButton,
  PdfPageHeader,
  PdfPrimaryButton,
} from '@/components/pdf/PdfUi'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import { RunInWarehouseButton } from '@/components/warehouse/RunInWarehouseButton'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  applyPipeProposalApi,
  createPipeProposalApi,
  fetchPipeProposals,
  reviewPipeProposalApi,
  type PipeProposal,
} from '@/services/stitchApi'

const STATUS_COLOR: Record<string, string> = {
  pending: '#f0c040',
  approved: '#7aecd0',
  rejected: '#888',
  applied: '#c3f400',
}

/** Que Pipes — NL → ELT pipeline with HITL approve before job create. */
export function PipesPage() {
  const { canWrite } = useWorkspaceRole()
  const { page: autofillPage } = usePageAutofill('pipes')
  const navigate = useNavigate()
  const [proposals, setProposals] = useState<PipeProposal[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(
    'Build a daily pipeline: extract orders, clean nulls, load revenue mart',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId],
  )

  const reload = useCallback(async () => {
    const items = await fetchPipeProposals()
    setProposals(items)
    setSelectedId((prev) => {
      if (prev && items.some((p) => p.id === prev)) return prev
      return items[0]?.id ?? null
    })
  }, [])

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [reload])

  const onDraft = async () => {
    if (!canWrite || !prompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      const item = await createPipeProposalApi({ prompt: prompt.trim() })
      setToast('Pipeline drafted — review steps below')
      setSelectedId(item.id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onReview = async (action: 'approve' | 'reject') => {
    if (!selectedId) return
    setBusy(true)
    try {
      await reviewPipeProposalApi(selectedId, action)
      setToast(action === 'approve' ? 'Approved' : 'Rejected')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onApply = async () => {
    if (!selectedId) return
    setBusy(true)
    try {
      const result = await applyPipeProposalApi(selectedId)
      setToast('Job created from pipe')
      await reload()
      if (result.jobId) navigate(`/jobs/${result.jobId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title={
            <span className="inline-flex items-center gap-[10px]">
              Que Pipes
              <span className="rounded border border-[#c3f400]/30 bg-[#c3f400]/10 px-[8px] py-[2px] font-mono text-[10px] uppercase tracking-wider text-[#c3f400]">
                NL → HITL
              </span>
            </span>
          }
          subtitle="Describe an ELT pipeline in plain English — approve before it becomes a job."
          actions={
            <div className="flex flex-wrap gap-[8px]">
              <Link to="/load">
                <PdfGhostButton type="button">Load</PdfGhostButton>
              </Link>
              <Link to="/jobs">
                <PdfGhostButton type="button">Jobs</PdfGhostButton>
              </Link>
            </div>
          }
        />

        {autofillPage ? (
          <div className="shrink-0 px-[16px] pt-[8px]">
            <PageAutofillBanner page={autofillPage} compact />
          </div>
        ) : null}

        {error && (
          <div className="border-b border-red-900/50 bg-red-950/30 px-[16px] py-[8px] text-[13px] text-red-300">
            {error}
          </div>
        )}
        {toast && (
          <div className="border-b border-[#333] px-[16px] py-[6px] text-[12px] text-[#c3f400]">
            {toast}
          </div>
        )}

        <div className="border-b border-[#2a2f33] px-[16px] py-[12px]">
          <textarea
            className="h-[72px] w-full resize-y rounded border border-[#333] bg-[#1a1d1f] p-[10px] font-body text-[13px] text-[#e8e8e8] outline-none focus:border-[#c3f400]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={!canWrite || busy}
            placeholder="e.g. Sync Shopify orders daily, dedupe by order_id, build revenue mart…"
          />
          <div className="mt-[8px] flex gap-[8px]">
            <PdfPrimaryButton
              type="button"
              disabled={!canWrite || busy || !prompt.trim()}
              onClick={() => void onDraft()}
            >
              {busy ? 'Drafting…' : 'Draft pipeline'}
            </PdfPrimaryButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[240px] shrink-0 overflow-y-auto border-r border-[#2a2f33] p-[12px]">
            <div className="mb-[8px] font-mono text-[10px] uppercase tracking-wider text-[#888]">
              Proposals
            </div>
            <ul className="flex flex-col gap-[4px]">
              {proposals.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`w-full rounded px-[8px] py-[6px] text-left text-[12px] ${
                      selectedId === p.id
                        ? 'bg-[#c3f400]/15 text-[#c3f400]'
                        : 'text-[#ccc] hover:bg-[#1a1d1f]'
                    }`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: STATUS_COLOR[p.status] || '#888' }}
                    >
                      {p.status}
                    </span>
                    <div className="truncate">{p.title}</div>
                  </button>
                </li>
              ))}
              {!proposals.length && (
                <li className="text-[12px] text-[#666]">No proposals yet</li>
              )}
            </ul>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto p-[16px]">
            {!selected && (
              <p className="text-[13px] text-[#666]">
                Draft a pipeline to see extract → transform → load steps here.
              </p>
            )}
            {selected && (
              <div className="flex flex-col gap-[16px]">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#e8e8e8]">
                    {selected.title}
                  </h2>
                  <p className="mt-[4px] text-[12px] text-[#888]">{selected.prompt}</p>
                  {selected.evidence?.mode && (
                    <p className="mt-[4px] font-mono text-[10px] text-[#666]">
                      mode: {selected.evidence.mode}
                      {selected.evidence.intent
                        ? ` · intent: ${selected.evidence.intent}`
                        : ''}
                    </p>
                  )}
                </div>

                <ol className="flex flex-col gap-[10px]">
                  {(selected.spec?.steps || []).map((s) => (
                    <li
                      key={s.id}
                      className="rounded border border-[#333] bg-[#1a1d1f] p-[12px]"
                    >
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[#7aecd0]">
                        {s.phase} · {s.label}
                      </div>
                      <p className="mt-[4px] text-[13px] text-[#ccc]">{s.detail}</p>
                      {s.target && (
                        <p className="mt-[4px] font-mono text-[11px] text-[#888]">
                          → {s.target}
                        </p>
                      )}
                      {s.sql && (
                        <>
                          <pre className="mt-[8px] overflow-x-auto rounded bg-[#0d0f10] p-[8px] font-mono text-[11px] text-[#aaa]">
                            {s.sql}
                          </pre>
                          <RunInWarehouseButton
                            sql={s.sql}
                            compact
                            className="mt-[8px]"
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap gap-[8px]">
                  {selected.status === 'pending' && canWrite && (
                    <>
                      <PdfPrimaryButton
                        type="button"
                        disabled={busy}
                        onClick={() => void onReview('approve')}
                      >
                        Approve
                      </PdfPrimaryButton>
                      <PdfGhostButton
                        type="button"
                        disabled={busy}
                        onClick={() => void onReview('reject')}
                      >
                        Reject
                      </PdfGhostButton>
                    </>
                  )}
                  {(selected.status === 'approved' ||
                    selected.status === 'pending') &&
                    canWrite && (
                      <PdfPrimaryButton
                        type="button"
                        disabled={busy}
                        onClick={() => void onApply()}
                      >
                        Apply → Create job
                      </PdfPrimaryButton>
                    )}
                  {selected.jobId && (
                    <Link to={`/jobs/${selected.jobId}`}>
                      <PdfGhostButton type="button">Open job</PdfGhostButton>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </QueAppChrome>
  )
}
