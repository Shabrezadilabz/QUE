import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfGhostButton, PdfPageHeader } from '@/components/pdf/PdfUi'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import {
  fetchObserveDashboard,
  type ObserveDashboard,
  type ObserveIncident,
} from '@/services/stitchApi'

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  healthy: {
    bg: 'border-[#7aecd0]/40 bg-[#7aecd0]/10',
    text: 'text-[#7aecd0]',
    label: 'All clear',
  },
  degraded: {
    bg: 'border-[#f0a020]/40 bg-[#f0a020]/10',
    text: 'text-[#f0a020]',
    label: 'Needs attention',
  },
  critical: {
    bg: 'border-[#ff6b6b]/40 bg-[#ff6b6b]/10',
    text: 'text-[#ff6b6b]',
    label: 'Critical',
  },
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ff6b6b',
  high: '#f0a020',
  medium: '#f0c040',
  low: '#888',
}

function StatCard({
  label,
  value,
  sub,
  to,
}: {
  label: string
  value: string | number
  sub?: string
  to?: string
}) {
  const inner = (
    <div className="rounded border border-[#333] bg-[#1a1d1f] px-[14px] py-[10px] transition-colors hover:border-[#555]">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#888]">
        {label}
      </div>
      <div className="mt-[4px] text-[22px] font-semibold text-[#e8e8e8]">
        {value}
      </div>
      {sub ? (
        <div className="mt-[2px] text-[11px] text-[#888]">{sub}</div>
      ) : null}
    </div>
  )
  if (to) {
    return (
      <Link to={to} className="block no-underline">
        {inner}
      </Link>
    )
  }
  return inner
}

function fmtTime(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function IncidentRow({ item }: { item: ObserveIncident }) {
  return (
    <tr className="border-b border-[#2a2e32] text-[12px]">
      <td className="py-[8px] pr-[8px]">
        <span
          className="rounded px-[6px] py-[2px] font-mono text-[9px] font-bold uppercase"
          style={{
            color: SEV_COLOR[item.severity] || '#888',
            border: `1px solid ${SEV_COLOR[item.severity] || '#888'}44`,
          }}
        >
          {item.severity}
        </span>
      </td>
      <td className="py-[8px] pr-[8px] font-mono text-[10px] uppercase text-[#888]">
        {item.kind}
      </td>
      <td className="py-[8px] pr-[8px] text-[#e8e8e8]">
        <Link to={item.link} className="text-[#e8e8e8] hover:text-[#c3f400]">
          {item.title}
        </Link>
        {item.detail ? (
          <div className="mt-[2px] text-[11px] text-[#888]">{item.detail}</div>
        ) : null}
      </td>
      <td className="py-[8px] text-[11px] text-[#888] whitespace-nowrap">
        {fmtTime(item.at)}
      </td>
    </tr>
  )
}

/** Que Observe — drift, golden eval, worker queue, duplicates, load SLA. */
export function ObservePage() {
  const { page: autofillPage } = usePageAutofill('observe')
  const [dash, setDash] = useState<ObserveDashboard | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setDash(await fetchObserveDashboard())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const statusStyle = STATUS_STYLE[dash?.summary.status || 'healthy']

  const healthScore = dash?.health?.score ?? null
  const goldenRecall = dash?.golden.recall
  const goldenMin = dash?.golden.minRecall

  const quickLinks = useMemo(
    () => [
      { to: '/drift-agent', label: 'Drift agent' },
      { to: '/eval', label: 'Golden eval' },
      { to: '/joins?tab=duplicates', label: 'Duplicate profile' },
      { to: '/load', label: 'Load & worker' },
      { to: '/compliance', label: 'Compliance' },
    ],
    [],
  )

  return (
    <QueAppChrome eyebrow="OBSERVE · DATA OPS">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-5xl md:px-lg">
        <PdfPageHeader
          title="Observe"
          subtitle="Monitors, drift, golden eval, incidents — Monte Carlo–class data reliability for your warehouse."
          actions={
            <PdfGhostButton onClick={() => void reload()} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </PdfGhostButton>
          }
        />

        {autofillPage ? (
          <div className="mt-md">
            <PageAutofillBanner page={autofillPage} compact />
          </div>
        ) : null}

        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}

        {dash ? (
          <>
            <div className="mt-lg flex flex-wrap items-center gap-[12px]">
              <span
                className={`rounded-full border px-[12px] py-[4px] text-[11px] font-bold tracking-wide uppercase ${statusStyle.bg} ${statusStyle.text}`}
              >
                {dash.summary.label}
              </span>
              <span className="text-[12px] text-[#888]">
                {dash.incidents.length} open signal
                {dash.incidents.length === 1 ? '' : 's'} · updated{' '}
                {fmtTime(dash.generatedAt)}
              </span>
            </div>

            <div className="mt-lg grid gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Health score"
                value={healthScore != null ? `${healthScore}%` : '—'}
                sub={dash.health?.grade?.replace('_', ' ') ?? undefined}
                to="/compliance"
              />
              <StatCard
                label="Open high drift"
                value={dash.drift.openHigh.length}
                sub={
                  dash.drift.hasBlockingRisk ? 'Export may block' : 'No blockers'
                }
                to="/drift-agent"
              />
              <StatCard
                label="Golden recall"
                value={fmtPct(goldenRecall)}
                sub={
                  goldenMin != null
                    ? `min ${(goldenMin * 100).toFixed(0)}%`
                    : undefined
                }
                to="/eval"
              />
              <StatCard
                label="Worker queue"
                value={dash.worker.queued + dash.worker.running}
                sub={`${dash.worker.failed7d} failed · 7d`}
                to="/load?tab=runs"
              />
              <StatCard
                label="Dup high risk"
                value={dash.duplicates.highRisk}
                sub={`${dash.duplicates.mediumRisk} medium · ${dash.duplicates.tableCount} tables`}
                to="/joins?tab=duplicates"
              />
              <StatCard
                label="Load sync errors"
                value={dash.load.errorCount}
                sub="connection pipelines"
                to="/load"
              />
              <StatCard
                label="Incidents"
                value={dash.incidents.length}
                sub="synthesized feed"
              />
              <StatCard
                label="Certification"
                value={dash.golden.certification?.status ?? '—'}
                sub={
                  dash.golden.certification?.goldenRecall != null
                    ? `recall ${fmtPct(dash.golden.certification.goldenRecall)}`
                    : 'not certified'
                }
                to="/eval"
              />
            </div>

            {dash.health?.breakdown?.length ? (
              <section className="mt-xl">
                <h2 className="font-headline text-[15px] font-semibold text-[#e8e8e8]">
                  Health breakdown
                </h2>
                <div className="mt-[10px] grid gap-[8px] sm:grid-cols-2">
                  {dash.health.breakdown.map((b) => (
                    <div
                      key={b.key}
                      className="flex items-center justify-between rounded border border-[#333] bg-[#121619] px-[12px] py-[8px] text-[12px]"
                    >
                      <span className="text-[#aaa]">{b.label}</span>
                      <span className="font-mono text-[#c3f400]">
                        {b.score}%
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-xl">
              <h2 className="font-headline text-[15px] font-semibold text-[#e8e8e8]">
                Incidents
              </h2>
              {dash.incidents.length === 0 ? (
                <p className="mt-[10px] text-[13px] text-[#888]">
                  No active incidents — drift, golden eval, load, and quality
                  signals are within thresholds.
                </p>
              ) : (
                <div className="mt-[10px] overflow-x-auto rounded border border-[#333]">
                  <table className="w-full min-w-[520px] border-collapse px-[8px]">
                    <thead>
                      <tr className="border-b border-[#333] text-left text-[10px] uppercase tracking-wider text-[#666]">
                        <th className="py-[8px] pl-[10px]">Severity</th>
                        <th className="py-[8px]">Kind</th>
                        <th className="py-[8px]">Incident</th>
                        <th className="py-[8px] pr-[10px]">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.incidents.map((item) => (
                        <IncidentRow key={item.id} item={item} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {dash.failedQueue.length > 0 ? (
              <section className="mt-xl">
                <h2 className="font-headline text-[15px] font-semibold text-[#e8e8e8]">
                  Recent failed queue items
                </h2>
                <ul className="mt-[10px] space-y-[6px]">
                  {dash.failedQueue.map((q) => (
                    <li
                      key={q.id}
                      className="rounded border border-[#333] bg-[#121619] px-[12px] py-[8px] text-[12px]"
                    >
                      <span className="font-mono text-[#888]">{q.kind}</span>{' '}
                      <span className="text-[#e8e8e8]">{q.error || 'failed'}</span>
                      <span className="ml-[8px] text-[11px] text-[#666]">
                        {fmtTime(q.finishedAt || q.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-xl pb-lg">
              <h2 className="font-headline text-[15px] font-semibold text-[#e8e8e8]">
                Deep dives
              </h2>
              <div className="mt-[10px] flex flex-wrap gap-[8px]">
                {quickLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="rounded border border-[#424850] px-[12px] py-[6px] text-[12px] text-[#c3f400] no-underline hover:border-[#c3f400]"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : busy ? (
          <p className="mt-lg text-[13px] text-[#888]">Loading observe dashboard…</p>
        ) : null}
      </div>
    </QueAppChrome>
  )
}
