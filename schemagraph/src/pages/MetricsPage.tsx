import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfGhostButton } from '@/components/pdf/PdfUi'
import { SqlHighlight } from '@/components/code/SqlHighlight'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import { fetchMetricsDefs } from '@/services/stitchApi'

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

function metricCode(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((p) => p[0])
      .join('')
      .toUpperCase()
  }
  return name.slice(0, 4).toUpperCase()
}

function formatUpdated(iso?: string) {
  if (!iso) return 'Recently added'
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `Updated ${mins}m ago`
  if (mins < 1440) return `Updated ${Math.round(mins / 60)}h ago`
  return `Updated ${d.toLocaleDateString()}`
}

/** Metrics & Semantic Layer — live KPI registry from Monk Mode + manual defs. */
export function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [certFilter, setCertFilter] = useState<'all' | 'certified' | 'pending'>('all')

  useEffect(() => {
    void fetchMetricsDefs()
      .then((items) => {
        const mapped: Metric[] = items.map((m) => {
          const tables = (m.lineage?.tables as string[] | undefined) || []
          const source =
            tables[0] ||
            (Array.isArray(m.tags) && m.tags.includes('monk-mode')
              ? 'Monk Mode · Ecommerce'
              : 'Semantic layer')
          return {
            id: m.id,
            name: m.name,
            code: metricCode(m.name),
            certified: m.certified,
            pending: !m.certified,
            description: m.description || '',
            sql: m.expressionSql || '-- no SQL',
            source,
            updated: formatUpdated(m.updatedAt),
            lineage: tables.length
              ? tables.map((t, i) => ({
                  label: t,
                  sub: i === tables.length - 1 ? m.name : 'source table',
                }))
              : [{ label: m.name, sub: source }],
          }
        })
        setMetrics(mapped)
        if (mapped[0]) setSelectedId(mapped[0].id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const selected =
    metrics.find((m) => m.id === selectedId) ?? metrics[0] ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return metrics.filter((m) => {
      if (certFilter === 'certified' && !m.certified) return false
      if (certFilter === 'pending' && !m.pending) return false
      if (!q) return true
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      )
    })
  }, [query, certFilter, metrics])

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Metrics"
          actions={
            <div className="flex gap-[8px]">
              <Link
                to="/monk"
                className="rounded-[4px] border border-solid border-[#424850] px-[14px] py-[8px] text-[12px] font-semibold text-[#c8cdd3] hover:bg-[#15191e]"
              >
                Monk Mode KPIs
              </Link>
              <Link
                to="/bi?focus=data"
                className="pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[12px] font-semibold tracking-[0.6px]"
              >
                Create New Metric
              </Link>
            </div>
          }
        />

        <div className="flex min-h-0 flex-1 gap-[16px] p-[24px]">
          {error ? (
            <p className="text-[13px] text-rose-300">{error}</p>
          ) : loading ? (
            <p className="text-[13px] text-[#a3afbe]">Loading metrics…</p>
          ) : !metrics.length ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-[12px] rounded-[8px] border border-dashed border-[#424850] p-[32px] text-center">
              <p className="text-[15px] font-semibold text-[#d4dbe3]">No KPIs yet</p>
              <p className="max-w-[360px] text-[13px] text-[#a3afbe]">
                Run Monk Mode on your Ecommerce workspace to seed revenue, order count, and AOV
                metrics automatically.
              </p>
              <Link
                to="/monk"
                className="pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[12px] font-semibold"
              >
                Start Monk Mode →
              </Link>
            </div>
          ) : (
          <>
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
              {selected
                ? selected.lineage.map((node, i) => {
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
                  })
                : null}
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
          </>
          )}
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
        'pdf-panel flex cursor-pointer flex-col justify-between rounded-[4px] p-[17px] transition-colors',
        active
          ? 'border-[var(--pdf-accent-border)] ring-1 ring-[var(--pdf-accent-surface)]'
          : 'hover:border-[var(--pdf-btn-ghost-hover-border)]',
      ].join(' ')}
    >
      <div>
        <div className="mb-[8px] flex items-start justify-between gap-[8px]">
          <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
            <h3 className="text-[16px] font-semibold leading-[24px] text-[var(--pdf-text-primary)]">
              {m.name}
            </h3>
            {m.certified ? (
              <span className="pdf-badge-success shrink-0 px-[7px] py-[3px] text-[10px] tracking-[1px]">
                <span aria-hidden className="text-[9px]">
                  ✓
                </span>
                Certified
              </span>
            ) : null}
            {m.pending ? (
              <span className="pdf-badge-warn shrink-0 px-[7px] py-[3px] text-[10px] tracking-[1px]">
                Review pending
              </span>
            ) : null}
          </div>
          <span className="shrink-0 rounded-[2px] bg-[var(--pdf-bg-muted)] px-[8px] py-[4px] text-[10px] font-bold tracking-[1px] text-[var(--pdf-text-secondary)]">
            {m.code}
          </span>
        </div>
        <p className="mb-[8px] text-[12px] leading-[18px] text-[var(--pdf-text-secondary)]">{m.description}</p>
        <div className="pdf-code-block">
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
