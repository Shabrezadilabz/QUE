import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  certifyTargetApi,
  createGovernanceTicketApi,
  ensurePolicyPacksApi,
  expireCertificationApi,
  fetchStewardQueue,
  fetchCertifications,
  applyPiiPolicyApi,
  fetchStewardInbox,
  updateStewardIssueApi,
  type StewardQueue,
  type StewardCertification,
  type StewardInboxIssue,
  type StewardInboxSummary,
} from '@/services/stitchApi'

function severityTone(sev: string) {
  if (sev === 'critical') return 'border-rose-500/40 bg-rose-500/10 text-rose-200'
  if (sev === 'high') return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  if (sev === 'medium') return 'border-sky-500/30 bg-sky-500/10 text-sky-200'
  return 'border-[#424850] bg-[#15191e] text-[#c8cdd3]'
}

/**
 * Steward UX — Monk Mode quality inbox + certification queue + policy tools.
 */
export function StewardPage() {
  const { canWrite, canAdmin } = useWorkspaceRole()
  const [queue, setQueue] = useState<StewardQueue | null>(null)
  const [certs, setCerts] = useState<StewardCertification[]>([])
  const [inbox, setInbox] = useState<StewardInboxIssue[]>([])
  const [inboxSummary, setInboxSummary] = useState<StewardInboxSummary | null>(null)
  const [inboxFilter, setInboxFilter] = useState<'open' | 'all'>('open')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [ticketTitle, setTicketTitle] = useState('')

  async function reload() {
    const [q, c, inboxOut] = await Promise.all([
      fetchStewardQueue(),
      fetchCertifications('all'),
      fetchStewardInbox({ status: inboxFilter === 'open' ? 'open' : 'all' }),
    ])
    setQueue(q)
    setCerts(c)
    setInbox(inboxOut.items)
    setInboxSummary(inboxOut.summary)
  }

  useEffect(() => {
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [inboxFilter])

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

  async function resolveIssue(id: string, status: 'approved' | 'resolved' | 'rejected') {
    if (!canWrite) return
    setBusy(true)
    try {
      await updateStewardIssueApi(id, status)
      setToast(status === 'rejected' ? 'Issue dismissed' : 'Issue resolved')
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
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Steward"
          subtitle="Review quality issues from Monk Mode, certify high-value assets, and apply policy packs."
          actions={
            <Link to="/monk">
              <PdfPrimaryButton type="button">Run Monk Mode</PdfPrimaryButton>
            </Link>
          }
        />

        <main className="min-h-0 flex-1 overflow-y-auto px-[20px] pb-[28px] pt-[8px] md:px-[28px]">
          {error ? (
            <p className="mb-[14px] rounded-[12px] border border-solid border-rose-500/40 bg-rose-500/10 px-[14px] py-[10px] text-[13px] text-rose-200">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="mb-[14px] rounded-[12px] border border-solid border-emerald-500/30 bg-emerald-500/10 px-[14px] py-[10px] text-[12px] font-medium text-emerald-200">
              {toast}
            </p>
          ) : null}

          <div className="mb-[18px] flex flex-wrap gap-[12px] text-[13px] text-[#9aa3ad]">
            <span>
              <strong className="text-[#e8edf2]">{inboxSummary?.open ?? 0}</strong> open issues
            </span>
            <span>
              <strong className="text-[#e8edf2]">{inboxSummary?.high ?? 0}</strong> high severity
            </span>
            <span>
              <strong className="text-[#e8edf2]">{queue?.certifiedCount ?? 0}</strong> certified
            </span>
            <span>
              <strong className="text-[#e8edf2]">{queue?.needsCertification?.length ?? 0}</strong>{' '}
              need cert
            </span>
          </div>

          <section className="mb-[18px] rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
            <div className="mb-[14px] flex flex-wrap items-center justify-between gap-[10px]">
              <div>
                <h2 className="text-[14px] font-semibold text-[#e8edf2]">Quality inbox</h2>
                <p className="mt-[4px] text-[12px] text-[#8b949e]">
                  Issues queued by Monk Mode profiling and industry quality rules.
                </p>
              </div>
              <div className="flex gap-[6px]">
                {(['open', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setInboxFilter(f)}
                    className={[
                      'rounded-[10px] border border-solid px-[12px] py-[5px] text-[11px] font-semibold capitalize',
                      inboxFilter === f
                        ? 'border-[#5c6773] bg-[#2e343b] text-[#e8edf2]'
                        : 'border-[#424850] bg-[#0f1215] text-[#9aa3ad] hover:bg-[#15191e]',
                    ].join(' ')}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <ul className="space-y-[8px]">
              {inbox.map((issue) => (
                <li
                  key={issue.id}
                  className="rounded-[12px] border border-solid border-[#2a3038] bg-[#0f1215] px-[14px] py-[12px]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-[10px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-[8px]">
                        <span
                          className={`rounded-full border border-solid px-[8px] py-[2px] text-[10px] font-bold uppercase tracking-wide ${severityTone(issue.severity)}`}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                          {issue.issueKind}
                        </span>
                      </div>
                      <p className="mt-[8px] text-[13px] font-medium text-[#e8edf2]">
                        {issue.title}
                      </p>
                      {issue.description ? (
                        <p className="mt-[4px] text-[12px] leading-snug text-[#8b949e]">
                          {issue.description}
                        </p>
                      ) : null}
                      {issue.tableName ? (
                        <p className="mt-[6px] font-mono text-[11px] text-[#9aa3ad]">
                          {issue.tableName}
                          {issue.columnName ? `.${issue.columnName}` : ''}
                        </p>
                      ) : null}
                    </div>
                    {issue.status === 'open' || issue.status === 'in_review' ? (
                      <div className="flex shrink-0 flex-wrap gap-[6px]">
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => void resolveIssue(issue.id, 'approved')}
                          className="rounded-[8px] bg-emerald-500/20 px-[10px] py-[5px] text-[11px] font-semibold text-emerald-200 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => void resolveIssue(issue.id, 'resolved')}
                          className="rounded-[8px] border border-solid border-[#424850] px-[10px] py-[5px] text-[11px] font-semibold text-[#c8cdd3] disabled:opacity-40"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => void resolveIssue(issue.id, 'rejected')}
                          className="rounded-[8px] px-[10px] py-[5px] text-[11px] font-semibold text-[#8b949e] hover:text-rose-300 disabled:opacity-40"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-[#2e343b] px-[10px] py-[4px] text-[10px] font-semibold uppercase text-[#9aa3ad]">
                        {issue.status}
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {!inbox.length ? (
                <li className="rounded-[12px] border border-dashed border-[#424850] px-[14px] py-[24px] text-center text-[12px] text-[#8b949e]">
                  Inbox clear — run{' '}
                  <Link to="/monk" className="font-semibold text-sky-300 hover:underline">
                    Monk Mode
                  </Link>{' '}
                  to profile your schema and seed quality checks.
                </li>
              ) : null}
            </ul>
          </section>

          <div className="grid gap-[18px] lg:grid-cols-2">
            <section className="rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
              <h2 className="text-[14px] font-semibold text-[#e8edf2]">Needs certification</h2>
              <ul className="mt-[12px] space-y-[8px]">
                {(queue?.needsCertification || []).map((item) => (
                  <li
                    key={`${item.targetKind}:${item.targetId}`}
                    className="flex items-center justify-between gap-[10px] rounded-[10px] border border-solid border-[#2a3038] bg-[#0f1215] px-[12px] py-[10px]"
                  >
                    <div>
                      <p className="text-[13px] text-[#e8edf2]">{item.targetLabel}</p>
                      <p className="text-[11px] text-[#8b949e]">{item.reason}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() => void certify(item)}
                      className="shrink-0 rounded-[8px] bg-[#2e343b] px-[12px] py-[6px] text-[11px] font-semibold text-[#e8edf2] disabled:opacity-40"
                    >
                      Certify 90d
                    </button>
                  </li>
                ))}
                {!queue?.needsCertification?.length ? (
                  <p className="text-[12px] text-[#8b949e]">
                    Queue clear — promote joins or sync schema first.
                  </p>
                ) : null}
              </ul>
            </section>

            <section className="rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
              <h2 className="text-[14px] font-semibold text-[#e8edf2]">Policy & tickets</h2>
              <button
                type="button"
                disabled={!canAdmin || busy}
                onClick={() => void seedPolicies()}
                className="mt-[12px] rounded-[10px] border border-solid border-[#424850] px-[14px] py-[8px] text-[12px] font-semibold text-[#c8cdd3] disabled:opacity-40"
              >
                Seed defaults + apply PII pack
              </button>
              <label className="mt-[16px] block">
                <span className="mb-[6px] block text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8b949e]">
                  Access / governance ticket
                </span>
                <input
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  placeholder="Request access to orders.customer_email"
                  className="w-full rounded-[10px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[10px] text-[13px] text-[#e8edf2]"
                  disabled={!canWrite || busy}
                />
              </label>
              <button
                type="button"
                disabled={!canWrite || busy || !ticketTitle.trim()}
                onClick={() => void openTicket()}
                className="mt-[10px] rounded-[10px] bg-[#2e343b] px-[14px] py-[8px] text-[12px] font-semibold text-[#e8edf2] disabled:opacity-40"
              >
                Open ticket
              </button>

              <h3 className="mt-[20px] text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8b949e]">
                Active certifications
              </h3>
              <ul className="mt-[10px] max-h-[240px] space-y-[8px] overflow-y-auto">
                {certs
                  .filter((c) => c.status === 'certified')
                  .slice(0, 30)
                  .map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-[10px] rounded-[10px] border border-solid border-[#2a3038] px-[12px] py-[8px]"
                    >
                      <div>
                        <p className="text-[12px] text-[#e8edf2]">{c.targetLabel}</p>
                        <p className="text-[10px] text-[#8b949e]">
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
                        className="text-[11px] font-semibold text-rose-300 disabled:opacity-40"
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
