import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  certifyTargetApi,
  createGovernanceTicketApi,
  ensurePolicyPacksApi,
  expireCertificationApi,
  fetchStewardQueue,
  fetchCertifications,
  applyPiiPolicyApi,
  type StewardQueue,
  type StewardCertification,
} from '@/services/stitchApi'

/**
 * Phase 4 — Steward UX: certify/expire queue + policy + tickets.
 */
export function StewardPage() {
  const { canWrite, canAdmin } = useWorkspaceRole()
  const [queue, setQueue] = useState<StewardQueue | null>(null)
  const [certs, setCerts] = useState<StewardCertification[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [ticketTitle, setTicketTitle] = useState('')

  async function reload() {
    const [q, c] = await Promise.all([
      fetchStewardQueue(),
      fetchCertifications('all'),
    ])
    setQueue(q)
    setCerts(c)
  }

  useEffect(() => {
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  async function certify(item: {
    targetKind: string
    targetId: string
    targetLabel: string
  }) {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      await certifyTargetApi({
        ...item,
        expiresInDays: 90,
        note: 'Certified from steward queue',
      })
      setToast(`Certified ${item.targetLabel}`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function expire(id: string) {
    if (!canWrite) return
    setBusy(true)
    try {
      await expireCertificationApi(id)
      setToast('Expired')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function seedPolicies() {
    if (!canAdmin) return
    setBusy(true)
    try {
      await ensurePolicyPacksApi()
      const pii = await applyPiiPolicyApi()
      setToast(`PII pack scanned ${pii.scannedColumns} cols · tagged ${pii.tagged}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function openTicket() {
    if (!canWrite || !ticketTitle.trim()) return
    setBusy(true)
    try {
      const t = await createGovernanceTicketApi({
        title: ticketTitle.trim(),
        body: 'Opened from Que steward UX',
        kind: 'access_request',
      })
      setTicketTitle('')
      setToast(`Ticket ${t.status}${t.externalKey ? ` · ${t.externalKey}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="STEWARD · PHASE 4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
          <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Stewardship
              </h1>
              <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
                Certify / expire high-value tables, apply policy packs, open
                Jira/ServiceNow tickets — without diluting the DE stitch loop.
              </p>
            </div>
            <div className="flex flex-wrap gap-md">
              <Link to="/glossary" className="font-label text-[12px] text-primary hover:underline">
                Glossary
              </Link>
              <Link to="/settings/ai-policy" className="font-label text-[12px] text-primary hover:underline">
                Ticket webhooks
              </Link>
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

          <div className="mb-lg flex flex-wrap gap-md font-body text-[13px] text-on-surface-variant">
            <span>
              <strong className="text-on-surface">
                {queue?.certifiedCount ?? 0}
              </strong>{' '}
              certified
            </span>
            <span>
              <strong className="text-on-surface">
                {queue?.needsCertification?.length ?? 0}
              </strong>{' '}
              need cert
            </span>
            <span>
              <strong className="text-on-surface">
                {queue?.expiringSoon?.length ?? 0}
              </strong>{' '}
              expiring soon
            </span>
          </div>

          <div className="grid gap-lg lg:grid-cols-2">
            <section className="rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm">
              <h2 className="font-headline text-base font-semibold text-on-surface-variant">
                Needs certification
              </h2>
              <ul className="mt-md space-y-sm">
                {(queue?.needsCertification || []).map((item) => (
                  <li
                    key={`${item.targetKind}:${item.targetId}`}
                    className="flex items-center justify-between gap-sm rounded-lg bg-surface-container-low px-md py-sm"
                  >
                    <div>
                      <p className="font-body text-[13px] text-on-surface">
                        {item.targetLabel}
                      </p>
                      <p className="font-label text-[11px] text-on-surface-variant">
                        {item.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() => void certify(item)}
                      className="shrink-0 rounded-lg bg-primary px-md py-1.5 font-label text-[11px] text-on-primary disabled:opacity-40"
                    >
                      Certify 90d
                    </button>
                  </li>
                ))}
                {!queue?.needsCertification?.length ? (
                  <p className="font-body text-[13px] text-on-surface-variant">
                    Queue clear — promote joins or sync schema first.
                  </p>
                ) : null}
              </ul>
            </section>

            <section className="rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm">
              <h2 className="font-headline text-base font-semibold text-on-surface-variant">
                Policy & tickets
              </h2>
              <button
                type="button"
                disabled={!canAdmin || busy}
                onClick={() => void seedPolicies()}
                className="mt-md rounded-lg border border-primary px-md py-2 font-label text-[12px] text-primary disabled:opacity-40"
              >
                Seed defaults + apply PII pack
              </button>
              <label className="mt-lg block">
                <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Access / governance ticket
                </span>
                <input
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  placeholder="Request access to orders.customer_email"
                  className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                  disabled={!canWrite || busy}
                />
              </label>
              <button
                type="button"
                disabled={!canWrite || busy || !ticketTitle.trim()}
                onClick={() => void openTicket()}
                className="mt-sm rounded-lg bg-primary px-md py-2 font-label text-[12px] text-on-primary disabled:opacity-40"
              >
                Open ticket
              </button>

              <h3 className="mt-xl font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                Active certifications
              </h3>
              <ul className="mt-sm max-h-64 space-y-sm overflow-y-auto">
                {certs
                  .filter((c) => c.status === 'certified')
                  .slice(0, 30)
                  .map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-sm rounded-lg border border-outline-variant/20 px-md py-sm"
                    >
                      <div>
                        <p className="font-body text-[12px] text-on-surface">
                          {c.targetLabel}
                        </p>
                        <p className="font-label text-[10px] text-on-surface-variant">
                          {c.targetKind}
                          {c.expiresAt
                            ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!canWrite || busy}
                        onClick={() => void expire(c.id)}
                        className="font-label text-[11px] text-error disabled:opacity-40"
                      >
                        Expire
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        </main>
      </div>
    </QueAppChrome>
  )
}
