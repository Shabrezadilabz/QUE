import { Link } from 'react-router-dom'

export type AutofillPageStatus = 'ready' | 'review' | 'empty' | 'unavailable'

export type AutofillPageInfo = {
  status: AutofillPageStatus
  headline: string
  hints: string[]
  href: string
  cta: string
}

const STATUS_STYLES: Record<AutofillPageStatus, string> = {
  ready: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100',
  review: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
  empty: 'border-[#424850] bg-[#15191e] text-[#9aa3ad]',
  unavailable: 'border-rose-500/30 bg-rose-500/8 text-rose-200',
}

const STATUS_LABEL: Record<AutofillPageStatus, string> = {
  ready: 'Ready',
  review: 'Needs review',
  empty: 'Not set up',
  unavailable: 'Unavailable',
}

/** Reusable autofill strip for nav pages post–Monk Mode. */
export function PageAutofillBanner({
  page,
  compact = false,
}: {
  page: AutofillPageInfo | null | undefined
  compact?: boolean
}) {
  if (!page) return null
  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-[10px] rounded-[12px] border border-solid px-[14px]',
        compact ? 'py-[8px]' : 'py-[12px]',
        STATUS_STYLES[page.status] || STATUS_STYLES.empty,
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-[8px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.7px] opacity-80">
            {STATUS_LABEL[page.status]}
          </span>
          <span className="text-[13px] font-semibold">{page.headline}</span>
        </div>
        {!compact && page.hints?.length ? (
          <p className="mt-[4px] text-[11px] opacity-85">{page.hints.join(' · ')}</p>
        ) : null}
      </div>
      {page.href ? (
        <Link
          to={page.href}
          className="shrink-0 rounded-[8px] border border-solid border-current/30 px-[12px] py-[5px] text-[11px] font-semibold hover:bg-black/10"
        >
          {page.cta}
        </Link>
      ) : null}
    </div>
  )
}

/** Executive health score ring. */
export function HealthScorecard({
  score,
  grade,
  compact = false,
}: {
  score: number
  grade: string
  compact?: boolean
}) {
  const pct = Math.max(0, Math.min(100, score))
  const ringColor =
    pct >= 85 ? '#34d399' : pct >= 70 ? '#38bdf8' : pct >= 50 ? '#fbbf24' : '#f87171'

  return (
    <div
      className={[
        'flex items-center gap-[14px] rounded-[14px] border border-solid border-[#2a3038] bg-[#15191e]',
        compact ? 'px-[12px] py-[10px]' : 'px-[18px] py-[14px]',
      ].join(' ')}
    >
      <div
        className="relative flex size-[52px] shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(${ringColor} ${pct * 3.6}deg, #2a3038 0deg)`,
        }}
      >
        <div className="flex size-[42px] items-center justify-center rounded-full bg-[#111416] text-[14px] font-bold text-[#e8edf2]">
          {pct}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8b949e]">
          Data health
        </p>
        <p className="text-[15px] font-semibold capitalize text-[#e8edf2]">{grade.replace('_', ' ')}</p>
        {!compact ? (
          <p className="text-[11px] text-[#8b949e]">Workspace readiness score</p>
        ) : null}
      </div>
    </div>
  )
}
