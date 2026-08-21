import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfGhostButton } from '@/components/pdf/PdfUi'
import { SqlHighlight } from '@/components/code/SqlHighlight'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'

type Metric = {
  id: string
  name: string
  code: string
  certified: boolean
  pending?: boolean
  description: string
  sql: string
  source: string
  updated: string
  lineage: { label: string; sub: string }[]
}

const METRICS: Metric[] = [
  {
    id: 'mau',
    name: 'Monthly Active Users',
    code: 'MAU',
    certified: true,
    description:
      'Count of distinct users who performed at least one activity within a 30-day rolling window.',
    sql: 'COUNT(DISTINCT user_id)',
    source: 'core_events_master',
    updated: 'Updated 2h ago',
    lineage: [
      { label: 'raw_events', sub: 'Postgres DB' },
      { label: 'stg_events', sub: 'dbt model' },
      { label: 'Monthly Active Users', sub: 'core_events_master' },
    ],
  },
  {
    id: 'arr',
    name: 'Annual Recurring Revenue',
    code: 'ARR',
    certified: true,
    description: 'Sum of normalized subscription revenue over a trailing 12-month period.',
    sql: 'SUM(mrr) * 12',
    source: 'finance_subscriptions',
    updated: 'Updated 4h ago',
    lineage: [
      { label: 'raw_subscriptions', sub: 'Snowflake' },
      { label: 'stg_mrr', sub: 'dbt model' },
      { label: 'Annual Recurring Revenue', sub: 'finance_subscriptions' },
    ],
  },
  {
    id: 'nps',
    name: 'Net Promoter Score',
    code: 'NPS',
    certified: false,
    pending: true,
    description: 'Percentage of promoters minus detractors from quarterly survey cohorts.',
    sql: 'AVG(nps_score)',
    source: 'survey_responses',
    updated: 'Review pending',
    lineage: [
      { label: 'survey_raw', sub: 'Postgres DB' },
      { label: 'stg_nps', sub: 'dbt model' },
      { label: 'Net Promoter Score', sub: 'survey_responses' },
    ],
  },
  {
    id: 'cac',
    name: 'Customer Acquisition Cost',
    code: 'CAC',
    certified: true,
    description: 'Total sales & marketing spend divided by new customers acquired.',
    sql: 'SUM(spend) / COUNT(new_customers)',
    source: 'growth_spend_daily',
    updated: 'Updated 1d ago',
    lineage: [
      { label: 'marketing_spend', sub: 'BigQuery' },
      { label: 'stg_cac', sub: 'dbt model' },
      { label: 'Customer Acquisition Cost', sub: 'growth_spend_daily' },
    ],
  },
]

/** Metrics & Semantic Layer — PDF page-04 layout. */
export function MetricsPage() {
  const [selectedId, setSelectedId] = useState(METRICS[0].id)
  const [query, setQuery] = useState('')
  const [certFilter, setCertFilter] = useState<'all' | 'certified' | 'pending'>('all')

  const selected = METRICS.find((m) => m.id === selectedId) ?? METRICS[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return METRICS.filter((m) => {
      if (certFilter === 'certified' && !m.certified) return false
      if (certFilter === 'pending' && !m.pending) return false
      if (!q) return true
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      )
    })
  }, [query, certFilter])

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Metrics"
          actions={
            <Link
              to="/bi?focus=data"
              className="pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[12px] font-semibold tracking-[0.6px]"
            >
              Create New Metric
            </Link>
          }
        />

        <div className="flex min-h-0 flex-1 gap-[16px] p-[24px]">
          {/* Semantic layer — scrollable grid */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[16px]">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-[12px]">
              <h2 className="text-[20px] font-semibold leading-[28px] text-[#d4dbe3]">
                Semantic Layer
              </h2>
              <div className="flex items-center gap-[8px]">
                <div className="relative w-[256px] max-w-full">
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search metrics..."
                    className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] py-[8px] pl-[33px] pr-[13px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#6b7380]"
                  />
                  <img
                    alt=""
                    className="pointer-events-none absolute left-[10px] top-1/2 size-[11px] -translate-y-1/2 opacity-70"
                    src={FIGMA_NAV.search}
                  />
                </div>
                <PdfGhostButton
                  type="button"
                  onClick={() =>
                    setCertFilter((f) =>
                      f === 'all' ? 'certified' : f === 'certified' ? 'pending' : 'all',
                    )
                  }
                  className="px-[10px] py-[8px] text-[14px] leading-none"
                  title={
                    certFilter === 'all'
                      ? 'All metrics'
                      : certFilter === 'certified'
                        ? 'Certified only'
                        : 'Review pending'
                  }
                >
                  ▾
                </PdfGhostButton>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-[4px]">
              <div className="grid gap-[8px] sm:grid-cols-2">
                {filtered.map((m) => (
                  <MetricCard
                    key={m.id}
                    metric={m}
                    active={m.id === selectedId}
                    onSelect={() => setSelectedId(m.id)}
                  />
                ))}
              </div>
              {!filtered.length ? (
                <p className="py-[32px] text-center text-[13px] text-[#a3afbe]">
                  No metrics match your search.
                </p>
              ) : null}
            </div>
          </div>

          {/* Metric lineage — full-height side panel (PDF page-04) */}
          <aside className="flex w-[280px] shrink-0 flex-col self-stretch overflow-hidden rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] lg:w-[300px]">
            <div className="flex shrink-0 items-center justify-between border-b border-solid border-[#424850] px-[17px] py-[16px]">
              <h2 className="text-[16px] font-semibold text-[#d4dbe3]">Metric Lineage</h2>
              <Link
                to="/lineage"
                className="text-[12px] text-[#a3afbe] hover:text-[#d0d8e0]"
                aria-label="Expand lineage"
              >
                ↗
              </Link>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[8px] px-[17px] py-[24px]">
              {selected.lineage.map((node, i) => {
                const isActive = i === selected.lineage.length - 1
                return (
                  <div key={node.label} className="flex w-full flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedId(selected.id)}
                      className={[
                        'w-full rounded-[4px] border border-solid px-[12px] py-[10px] text-left transition-colors',
                        isActive
                          ? 'border-[#d0d8e0] bg-[#1e2328] shadow-[inset_3px_0_0_0_#d0d8e0]'
                          : 'border-[#424850] bg-[#121619] hover:border-[#6b7380]',
                      ].join(' ')}
                    >
                      <p className="text-[13px] font-medium text-[#d4dbe3]">{node.label}</p>
                      <p className="text-[11px] text-[#c8cdd3]">{node.sub}</p>
                    </button>
                    {i < selected.lineage.length - 1 ? (
                      <span className="my-[6px] text-[#424850]" aria-hidden>
                        ↓
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="shrink-0 border-t border-solid border-[#424850] p-[17px]">
              <Link
                to="/lineage"
                className="pdf-btn-ghost block w-full rounded-[4px] py-[10px] text-center text-[12px] font-semibold"
              >
                View Full Lineage Details
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </QueAppChrome>
  )
}

function MetricCard({
  metric: m,
  active,
  onSelect,
}: {
  metric: Metric
  active: boolean
  onSelect: () => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={[
        'flex cursor-pointer flex-col justify-between rounded-[4px] border border-solid bg-[#0f1215] p-[17px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-colors',
        active
          ? 'border-[#d0d8e0]/50 ring-1 ring-[rgba(208,216,224,0.15)]'
          : 'border-[#424850] hover:border-[#6b7380]',
      ].join(' ')}
    >
      <div>
        <div className="mb-[8px] flex items-start justify-between gap-[8px]">
          <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
            <h3 className="text-[16px] font-semibold leading-[24px] text-[#d4dbe3]">
              {m.name}
            </h3>
            {m.certified ? (
              <span className="inline-flex shrink-0 items-center gap-[4px] rounded-[2px] border border-solid border-[#7aecd0] bg-[rgba(122,236,208,0.18)] px-[7px] py-[3px] text-[10px] font-bold tracking-[1px] text-[#7aecd0]">
                <span aria-hidden className="text-[9px]">
                  ✓
                </span>
                Certified
              </span>
            ) : null}
            {m.pending ? (
              <span className="inline-flex shrink-0 items-center rounded-[2px] border border-solid border-[rgba(255,176,107,0.45)] bg-[rgba(255,176,107,0.12)] px-[7px] py-[3px] text-[10px] font-bold tracking-[1px] text-[#ffb06b]">
                Review pending
              </span>
            ) : null}
          </div>
          <span className="shrink-0 rounded-[2px] bg-[#1e2328] px-[8px] py-[4px] text-[10px] font-bold tracking-[1px] text-[#c8cdd3]">
            {m.code}
          </span>
        </div>
        <p className="mb-[8px] text-[12px] leading-[18px] text-[#c8cdd3]">{m.description}</p>
        <div className="rounded-[2px] border border-solid border-[#424850] bg-[#0d1117] px-[9px] py-[11px]">
          <SqlHighlight code={m.sql} />
        </div>
      </div>
      <div className="mt-[9px] flex items-center justify-between border-t border-solid border-[rgba(66,72,80,0.5)] pt-[9px]">
        <span className="truncate text-[12px] text-[#c8cdd3]">{m.source}</span>
        <span
          className={[
            'shrink-0 text-[12px]',
            m.pending
              ? 'font-semibold text-[#ffb06b]'
              : 'text-[#c8cdd3]',
          ].join(' ')}
        >
          {m.updated}
        </span>
      </div>
    </article>
  )
}

export default MetricsPage
