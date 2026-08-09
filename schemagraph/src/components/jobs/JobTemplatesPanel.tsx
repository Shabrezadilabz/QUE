import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  applyJobTemplateApi,
  fetchJobTemplates,
  type JobTemplate,
} from '@/services/stitchApi'

/**
 * Phase 2 — Template gallery on Jobs monitor.
 */
export function JobTemplatesPanel({ canWrite }: { canWrite: boolean }) {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJobTemplates()
      .then(setTemplates)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
  }, [])

  if (!templates.length && !error) return null

  return (
    <section className="shrink-0 border-b border-outline-variant/20 bg-background px-md py-md md:px-lg">
      <div className="mb-sm flex items-center justify-between gap-sm">
        <div>
          <h2 className="font-headline text-sm font-semibold text-on-surface">
            Templates
          </h2>
          <p className="font-body text-[11px] text-on-surface-variant">
            Start from a stitch pattern — still Promote joins before ship.
          </p>
        </div>
      </div>
      {error ? (
        <p className="font-body text-[12px] text-error">{error}</p>
      ) : (
        <ul className="flex gap-sm overflow-x-auto pb-xs">
          {templates.map((t) => (
            <li
              key={t.id}
              className="min-w-[14rem] max-w-[16rem] shrink-0 rounded-xl border border-outline-variant/30 bg-white p-md shadow-sm"
            >
              <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
                {t.kind}
                {t.isSystem ? ' · system' : ''}
              </p>
              <p className="mt-xs font-headline text-sm font-semibold text-on-surface">
                {t.name}
              </p>
              <p className="mt-1 line-clamp-2 font-body text-[11px] text-on-surface-variant">
                {t.description || '—'}
              </p>
              <button
                type="button"
                disabled={!canWrite || busyId === t.id}
                onClick={() => {
                  void (async () => {
                    setBusyId(t.id)
                    setError(null)
                    try {
                      const job = await applyJobTemplateApi(t.id)
                      navigate(`/jobs/${job.id}/notebook`)
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err),
                      )
                    } finally {
                      setBusyId(null)
                    }
                  })()
                }}
                className="mt-sm w-full rounded-lg border border-primary/40 py-1.5 font-label text-[11px] text-primary disabled:opacity-40"
              >
                {busyId === t.id ? 'Creating…' : 'Use template'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
