/**
 * ROI calculator — time-to-KPI vs hiring DEs (S1.6).
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueLogo } from '@/components/QueLogo'
import { ThemeToggle } from '@/components/ThemeToggle'

function formatInr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function RoiCalculatorPage() {
  const [deCount, setDeCount] = useState(2)
  const [deSalaryLpa, setDeSalaryLpa] = useState(18)
  const [quarterlyHours, setQuarterlyHours] = useState(200)
  const [queMonthlyInr, setQueMonthlyInr] = useState(65000)

  const result = useMemo(() => {
    const deAnnual = deCount * deSalaryLpa * 100_000
    const stewardFraction = 0.35
    const stewardCostAnnual = deAnnual * stewardFraction
    const hourlyRate = deAnnual / (deCount * 1800)
    const glueWorkAnnual = quarterlyHours * 4 * hourlyRate
    const statusQuoAnnual = stewardCostAnnual + glueWorkAnnual
    const queAnnual = queMonthlyInr * 12
    const savings = statusQuoAnnual - queAnnual
    const monthsToKpi = 0.17
    const hireMonthsToKpi = 3
    return {
      statusQuoAnnual,
      queAnnual,
      savings,
      monthsToKpi,
      hireMonthsToKpi,
    }
  }, [deCount, deSalaryLpa, quarterlyHours, queMonthlyInr])

  return (
    <div className="que-auth-bg relative min-h-screen overflow-hidden">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle compact />
      </div>
      <div className="relative mx-auto max-w-2xl px-md py-xl md:px-lg">
        <QueLogo
          size={40}
          withWordmark
          wordmarkClassName="font-label text-[12px] tracking-[0.22em] text-on-surface-variant uppercase"
        />
        <h1 className="mt-md font-headline text-4xl font-semibold tracking-tight text-on-surface">
          ROI calculator
        </h1>
        <p className="mt-md font-body text-[15px] text-on-surface-variant">
          Compare Que Growth vs hiring data engineers for join hunting, mart SQL, and board prep.
          Adjust inputs for your team.
        </p>

        <div className="mt-xl space-y-md rounded-xl border border-outline-variant bg-surface-container-low/90 p-lg">
          <label className="block">
            <span className="font-label text-[12px] text-on-surface-variant">
              Data engineers (FTE)
            </span>
            <input
              type="range"
              min={0}
              max={5}
              value={deCount}
              onChange={(e) => setDeCount(Number(e.target.value))}
              className="mt-xs w-full"
            />
            <span className="text-[14px] font-semibold text-on-surface">{deCount}</span>
          </label>

          <label className="block">
            <span className="font-label text-[12px] text-on-surface-variant">
              Avg DE cost (₹ LPA each)
            </span>
            <input
              type="range"
              min={8}
              max={40}
              value={deSalaryLpa}
              onChange={(e) => setDeSalaryLpa(Number(e.target.value))}
              className="mt-xs w-full"
            />
            <span className="text-[14px] font-semibold text-on-surface">{deSalaryLpa} LPA</span>
          </label>

          <label className="block">
            <span className="font-label text-[12px] text-on-surface-variant">
              Steward glue-work hours / quarter (joins, marts, BI setup)
            </span>
            <input
              type="range"
              min={40}
              max={400}
              step={20}
              value={quarterlyHours}
              onChange={(e) => setQuarterlyHours(Number(e.target.value))}
              className="mt-xs w-full"
            />
            <span className="text-[14px] font-semibold text-on-surface">
              {quarterlyHours} hrs/qtr
            </span>
          </label>

          <label className="block">
            <span className="font-label text-[12px] text-on-surface-variant">
              Que Growth (₹/mo)
            </span>
            <input
              type="range"
              min={50000}
              max={80000}
              step={5000}
              value={queMonthlyInr}
              onChange={(e) => setQueMonthlyInr(Number(e.target.value))}
              className="mt-xs w-full"
            />
            <span className="text-[14px] font-semibold text-on-surface">
              {formatInr(queMonthlyInr)}/mo
            </span>
          </label>
        </div>

        <div className="mt-lg rounded-xl border border-primary/30 bg-primary-container/20 p-lg">
          <h2 className="font-headline text-lg font-semibold text-on-surface">Estimate</h2>
          <dl className="mt-md space-y-sm text-[14px]">
            <div className="flex justify-between gap-md">
              <dt className="text-on-surface-variant">Status quo (annual)</dt>
              <dd className="font-semibold text-on-surface">
                {formatInr(result.statusQuoAnnual)}
              </dd>
            </div>
            <div className="flex justify-between gap-md">
              <dt className="text-on-surface-variant">Que Growth (annual)</dt>
              <dd className="font-semibold text-on-surface">{formatInr(result.queAnnual)}</dd>
            </div>
            <div className="flex justify-between gap-md border-t border-outline-variant pt-sm">
              <dt className="text-on-surface">Estimated savings</dt>
              <dd
                className={`font-semibold ${
                  result.savings >= 0 ? 'text-primary' : 'text-error'
                }`}
              >
                {formatInr(result.savings)}/yr
              </dd>
            </div>
          </dl>
          <p className="mt-md text-[13px] text-on-surface-variant">
            Time to first <strong className="text-on-surface">certified KPI</strong>: Que target
            ~{Math.round(result.monthsToKpi * 30)} days vs ~{result.hireMonthsToKpi} months to
            hire + onboard DEs (typical mid-market).
          </p>
        </div>

        <div className="mt-lg flex flex-wrap gap-sm">
          <Link
            to="/login?sandbox=1"
            className="rounded bg-primary px-lg py-2.5 font-label text-[13px] font-semibold text-on-primary"
          >
            Try sandbox
          </Link>
          <Link
            to="/pricing"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  )
}

export default RoiCalculatorPage
