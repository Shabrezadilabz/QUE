import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicEval, fetchGlobalGtm } from '@/services/stitchApi'
import {
  FigmaPublicShell,
  FigmaStatusFooter,
} from '@/components/figma/FigmaPublicShell'

/** Sprint 12 — Public eval scorecard for sales (no auth). */
export function PublicEvalPage() {
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null)
  const [gtm, setGtm] = useState<{ caseStudies?: { title: string; region: string; metric: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([fetchPublicEval(), fetchGlobalGtm()])
      .then(([ev, g]) => {
        setSnapshot((ev.snapshot || ev) as Record<string, unknown>)
        setGtm(g)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const agent = (snapshot?.agent || {}) as Record<string, number>
  const certSla = (snapshot?.certSla || {}) as Record<string, unknown>

  return (
    <FigmaPublicShell
      section="Eval"
      footer={<FigmaStatusFooter />}
    >
      <div className="flex flex-col gap-[24px] p-[24px]">
        <div>
          <h1 className="text-[24px] font-bold text-[#ecf0f4]">Quality scorecard</h1>
          <p className="mt-[8px] text-[14px] text-[#a3afbe]">
            Golden recall, agent success, cert SLA — shareable with design partners (no PII).
          </p>
        </div>
        {error ? (
          <p className="text-[13px] text-[#ff6b6b]">{error}</p>
        ) : null}
        {snapshot ? (
          <div className="grid gap-[16px] sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Golden recall" value={fmtPct(snapshot.goldenRecallPct)} />
            <Metric label="Join promote rate" value={fmtPct(snapshot.joinPromoteRatePct)} />
            <Metric label="Job success" value={fmtPct(snapshot.jobSuccessRatePct)} />
            <Metric label="Agent success" value={fmtPct(agent.successRatePct)} />
            <Metric label="Cert SLA p50" value={certSla.p50Hours != null ? `${certSla.p50Hours}h` : '—'} />
            <Metric
              label="Cert &lt;4h target"
              value={certSla.meetsTarget ? 'Met' : '—'}
            />
          </div>
        ) : null}
        <p className="text-[13px] text-[#c8cdd3]">
          {String(snapshot?.headline || '')}
        </p>
        {gtm?.caseStudies?.length ? (
          <section className="rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e] p-[16px]">
            <h2 className="text-[14px] font-bold text-[#ecf0f4]">Customer outcomes</h2>
            <ul className="mt-[12px] space-y-[8px] text-[13px] text-[#c8cdd3]">
              {gtm.caseStudies.slice(0, 3).map((c) => (
                <li key={c.title}>
                  <strong className="text-[#ecf0f4]">{c.title}</strong>
                  <span className="text-[#a3afbe]"> · {c.region} · {c.metric}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-center text-[12px] text-[#a3afbe]">
          <Link to="/pricing" className="text-[#68ceaf] hover:underline">Pricing</Link>
          {' · '}
          <Link to="/sales" className="text-[#68ceaf] hover:underline">Sales</Link>
          {' · '}
          <Link to="/login?sandbox=1" className="text-[#68ceaf] hover:underline">Sandbox</Link>
        </p>
      </div>
    </FigmaPublicShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-solid border-[#2a313c] bg-[#121619] p-[16px]">
      <p className="text-[11px] uppercase tracking-wide text-[#a3afbe]">{label}</p>
      <p className="mt-[4px] text-[22px] font-extrabold text-[#68ceaf]">{value}</p>
    </div>
  )
}

function fmtPct(v: unknown) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? `${n}%` : '—'
}

export default PublicEvalPage
