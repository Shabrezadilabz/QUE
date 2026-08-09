import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DataSource } from '@/types/dataSource'
import {
  reviewRelationship,
  runStitchSession,
  type StitchSessionResult,
  type StitchSessionSuggestion,
} from '@/services/stitchApi'

type Props = {
  open: boolean
  onClose: () => void
  sources: DataSource[]
  onComplete: () => void | Promise<void>
}

/**
 * Guided two-source stitch: pick A+B → infer → promote/reject → create job.
 */
export function StitchSessionDialog({
  open,
  onClose,
  sources,
  onComplete,
}: Props) {
  const [connA, setConnA] = useState('')
  const [connB, setConnB] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StitchSessionResult | null>(null)
  const [jobTitle, setJobTitle] = useState('')

  useEffect(() => {
    if (!open) return
    setError(null)
    setResult(null)
    setJobTitle('')
    if (sources.length >= 2) {
      setConnA(sources[0].id)
      setConnB(sources[1].id)
    } else if (sources.length === 1) {
      setConnA(sources[0].id)
      setConnB('')
    }
  }, [open, sources])

  if (!open) return null

  async function runInfer() {
    if (!connA || !connB || connA === connB) {
      setError('Select two different connections')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await runStitchSession({
        connectionIdA: connA,
        connectionIdB: connB,
      })
      setResult(r)
      setJobTitle(
        `Stitch ${r.connectionA.name || 'A'} ↔ ${r.connectionB.name || 'B'}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function review(id: string, action: 'promote' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      const updated = await reviewRelationship(id, action)
      if (!updated) throw new Error(`${action} failed`)
      setResult((prev) => {
        if (!prev) return prev
        const suggested = prev.suggested.filter((s) => s.id !== id)
        return {
          ...prev,
          suggested,
          acceptedBetween:
            action === 'promote'
              ? prev.acceptedBetween + 1
              : prev.acceptedBetween,
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function createJob() {
    if (!connA || !connB) return
    setBusy(true)
    setError(null)
    try {
      const r = await runStitchSession({
        connectionIdA: connA,
        connectionIdB: connB,
        createJob: true,
        jobTitle: jobTitle || undefined,
      })
      setResult(r)
      await onComplete()
      if (r.job?.id) {
        window.location.assign('/jobs')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function shipDbtPr() {
    if (!connA || !connB) return
    setBusy(true)
    setError(null)
    try {
      const r = await runStitchSession({
        connectionIdA: connA,
        connectionIdB: connB,
        shipDbtPr: true,
        jobTitle: jobTitle || undefined,
      })
      setResult(r)
      await onComplete()
      const prUrl = (r.export as { github?: { prUrl?: string; opened?: boolean; reason?: string } } | undefined)
        ?.github?.prUrl
      const github = (r.export as { github?: { opened?: boolean; reason?: string; prUrl?: string } } | undefined)
        ?.github
      if (prUrl) {
        window.open(prUrl, '_blank', 'noreferrer')
      } else if (github && !github.opened) {
        setError(
          `Job created · PR not opened (${github.reason || 'set GITHUB_TOKEN + Settings github owner/repo'})`,
        )
        if (r.job?.id) window.location.assign('/jobs')
      } else if (r.job?.id) {
        window.location.assign('/jobs')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-md"
      role="dialog"
      aria-modal="true"
      aria-label="Two-source stitch session"
    >
      <div className="max-h-[90vh] w-full max-w-[36rem] overflow-y-auto rounded-2xl border border-sand/40 bg-surface-container-lowest p-md shadow-xl">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h2 className="font-headline text-lg text-on-surface">
              Stitch session
            </h2>
            <p className="mt-xs font-body text-xs text-on-surface-variant">
              Connect two sources → suggest joins → promote → create job → deploy
              dbt PR from Jobs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-label text-[10px] tracking-widest text-on-surface-variant hover:text-primary-fixed"
          >
            CLOSE
          </button>
        </div>

        <div className="mt-md grid gap-sm sm:grid-cols-2">
          <label className="block">
            <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
              SOURCE A
            </span>
            <select
              value={connA}
              onChange={(e) => setConnA(e.target.value)}
              className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-sm text-on-surface outline-none focus:border-primary-fixed"
            >
              <option value="">Select…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.type})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
              SOURCE B
            </span>
            <select
              value={connB}
              onChange={(e) => setConnB(e.target.value)}
              className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-sm text-on-surface outline-none focus:border-primary-fixed"
            >
              <option value="">Select…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === connA}>
                  {s.name} ({s.type})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-md flex flex-wrap gap-sm">
          <button
            type="button"
            disabled={busy || !connA || !connB}
            onClick={() => void runInfer()}
            className="rounded bg-secondary px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-secondary disabled:opacity-40"
          >
            {busy && !result ? 'RUNNING…' : '1 · INFER JOINS'}
          </button>
        </div>

        {error ? (
          <p className="mt-sm border border-error/40 bg-error/10 px-sm py-xs font-body text-xs text-error">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="mt-md space-y-md border-t border-outline-variant pt-md">
            <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
              INFERRED {result.inference.created} NEW · SCANNED{' '}
              {result.inference.scanned} · ACCEPTED BETWEEN{' '}
              {result.acceptedBetween} · PENDING {result.suggested.length}
            </p>

            <ul className="max-h-56 space-y-xs overflow-y-auto">
              {result.suggested.length === 0 ? (
                <li className="font-body text-xs text-on-surface-variant">
                  No pending suggestions between these sources
                  {result.acceptedBetween > 0
                    ? ` — ${result.acceptedBetween} already promoted.`
                    : '. Sync sources first if schemas are empty.'}
                </li>
              ) : (
                result.suggested.map((s: StitchSessionSuggestion) => (
                  <li
                    key={s.id}
                    className="border border-outline-variant bg-surface-container p-sm"
                  >
                    <div className="flex items-start justify-between gap-sm">
                      <div>
                        <p className="font-body text-xs text-on-surface">
                          {s.from} → {s.to}
                        </p>
                        <p className="mt-xs font-label text-[9px] tracking-widest text-on-surface-variant">
                          CONF {Math.round(s.confidence * 100)}%
                          {s.evidence?.summary
                            ? ` · ${s.evidence.summary.slice(0, 80)}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-xs">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void review(s.id, 'promote')}
                          className="border border-primary-fixed px-sm py-xs font-label text-[8px] tracking-widest text-primary-fixed"
                        >
                          PROMOTE
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void review(s.id, 'reject')}
                          className="border border-outline-variant px-sm py-xs font-label text-[8px] tracking-widest text-on-surface-variant"
                        >
                          REJECT
                        </button>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>

            <label className="block">
              <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
                JOB TITLE
              </span>
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-sm text-on-surface outline-none focus:border-primary-fixed"
              />
            </label>

            <button
              type="button"
              disabled={busy || result.acceptedBetween === 0}
              onClick={() => void createJob()}
              className="w-full border border-outline-variant px-md py-sm font-label text-[10px] tracking-widest text-on-surface disabled:opacity-40"
              title={
                result.acceptedBetween === 0
                  ? 'Promote at least one join first'
                  : undefined
              }
            >
              2 · CREATE JOB FROM PROMOTED JOINS
            </button>
            <button
              type="button"
              disabled={busy || result.acceptedBetween === 0}
              onClick={() => void shipDbtPr()}
              className="w-full rounded bg-secondary px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-secondary disabled:opacity-40"
              title={
                result.acceptedBetween === 0
                  ? 'Promote at least one join first'
                  : 'Creates job + opens attested dbt PR (needs GITHUB_TOKEN + Settings owner/repo)'
              }
            >
              3 · SHIP DBT PR (DEFAULT DONE)
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export default StitchSessionDialog
