import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchValidationSuite,
  generateValidationSuiteApi,
  runValidationSuiteApi,
  type ValidationCheck,
} from '@/services/stitchApi'

type Props = {
  jobId: string
  canWrite: boolean
}

/**
 * Inline validation suite under Jobs → Results (with table preview).
 * Uniqueness / referential / row-count — capped live validate. No separate page needed.
 */
export function JobValidationLayer({ jobId, canWrite }: Props) {
  const [checks, setChecks] = useState<ValidationCheck[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const reload = useCallback(async () => {
    try {
      setChecks(await fetchValidationSuite(jobId))
    } catch {
      setChecks([])
    }
  }, [jobId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function generate() {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      const out = await generateValidationSuiteApi(jobId)
      setChecks(out.checks)
      setExpanded(true)
      setToast(
        `Generated ${out.checks.length} check(s)` +
          (out.cellCount ? ` · appended notebook cells` : ''),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      const out = await runValidationSuiteApi(jobId)
      setChecks(out.checks)
      setExpanded(true)
      setToast(`Validation run ${String(out.run?.status || 'finished')}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <p className="font-label text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">
            Validation · under this job’s data
          </p>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            Uniqueness, referential, and row-count checks via capped live
            validate — same place you preview rows.
          </p>
          {checks.length > 0 ? (
            <p className="mt-1 font-label text-[11px] text-secondary">
              {checks.length} check(s) ·{' '}
              {checks.filter((c) => c.status === 'passed' || c.status === 'ok')
                .length}{' '}
              ok ·{' '}
              {
                checks.filter(
                  (c) =>
                    c.status === 'failed' ||
                    c.status === 'error' ||
                    c.status === 'fail',
                ).length
              }{' '}
              fail
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-sm">
          {canWrite ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generate()}
                className="rounded bg-secondary px-md py-1.5 font-label text-[11px] font-semibold text-on-secondary disabled:opacity-40"
              >
                {busy ? '…' : 'Generate suite'}
              </button>
              <button
                type="button"
                disabled={busy || checks.length === 0}
                onClick={() => void run()}
                className="rounded-lg border border-secondary/50 px-md py-1.5 font-label text-[11px] text-secondary disabled:opacity-40"
              >
                Run validate
              </button>
            </>
          ) : null}
          {checks.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-outline-variant px-md py-1.5 font-label text-[11px]"
            >
              {expanded ? 'Hide checks' : 'Show checks'}
            </button>
          ) : null}
          <Link
            to={`/jobs/${jobId}/notebook`}
            className="rounded-lg border border-outline-variant px-md py-1.5 font-label text-[11px] text-on-surface-variant"
          >
            Notebook
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-sm text-[12px] text-error">{error}</p>
      ) : null}
      {toast ? (
        <p className="mt-sm text-[12px] text-secondary">{toast}</p>
      ) : null}

      {expanded && checks.length > 0 ? (
        <ul className="mt-md space-y-sm">
          {checks.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-outline-variant/25 bg-surface px-md py-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <p className="font-label text-[12px] font-semibold text-on-surface">
                  {c.title}
                </p>
                <span className="font-label text-[10px] uppercase text-on-surface-variant">
                  {c.kind} · {c.status}
                </span>
              </div>
              {c.sql ? (
                <pre className="mt-sm max-h-28 overflow-auto rounded bg-surface-container-lowest p-sm font-mono text-[10px] text-on-surface-variant">
                  {c.sql}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
