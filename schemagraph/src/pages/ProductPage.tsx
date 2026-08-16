import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { QueLogo } from '@/components/QueLogo'

/**
 * Design / sales foundation — honest Que positioning for client conversations.
 * Not a marketing microsite redesign; product-truth page inside the app.
 */
export function ProductPage() {
  return (
    <QueAppChrome eyebrow="PRODUCT · FOR CLIENTS">
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 20% 0%, rgba(123,208,255,0.16) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 90% 20%, rgba(78,222,163,0.12) 0%, transparent 50%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl px-md py-xl md:px-lg">
          <QueLogo
            size={36}
            withWordmark
            wordmarkClassName="font-label text-[11px] tracking-[0.2em] text-on-surface-variant uppercase"
          />
          <h1 className="mt-sm font-headline text-3xl font-semibold tracking-tight text-on-surface md:text-4xl">
            Cursor for data teams — schema-first, human-approved.
          </h1>
          <p className="mt-md max-w-2xl font-body text-[15px] leading-relaxed text-on-surface-variant">
            Connect sources, propose joins, clean and validate, schedule jobs,
            and ship attested contracts into the customer system of record. AI
            never reads the full lake — only metadata and pinned scrubbed
            samples (5–10 rows).
          </p>

          <div className="mt-xl grid gap-lg sm:grid-cols-2">
            <Offer
              title="Offer A — Bring your warehouse"
              body="Databricks, Snowflake, Postgres, and more stay your SoR. Que exports / triggers runs and sees status via the job bridge."
            />
            <Offer
              title="Offer B — Que managed plane"
              body="For Excel/SQL teams without a warehouse: Que hosts job outputs with quotas and retention. AI is denied managed row payloads."
            />
          </div>

          <section className="mt-xl">
            <h2 className="font-headline text-lg font-semibold text-on-surface">
              How clients work day one
            </h2>
            <ol className="mt-md space-y-sm font-body text-[14px] text-on-surface-variant">
              <li>1. Connect sources and sync (pins freeze scrubbed samples).</li>
              <li>2. Review joins — edit columns, Promote with evidence (not 100%).</li>
              <li>3. Draft / validate jobs; land to warehouse or managed plane.</li>
              <li>4. Certify datasets → BI charts → embed for stakeholders.</li>
              <li>5. Drift, steward, and compliance evidence stay in Que.</li>
            </ol>
          </section>

          <section className="mt-xl rounded-xl border border-outline-variant/30 bg-surface-container-low/80 p-lg backdrop-blur">
            <h2 className="font-headline text-lg font-semibold">What we do not claim</h2>
            <ul className="mt-md space-y-sm text-[13px] text-on-surface-variant">
              <li>• AI replaces your DE team or is always 100% correct</li>
              <li>• Que as the default warehouse for every enterprise</li>
              <li>• SOC 2 Type II certified (we ship an evidence pack for auditors)</li>
            </ul>
          </section>

          <div className="mt-xl flex flex-wrap gap-sm">
            <Link
              to="/sources"
              className="rounded bg-secondary px-lg py-2 font-label text-[12px] font-semibold text-on-secondary"
            >
              Connect a source
            </Link>
            <Link
              to="/joins"
              className="rounded-lg border border-secondary px-lg py-2 font-label text-[12px] font-semibold text-secondary"
            >
              Review joins
            </Link>
            <Link
              to="/proposals"
              className="rounded-lg border border-outline-variant px-lg py-2 font-label text-[12px]"
            >
              Review
            </Link>
            <Link
              to="/compliance"
              className="rounded-lg border border-outline-variant px-lg py-2 font-label text-[12px]"
            >
              Compliance evidence
            </Link>
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}

function Offer({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low/90 p-lg">
      <h3 className="font-headline text-base font-semibold text-on-surface">
        {title}
      </h3>
      <p className="mt-sm font-body text-[13px] leading-relaxed text-on-surface-variant">
        {body}
      </p>
    </div>
  )
}

export default ProductPage
