import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  fetchDriftFixes,
  proposeDriftFixesApi,
  resolveDriftFixApi,
  type DriftFixSuggestion,
} from '@/services/stitchApi'

/**
 * Phase 3 — Drift agent: propose remaps / re-freeze from open drift.
 */
export function DriftAgentPage() {
  const { canWrite } = useWorkspaceRole()
  const [items, setItems] = useState<DriftFixSuggestion[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function reload() {
    setItems(await fetchDriftFixes('proposed'))
  }

  useEffect(() => {
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  async function propose() {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      const out = await proposeDriftFixesApi()
      setToast(
        `Scanned ${out.scannedDrift ?? 0} open drift · created ${out.created} suggestion(s)`,
      )
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function resolve(id: string, action: 'accept' | 'dismiss') {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      await resolveDriftFixApi(id, action)
      setToast(action === 'accept' ? 'Applied fix' : 'Dismissed')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="DRIFT AGENT · PHASE 3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
          <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Drift agent
              </h1>
              <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
                Schema change → impact → suggested remap / re-freeze. Accept is
                still a human trust gate.
              </p>
            </div>
            <div className="flex flex-wrap gap-sm">
              <Link
                to="/agent"
                className="font-label text-[12px] text-primary hover:underline"
              >
                Stitch Agent
              </Link>
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={() => void propose()}
                className="rounded-lg bg-primary px-lg py-2 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
              >
                {busy ? 'Working…' : 'Scan & propose fixes'}
              </button>
            </div>
          </div>

          {error ? (
            <p className="mb-md rounded-xl border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="mb-md rounded-xl border border-primary/20 bg-primary/5 px-md py-sm font-label text-[12px] text-primary">
              {toast}
            </p>
          ) : null}

          {!items.length ? (
            <p className="font-body text-[13px] text-on-surface-variant">
              No open fix suggestions. Run a scan after sync/drift events.
            </p>
          ) : (
            <ul className="space-y-md">
              {items.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm"
                >
                  <p className="font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                    {s.kind} · {s.status}
                  </p>
                  <p className="mt-sm font-body text-[14px] text-on-surface">
                    {s.summary}
                  </p>
                  {s.jobId ? (
                    <Link
                      to={`/jobs/${s.jobId}/deploy`}
                      className="mt-sm inline-block font-label text-[12px] text-primary hover:underline"
                    >
                      Open job deploy
                    </Link>
                  ) : null}
                  <div className="mt-md flex flex-wrap gap-sm">
                    <button
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() => void resolve(s.id, 'accept')}
                      className="rounded-lg bg-primary px-md py-2 font-label text-[12px] text-on-primary disabled:opacity-40"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() => void resolve(s.id, 'dismiss')}
                      className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] text-on-surface-variant disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </QueAppChrome>
  )
}
