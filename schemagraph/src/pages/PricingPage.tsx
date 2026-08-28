/**
 * Public pricing — India GTM (S1.2).
 */
import { Link } from 'react-router-dom'
import { QueLogo } from '@/components/QueLogo'
import { ThemeToggle } from '@/components/ThemeToggle'

const PLANS = [
  {
    id: 'growth',
    name: 'Growth',
    priceInr: '₹50,000',
    priceInrHigh: '₹80,000',
    priceUsd: '$999',
    period: '/mo',
    blurb: '1–2 stewards, post-ingest cert loop, 1 industry pack.',
    features: [
      'Schema graph + join inference',
      'Monk Mode + HITL promote',
      'Certified KPI + golden eval',
      'CEO chat (cert marts only)',
      'Report Studio + BI export',
      'dbt bundle export',
    ],
    cta: 'Start sandbox',
    ctaTo: '/login?sandbox=1',
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceInr: '₹2,00,000',
    priceInrHigh: null,
    priceUsd: '$2,500',
    period: '/mo',
    blurb: 'SSO/SCIM, private runner, compliance evidence pack.',
    features: [
      'Everything in Growth',
      'OIDC SSO + SCIM provisioning',
      'Private runner (VPC)',
      'SIEM / audit export',
      'SOC 2 evidence scaffolding',
      'Dedicated onboarding',
    ],
    cta: 'Contact sales',
    ctaTo: '/sales',
    highlighted: false,
  },
  {
    id: 'pack',
    name: 'Industry pack',
    priceInr: '₹20,000',
    priceInrHigh: null,
    priceUsd: '$250',
    period: '/pack/mo',
    blurb: 'Vertical Monk templates — finance, healthcare, e-commerce.',
    features: [
      'Pre-built KPI ontology',
      'Golden eval pairs',
      'Pack Studio customize',
      'Dashboard scaffolds',
    ],
    cta: 'Try in sandbox',
    ctaTo: '/login?sandbox=1',
    highlighted: false,
  },
] as const

export function PricingPage() {
  return (
    <div className="que-auth-bg relative min-h-screen overflow-hidden">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle compact />
      </div>
      <div className="relative mx-auto max-w-5xl px-md py-xl md:px-lg">
        <QueLogo
          size={40}
          withWordmark
          wordmarkClassName="font-label text-[12px] tracking-[0.22em] text-on-surface-variant uppercase"
        />
        <h1 className="mt-md font-headline text-4xl font-semibold tracking-tight text-on-surface md:text-5xl">
          Pricing
        </h1>
        <p className="mt-md max-w-2xl font-body text-[16px] leading-relaxed text-on-surface-variant">
          Land with <strong className="font-semibold text-on-surface">Growth</strong> in India
          (₹50k–80k/mo). Stack on Hevo or Fivetran — Que certifies upstream, not replaces
          ingest. Annual USD list for global accounts.
        </p>

        <div className="mt-lg flex flex-wrap gap-sm">
          <Link
            to="/roi"
            className="rounded-lg border border-outline-variant px-md py-2 font-label text-[13px] font-semibold text-on-surface"
          >
            ROI calculator
          </Link>
          <Link
            to="/login?sandbox=1"
            className="rounded bg-primary px-md py-2 font-label text-[13px] font-semibold text-on-primary"
          >
            Free sandbox
          </Link>
          <Link
            to="/eval/public"
            className="rounded-lg border border-outline-variant px-md py-2 font-label text-[13px] font-semibold text-on-surface"
          >
            Public eval scorecard
          </Link>
        </div>

        <p className="mt-md text-[13px] text-on-surface-variant">
          Global accounts: USD list shown per plan. India land motion uses INR bands above.
          See also <Link to="/sales" className="text-secondary underline">US/EU case studies</Link>.
        </p>

        <div className="mt-xl grid gap-lg lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-lg ${
                plan.highlighted
                  ? 'border-primary bg-surface-container-high/80 shadow-lg'
                  : 'border-outline-variant bg-surface-container-low/90'
              }`}
            >
              <h2 className="font-headline text-xl font-semibold text-on-surface">
                {plan.name}
              </h2>
              <p className="mt-sm text-[13px] text-on-surface-variant">{plan.blurb}</p>
              <div className="mt-md">
                <p className="font-headline text-2xl font-semibold text-on-surface">
                  {plan.priceInrHigh
                    ? `${plan.priceInr}–${plan.priceInrHigh}`
                    : `${plan.priceInr}+`}
                  <span className="text-base font-normal text-on-surface-variant">
                    {plan.period}
                  </span>
                </p>
                <p className="mt-xs text-[12px] text-on-surface-variant">
                  USD list {plan.priceUsd}
                  {plan.period} (annual)
                </p>
              </div>
              <ul className="mt-md space-y-xs text-[13px] text-on-surface-variant">
                {plan.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <Link
                to={plan.ctaTo}
                className={`mt-lg inline-block w-full rounded py-2.5 text-center font-label text-[13px] font-semibold ${
                  plan.highlighted
                    ? 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
                    : 'border border-outline-variant text-on-surface'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-xl text-[12px] leading-relaxed text-on-surface-variant">
          In-app seat billing (Stripe) is separate from public list pricing — workspace admins
          manage seats under Settings → Billing. SOC 2 Type II: evidence scaffolding in product;
          auditor attestation is a diligence milestone, not a toggle.{' '}
          <Link to="/sales" className="text-secondary underline">
            Talk to us
          </Link>
          {' · '}
          <Link to="/" className="text-secondary underline">
            Home
          </Link>
        </p>
      </div>
    </div>
  )
}

export default PricingPage
