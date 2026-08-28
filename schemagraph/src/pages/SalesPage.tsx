/**
 * Public sales page — honest positioning for prospects (no auth).
 */
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { QueLogo } from '@/components/QueLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { fetchGlobalGtm } from '@/services/stitchApi'

export function SalesPage() {
  const [studies, setStudies] = useState<
    { title: string; region: string; outcome: string; metric: string }[]
  >([])

  useEffect(() => {
    void fetchGlobalGtm()
      .then((g) => setStudies(g.caseStudies || []))
      .catch(() => undefined)
  }, [])

  return (
    <div className="que-auth-bg relative min-h-screen overflow-hidden">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle compact />
      </div>
      <div
        className="que-auth-orb-teal pointer-events-none absolute -right-20 top-0 size-64 rounded-xl opacity-10 blur-[60px]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-md py-xl md:px-lg">
        <QueLogo
          size={40}
          withWordmark
          wordmarkClassName="font-label text-[12px] tracking-[0.22em] text-on-surface-variant uppercase"
        />
        <h1 className="mt-md font-headline text-4xl font-semibold tracking-tight text-on-surface md:text-5xl">
          Cursor for data teams.
        </h1>
        <p className="mt-md max-w-2xl font-body text-[16px] leading-relaxed text-on-surface-variant">
          Schema-first HITL. Propose joins, draft transforms, schedule jobs, and
          ship attested contracts — without AI reading your lake. Warehouse or
          Que managed plane stays the system of record.
        </p>

        <div className="mt-xl flex flex-wrap gap-sm">
          <Link
            to="/login?sandbox=1"
            className="rounded bg-primary px-lg py-2.5 font-label text-[13px] font-semibold text-on-primary hover:bg-primary-fixed-dim"
          >
            Free sandbox
          </Link>
          <Link
            to="/pricing"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            Pricing
          </Link>
          <Link
            to="/login"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            Sign in
          </Link>
          <Link
            to="/connectors"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            Connectors
          </Link>
          <Link
            to="/status"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            System status
          </Link>
          <Link
            to="/eval/public"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            Quality scorecard
          </Link>
        </div>

        <div className="mt-xl grid gap-lg sm:grid-cols-2">
          <Offer
            kicker="Offer A"
            title="Bring your warehouse"
            body="Databricks, Snowflake, Postgres stay SoR. Que syncs schema, proposes joins, and digests external job failures."
          />
          <Offer
            kicker="Offer B"
            title="Que managed plane"
            body="Excel/SQL teams land certified datasets in Que with quotas and retention. AI is denied managed row payloads."
          />
        </div>

        <section className="mt-xl">
          <h2 className="font-headline text-xl font-semibold">Why teams pick Que</h2>
          <ul className="mt-md space-y-sm font-body text-[14px] text-on-surface-variant">
            <li>• Pinned scrubbed samples (5–10 rows) — not full-lake AI</li>
            <li>• Human Promote with evidence — no silent auto-merge by default</li>
            <li>• Certified BI embeds for stakeholders</li>
            <li>• Compliance evidence pack for auditor diligence (not Type II cert)</li>
          </ul>
        </section>

        {studies.length > 0 ? (
          <section className="mt-xl">
            <h2 className="font-headline text-xl font-semibold">Customer outcomes (S12)</h2>
            <ul className="mt-md space-y-md">
              {studies.map((s) => (
                <li
                  key={s.title}
                  className="rounded-lg border border-outline-variant bg-surface-container-low/90 p-lg text-[13px]"
                >
                  <p className="font-headline font-semibold text-on-surface">{s.title}</p>
                  <p className="mt-xs text-on-surface-variant">
                    {s.region} · {s.metric}
                  </p>
                  <p className="mt-sm text-on-surface-variant">{s.outcome}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-xl text-[12px] text-on-surface-variant">
          Already a customer?{' '}
          <Link to="/login" className="text-secondary underline">
            Sign in
          </Link>
          {' · '}
          Product deep-dive after login at /product
        </p>
      </div>
    </div>
  )
}

function Offer({
  kicker,
  title,
  body,
}: {
  kicker: string
  title: string
  body: string
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low/90 p-lg">
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {kicker}
      </p>
      <h3 className="mt-sm font-headline text-lg font-semibold">{title}</h3>
      <p className="mt-sm text-[13px] leading-relaxed text-on-surface-variant">
        {body}
      </p>
    </div>
  )
}

export default SalesPage
