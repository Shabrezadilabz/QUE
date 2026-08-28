import { useCallback, useEffect, useState } from 'react'
import { SqlHighlight } from '@/components/code/SqlHighlight'
import { PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import {
  fetchTransforms,
  reviewTransformApi,
} from '@/services/stitchApi'

type TransformDraft = Awaited<ReturnType<typeof fetchTransforms>>[number]

interface TransformDraftsPanelProps {
  canWrite: boolean
  onApplied?: (jobId: string) => void
}

/** HITL transform drafts — approve/reject/apply to job (closes chat→job loop). */
export function TransformDraftsPanel({
  canWrite,
  onApplied,
}: TransformDraftsPanelProps) {
  const [drafts, setDrafts] = useState<TransformDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [proposed, approved] = await Promise.all([
        fetchTransforms({ status: 'proposed' }),
        fetchTransforms({ status: 'approved' }),
      ])
      setDrafts([...proposed, ...approved])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts')
      setDrafts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function review(
    draftId: string,
    action: 'approve' | 'reject' | 'apply',
  ) {
    if (!canWrite || busyId) return
    setBusyId(draftId)
    setError(null)
    try {
      const updated = await reviewTransformApi(draftId, action)
      await reload()
      if (action === 'apply' && updated?.jobId) {
        onApplied?.(updated.jobId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading && drafts.length === 0) {
    return (
      <div className="border-b border-solid border-[#2a3038] px-[16px] py-[10px] text-[11px] text-[#8a9099]">
        Loading transform drafts…
      </div>
    )
  }

  if (!drafts.length) return null

  return (
    <div className="shrink-0 border-b border-solid border-[#2a3038] bg-[#15191e]">
      <div className="flex flex-wrap items-center justify-between gap-[8px] px-[16px] py-[10px]">
        <div>
          <p className="text-[12px] font-semibold text-[#d4dbe3]">
            Transform drafts · HITL review
          </p>
          <p className="text-[11px] text-[#8a9099]">
            {drafts.length} pending — Approve then Apply to create a job from NL→SQL.
          </p>
        </div>
        <PdfGhostButton type="button" onClick={() => void reload()}>
          Refresh
        </PdfGhostButton>
      </div>

      {error ? (
        <p className="px-[16px] pb-[8px] text-[11px] text-[var(--pdf-danger)]">
          {error}
        </p>
      ) : null}

      <ul className="max-h-[220px] overflow-auto px-[12px] pb-[12px]">
        {drafts.map((d) => {
          const open = expandedId === d.id
          const busy = busyId === d.id
          return (
            <li
              key={d.id}
              className="mb-[8px] rounded-[4px] border border-solid border-[#2a3038] bg-[#111416] p-[10px]"
            >
              <div className="flex flex-wrap items-start justify-between gap-[8px]">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setExpandedId(open ? null : d.id)}
                >
                  <p className="truncate text-[12px] font-semibold text-[#d4dbe3]">
                    {d.title}
                  </p>
                  <p className="mt-[2px] line-clamp-2 text-[11px] text-[#8a9099]">
                    {d.prompt}
                  </p>
                </button>
                {canWrite ? (
                  <div className="flex shrink-0 flex-wrap gap-[6px]">
                    <PdfGhostButton
                      type="button"
                      disabled={busy}
                      onClick={() => void review(d.id, 'reject')}
                    >
                      Reject
                    </PdfGhostButton>
                    <PdfGhostButton
                      type="button"
                      disabled={busy}
                      onClick={() => void review(d.id, 'approve')}
                    >
                      Approve
                    </PdfGhostButton>
                    <PdfPrimaryButton
                      type="button"
                      disabled={busy || d.status !== 'approved'}
                      title={
                        d.status !== 'approved'
                          ? 'Approve the draft before Apply'
                          : undefined
                      }
                      onClick={() => void review(d.id, 'apply')}
                    >
                      Apply → Job
                    </PdfPrimaryButton>
                  </div>
                ) : null}
              </div>
              {open && d.sqlText ? (
                <div className="mt-[8px] overflow-hidden rounded-[4px] border border-solid border-[#2a3038] bg-[#0d1117] p-[8px]">
                  <SqlHighlight code={d.sqlText} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
