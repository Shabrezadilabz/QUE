import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  fetchJobs,
  fetchValidationSuite,
  generateValidationSuiteApi,
  runValidationSuiteApi,
  type ValidationCheck,
} from '@/services/stitchApi'

/**
 * Phase 3 — Warehouse validation suite (customer warehouse, capped live validate).
 */
export function ValidationSuitePage() {
  const { canWrite } = useWorkspaceRole()
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([])
  const [jobId, setJobId] = useState('')
  const [checks, setChecks] = useState<ValidationCheck[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetchJobs()
      .then((list) => {
        const mapped = (list || []).map((j) => ({
          id: j.id,
          title: j.title || j.id,
        }))
        setJobs(mapped)
        if (mapped[0]) setJobId(mapped[0].id)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
  }, [])

  useEffect(() => {
    if (!jobId) return
    fetchValidationSuite(jobId)
      .then(setChecks)
      .catch(() => setChecks([]))
  }, [jobId])

  async function generate() {
    if (!canWrite || !jobId) return
    setBusy(true)
    setError(null)
    try {
      const out = await generateValidationSuiteApi(jobId)
      setChecks(out.checks)
      setToast(`Generated ${out.checks.length} check(s) · appended notebook cells`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    if (!canWrite || !jobId) return
    setBusy(true)
    setError(null)
    try {
      const out = await runValidationSuiteApi(jobId)
      setChecks(out.checks)
      setToast(`Validation run ${String(out.run?.status || 'finished')}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="VALIDATION SUITE · PHASE 3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
          <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Validation suite
              </h1>
              <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
                Uniqueness, referential, and row-count sanity checks — executed
                in the customer warehouse via live validate (capped rows).
              </p>
            </div>
            <Link
              to="/drift-agent"
              className="font-label text-[12px] text-secondary hover:underline"
            >
              Drift agent
            </Link>
          </div>

          {error ? (
            <p className="mb-md rounded-xl border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="mb-md rounded-xl border border-secondary/25 bg-secondary/5 px-md py-sm font-label text-[12px] text-secondary">
              {toast}
            </p>
          ) : null}

          <section className="mb-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
            <label className="block">
              <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                Job
              </span>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full max-w-md rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
              >
                {!jobs.length ? (
                  <option value="">No jobs yet</option>
                ) : (
                  jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div className="mt-md flex flex-wrap gap-sm">
              <button
                type="button"
                disabled={!canWrite || busy || !jobId}
                onClick={() => void generate()}
                className="rounded bg-secondary px-md py-2 font-label text-[12px] text-on-secondary disabled:opacity-40"
              >
                Generate suite
              </button>
              <button
                type="button"
                disabled={!canWrite || busy || !jobId}
                onClick={() => void run()}
                className="rounded-lg border border-secondary px-md py-2 font-label text-[12px] text-secondary disabled:opacity-40"
              >
                Run (live validate)
              </button>
              {jobId ? (
                <Link
                  to={`/jobs/${jobId}/notebook`}
                  className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] text-on-surface-variant"
                >
                  Open notebook
                </Link>
              ) : null}
            </div>
          </section>

          <ul className="space-y-sm">
            {checks.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-lg py-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div>
                    <p className="font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                      {c.kind} · {c.status}
                    </p>
                    <p className="mt-1 font-body text-[13px] text-on-surface">
                      {c.title}
                    </p>
                  </div>
                </div>
                <pre className="mt-sm overflow-x-auto rounded-lg bg-surface-container-low p-sm font-mono text-[11px] text-on-surface-variant">
                  {c.sql}
                </pre>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </QueAppChrome>
  )
}
