import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfPrimaryButton, PdfGhostButton } from '@/components/pdf/PdfUi'
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
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
      <PdfPageHeader
        title="Validation & Drift Monitoring"
        subtitle="Schema change → impact → suggested remap / re-freeze. Human trust gate on every fix."
        actions={
          <>
            <Link
              to="/chat?agent=1"
              className="mr-2 text-[12px] text-[#7aecd0] hover:underline"
            >
              Stitch Agent
            </Link>
            <PdfPrimaryButton disabled={!canWrite || busy} onClick={() => void propose()}>
              {busy ? 'Working…' : 'Scan & propose fixes'}
            </PdfPrimaryButton>
          </>
        }
      />
      <div className="p-6">
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

          {!items.length ? (
            <p className="font-body text-[13px] text-on-surface-muted">
              No open fix suggestions. Run a scan after sync/drift events.
            </p>
          ) : (
            <div className="pdf-panel">
            <ul className="divide-y divide-[#424850]/40">
              {items.map((s) => (
                <li key={s.id} className="p-4">
                  <p className="text-[11px] font-bold tracking-widest text-[#a3afbe] uppercase">
                    {s.kind} · {s.status}
                  </p>
                  <p className="mt-2 text-[14px] text-[#d4dbe3]">
                    {s.summary}
                  </p>
                  {s.jobId ? (
                    <Link
                      to={`/jobs/${s.jobId}/deploy`}
                      className="mt-2 inline-block text-[12px] text-[#7aecd0] hover:underline"
                    >
                      Open job deploy
                    </Link>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <PdfPrimaryButton
                      disabled={!canWrite || busy}
                      onClick={() => void resolve(s.id, 'accept')}
                    >
                      Accept
                    </PdfPrimaryButton>
                    <PdfGhostButton
                      disabled={!canWrite || busy}
                      onClick={() => void resolve(s.id, 'dismiss')}
                    >
                      Dismiss
                    </PdfGhostButton>
                  </div>
                </li>
              ))}
            </ul>
            </div>
          )}
      </div>
      </div>
    </QueAppChrome>
  )
}
