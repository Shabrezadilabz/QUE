import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import {
  PdfGhostButton,
  PdfPageHeader,
  PdfPrimaryButton,
} from '@/components/pdf/PdfUi'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createCatalogAssetApi,
  fetchCatalogIndex,
  type CatalogIndexEntry,
  type CatalogIndexStats,
} from '@/services/stitchApi'

const KIND_TABS = [
  { id: 'all', label: 'All' },
  { id: 'table', label: 'Tables' },
  { id: 'metric', label: 'Metrics' },
  { id: 'dashboard', label: 'Dashboards' },
  { id: 'pipeline', label: 'Pipelines' },
  { id: 'model', label: 'Models' },
  { id: 'dataset', label: 'Datasets' },
  { id: 'term', label: 'Terms' },
] as const

const KIND_LABEL: Record<string, string> = {
  table: 'Table',
  metric: 'Metric',
  dashboard: 'Dashboard',
  pipeline: 'Pipeline',
  model: 'Model',
  dataset: 'Dataset',
  term: 'Term',
  catalog_asset: 'Asset',
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-[#333] bg-[#1a1d1f] px-[14px] py-[10px]">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#888]">
        {label}
      </div>
      <div className="mt-[4px] text-[20px] font-semibold text-[#e8e8e8]">
        {value.toLocaleString()}
      </div>
    </div>
  )
}

/** Que Catalog — unified browse for workspace assets, glossary, and policies. */
export function CatalogPage() {
  const { canWrite } = useWorkspaceRole()
  const { page: autofillPage } = usePageAutofill('catalog')
  const [tab, setTab] = useState<(typeof KIND_TABS)[number]['id']>('all')
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<CatalogIndexEntry[]>([])
  const [stats, setStats] = useState<CatalogIndexStats | null>(null)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [manualName, setManualName] = useState('')
  const [manualKind, setManualKind] = useState('dashboard')

  const reload = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await fetchCatalogIndex({
        kind: tab === 'all' ? undefined : tab,
        q: query.trim() || undefined,
        limit: 200,
      })
      setEntries(result.entries)
      setTotal(result.total)
      setStats(result.stats)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [tab, query])

  useEffect(() => {
    const t = setTimeout(() => {
      void reload()
    }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [reload, query])

  const tabCounts = useMemo(() => stats?.byKind ?? {}, [stats])

  const onRegisterManual = async () => {
    if (!canWrite || !manualName.trim()) return
    setBusy(true)
    try {
      await createCatalogAssetApi({
        name: manualName.trim(),
        kind: manualKind,
      })
      setManualName('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title={
            <span className="inline-flex items-center gap-[10px]">
              Que Catalog
              <span className="rounded border border-[#7aecd0]/30 bg-[#7aecd0]/10 px-[8px] py-[2px] font-mono text-[10px] uppercase tracking-wider text-[#7aecd0]">
                Unified index
              </span>
            </span>
          }
          subtitle="Tables, metrics, dashboards, pipelines, models, and glossary — one searchable registry."
          actions={
            <div className="flex flex-wrap items-center gap-[8px]">
              <Link to="/glossary">
                <PdfGhostButton type="button">Glossary</PdfGhostButton>
              </Link>
              <Link to="/lineage">
                <PdfGhostButton type="button">Lineage</PdfGhostButton>
              </Link>
              <PdfPrimaryButton type="button" disabled={busy} onClick={() => void reload()}>
                Refresh
              </PdfPrimaryButton>
            </div>
          }
        />

        {autofillPage ? (
          <div className="shrink-0 px-[16px] pt-[8px]">
            <PageAutofillBanner page={autofillPage} compact />
          </div>
        ) : null}

        {stats && (
          <div className="grid grid-cols-2 gap-[12px] border-b border-[#2a2f33] px-[24px] py-[16px] md:grid-cols-4">
            <StatCard label="Total assets" value={stats.total} />
            <StatCard label="Certified" value={stats.certified} />
            <StatCard label="Tables" value={tabCounts.table ?? 0} />
            <StatCard label="Showing" value={total} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-[8px] border-b border-[#2a2f33] px-[16px] py-[10px]">
          {KIND_TABS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`rounded px-[10px] py-[5px] font-mono text-[11px] uppercase tracking-wide ${
                tab === k.id
                  ? 'bg-[#c3f400]/15 text-[#c3f400]'
                  : 'text-[#888] hover:bg-[#1a1d1f]'
              }`}
              onClick={() => setTab(k.id)}
            >
              {k.label}
              {k.id !== 'all' && tabCounts[k.id] != null ? (
                <span className="ml-[4px] text-[#666]">({tabCounts[k.id]})</span>
              ) : null}
            </button>
          ))}
          <input
            className="ml-auto min-w-[180px] flex-1 rounded border border-[#333] bg-[#1a1d1f] px-[10px] py-[6px] text-[13px] text-[#e8e8e8] outline-none focus:border-[#c3f400] md:max-w-[320px]"
            placeholder="Search catalog…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && (
          <div className="border-b border-red-900/50 bg-red-950/30 px-[16px] py-[8px] text-[13px] text-red-300">
            {error}
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[16px]">
          <div className="mb-[16px] rounded border border-[#333] bg-[#0d0f10] p-[14px]">
            <div className="mb-[8px] font-mono text-[10px] uppercase tracking-wider text-[#888]">
              Register manual asset
            </div>
            <div className="flex flex-wrap gap-[8px]">
              <input
                className="min-w-[160px] flex-1 rounded border border-[#333] bg-[#1a1d1f] px-[10px] py-[6px] text-[13px]"
                placeholder="Asset name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                disabled={!canWrite || busy}
              />
              <select
                className="rounded border border-[#333] bg-[#1a1d1f] px-[10px] py-[6px] text-[12px]"
                value={manualKind}
                onChange={(e) => setManualKind(e.target.value)}
                disabled={!canWrite || busy}
              >
                <option value="dashboard">dashboard</option>
                <option value="metric">metric</option>
                <option value="pipeline">pipeline</option>
                <option value="ml_feature">ml_feature</option>
              </select>
              <PdfGhostButton
                type="button"
                disabled={!canWrite || busy || !manualName.trim()}
                onClick={() => void onRegisterManual()}
              >
                Register
              </PdfGhostButton>
            </div>
          </div>

          <ul className="flex flex-col gap-[10px]">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded border border-[#2a2f33] bg-[#1a1d1f] px-[16px] py-[12px]"
              >
                <div className="flex flex-wrap items-start justify-between gap-[8px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#7aecd0]">
                        {KIND_LABEL[e.kind] || e.kind}
                      </span>
                      {e.certified && (
                        <span className="rounded bg-[#7aecd0]/15 px-[6px] py-[1px] text-[10px] text-[#7aecd0]">
                          certified
                        </span>
                      )}
                      <span className="text-[10px] text-[#666]">{e.status}</span>
                    </div>
                    <Link
                      to={e.route}
                      className="mt-[4px] block truncate text-[15px] font-medium text-[#e8e8e8] hover:text-[#c3f400]"
                    >
                      {e.name}
                    </Link>
                    {e.description ? (
                      <p className="mt-[4px] line-clamp-2 text-[12px] text-[#888]">
                        {e.description}
                      </p>
                    ) : null}
                    <div className="mt-[6px] flex flex-wrap gap-[8px] text-[11px] text-[#666]">
                      {e.connection ? <span>{e.connection}</span> : null}
                      {e.owner ? <span>owner: {e.owner}</span> : null}
                      {e.tags?.slice(0, 4).map((t) => (
                        <span key={t} className="rounded bg-[#111] px-[5px] py-[1px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link to={e.route} className="shrink-0 text-[11px] text-[#7aecd0] hover:underline">
                    Open →
                  </Link>
                </div>
              </li>
            ))}
            {!entries.length && !busy && (
              <li className="py-[32px] text-center text-[13px] text-[#666]">
                No catalog entries match your filters.
              </li>
            )}
          </ul>
        </main>
      </div>
    </QueAppChrome>
  )
}
