/**
 * Public sales page — honest positioning for prospects (no auth).
 */
import { Link } from 'react-router-dom'

export function SalesPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 55% at 15% -10%, rgba(123,208,255,0.18) 0%, transparent 55%), radial-gradient(ellipse 70% 45% at 95% 10%, rgba(78,222,163,0.14) 0%, transparent 50%), linear-gradient(180deg, #031427 0%, #0b1c30 100%)',
        }}
      />
      <div className="relative mx-auto max-w-3xl px-md py-xl md:px-lg">
        <p className="font-label text-[12px] tracking-[0.22em] text-on-surface-variant uppercase">
          Que
        </p>
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
            to="/login"
            className="rounded bg-secondary px-lg py-2.5 font-label text-[13px] font-semibold text-on-secondary"
          >
            Start workspace
          </Link>
          <Link
            to="/status"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            System status
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
