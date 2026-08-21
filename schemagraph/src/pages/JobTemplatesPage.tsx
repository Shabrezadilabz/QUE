import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfGhostButton } from '@/components/pdf/PdfUi'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import {
  TemplateKindIcon,
  templateKindLabel,
  templateTableBadge,
} from '@/components/jobs/TemplateKindIcon'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  applyJobTemplateApi,
  fetchJobTemplates,
  type JobTemplate,
} from '@/services/stitchApi'

/** Job Templates — Marketplace-style gallery with colored kind icons. */
export function JobTemplatesPage() {
  const { canWrite } = useWorkspaceRole()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetchJobTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const kinds = useMemo(() => {
    const set = new Set(templates.map((t) => templateKindLabel(t.kind)))
    return ['All kinds', ...Array.from(set).sort()]
  }, [templates])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((t) => {
      if (kindFilter && templateKindLabel(t.kind) !== kindFilter) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.kind.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [templates, query, kindFilter])

  async function useTemplate(t: JobTemplate) {
    if (!canWrite || busyId) return
    setBusyId(t.id)
    setError(null)
    try {
      const job = await applyJobTemplateApi(t.id)
      setToast(`Created “${job.title || t.name}” from template`)
      navigate(`/jobs/${job.id}/notebook`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Job Templates"
          subtitle="Pre-built stitch patterns — enrich, join facts to dims, sketch SCD2, and ship faster."
          actions={
            <div className="flex flex-wrap items-center justify-end gap-[8px]">
              <Link
                to="/jobs"
                className="pdf-btn-ghost rounded-[4px] px-[14px] py-[8px] text-[12px] font-semibold"
              >
                ← Back to Jobs
              </Link>
            </div>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-[24px]">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-[20px]">
            <div className="flex flex-wrap items-center justify-between gap-[12px]">
              <div className="flex flex-wrap gap-[8px]">
                {kinds.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKindFilter(i === 0 ? '' : k)}
                    className={[
                      'shrink-0 rounded-[12px] border border-solid px-[13px] py-[6px] text-[12px] font-semibold tracking-[0.6px]',
                      (i === 0 && !kindFilter) || kindFilter === k
                        ? 'border-[#424850] bg-[#2e343b] text-[#d4dbe3]'
                        : 'border-[#424850] bg-[#0f1215] text-[#c8cdd3] hover:bg-[#15191e]',
                    ].join(' ')}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="relative w-[256px] max-w-full">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] py-[8px] pl-[33px] pr-[13px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#6b7380]"
                />
                <img
                  alt=""
                  className="pointer-events-none absolute left-[10px] top-1/2 size-[11px] -translate-y-1/2 opacity-70"
                  src={FIGMA_NAV.search}
                />
              </div>
            </div>

            {error ? (
              <p className="rounded-[4px] border border-solid border-[#ff6b6b]/40 bg-[rgba(255,107,107,0.13)] px-[12px] py-[8px] text-[13px] text-[#ff6b6b]">
                {error}
              </p>
            ) : null}
            {toast ? (
              <p className="text-[12px] text-[#7aecd0]">{toast}</p>
            ) : null}

            <div className="grid gap-[16px] sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  canWrite={canWrite}
                  busy={busyId === t.id}
                  onUse={() => void useTemplate(t)}
                />
              ))}
            </div>

            {!filtered.length && !error ? (
              <p className="py-[32px] text-center text-[13px] text-[#a3afbe]">
                No templates match your search.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}

function TemplateCard({
  template: t,
  canWrite,
  busy,
  onUse,
}: {
  template: JobTemplate
  canWrite: boolean
  busy: boolean
  onUse: () => void
}) {
  const kindLabel = templateKindLabel(t.kind)

  return (
    <article className="flex flex-col overflow-hidden rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-colors hover:border-[#6b7380]">
      <div className="flex items-start justify-between border-b border-solid border-[#424850] bg-[#1e2328] px-[16px] pb-[17px] pt-[16px]">
        <TemplateKindIcon kind={t.kind} />
        <div className="flex flex-col items-end gap-[4px]">
          <span className="rounded-[2px] border border-solid border-[#424850] bg-[#2e343b] px-[9px] py-[3px] text-[10px] font-bold tracking-[1px] text-[#c8cdd3] uppercase">
            {kindLabel}
          </span>
          {t.isSystem ? (
            <span className="rounded-[2px] border border-solid border-[rgba(122,236,208,0.35)] bg-[rgba(122,236,208,0.1)] px-[7px] py-[2px] text-[9px] font-bold tracking-[0.8px] text-[#7aecd0] uppercase">
              System
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-[16px]">
        <div>
          <h3 className="text-[16px] font-semibold leading-[24px] text-[#d4dbe3]">
            {t.name}
          </h3>
          <p className="mt-[8px] text-[12px] leading-[18px] text-[#c8cdd3]">
            {t.description || 'Pre-configured notebook cells and table hints for this pattern.'}
          </p>
        </div>
        <div className="mt-[16px] flex items-center justify-between gap-[8px]">
          <div className="flex gap-[4px]">
            {(t.defaultTables || []).slice(0, 4).map((table) => (
              <span
                key={table}
                title={table}
                className="flex size-[24px] items-center justify-center rounded-full border border-solid border-[#424850] bg-[#252a30] text-[9px] font-semibold uppercase tracking-[0.02em] text-[#c8cdd3]"
              >
                {templateTableBadge(table)}
              </span>
            ))}
          </div>
          <PdfGhostButton
            type="button"
            disabled={!canWrite || busy}
            onClick={onUse}
            className="shrink-0 px-[12px] py-[6px] text-[12px] font-semibold disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Use template'}
          </PdfGhostButton>
        </div>
      </div>
    </article>
  )
}

export default JobTemplatesPage
