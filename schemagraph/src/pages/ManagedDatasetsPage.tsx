import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import {
  certifyManagedDatasetApi,
  fetchManagedDatasets,
  type ManagedDataset,
} from '@/services/stitchApi'

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const HEADERS = [
  'DATASET NAME',
  'SOURCE',
  'ROW COUNT',
  'CERTIFICATION',
  'LAST UPDATED',
  'ACTIONS',
] as const

/** Managed Data Plane — certified datasets list (Offer B). */
export function ManagedDatasetsPage() {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ManagedDataset[]>([])
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [certifying, setCertifying] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchManagedDatasets()
      setEnabled(res.enabled)
      setRows(res.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = rows.filter(
    (r) =>
      !search.trim() ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.slug.toLowerCase().includes(search.toLowerCase()),
  )

  async function onCertify(id: string) {
    setCertifying(id)
    try {
      await certifyManagedDatasetApi(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Certify failed')
    } finally {
      setCertifying(null)
    }
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[var(--pdf-bg-canvas)]">
        <header className="shrink-0 border-b border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[24px] pb-[33px] pt-[32px]">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between">
            <div className="flex flex-col gap-[4px]">
              <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[var(--pdf-text-primary)]">
                Managed Data Plane
              </h1>
              <p className="text-[12px] leading-[18px] text-[var(--pdf-text-secondary)]">
                Hosted and certified datasets ready for consumption.
                {!enabled ? ' Enable Offer B in Settings → AI & Policy.' : null}
              </p>
            </div>
            <div className="flex items-center gap-[16px]">
              <div className="relative w-[256px]">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search datasets..."
                  className="w-full rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-input)] py-[10px] pl-[37px] pr-[13px] text-[12px] text-[var(--pdf-text-primary)] outline-none placeholder:text-[var(--pdf-text-muted)]"
                />
                <img
                  alt=""
                  className="pointer-events-none absolute left-[12px] top-1/2 size-[13.5px] -translate-y-1/2"
                  src={FIGMA_NAV.search}
                />
              </div>
              <a
                href="/plane"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-[8px] rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-muted)] px-[16px] py-[8px] text-[12px] font-semibold tracking-[0.6px] text-[var(--pdf-text-primary)]"
              >
                SQL Workspace
              </a>
              <Link
                to="/jobs"
                className="flex items-center gap-[8px] rounded-[4px] bg-[var(--pdf-btn-primary-bg)] px-[16px] py-[8px] text-[12px] font-semibold tracking-[0.6px] text-[var(--pdf-btn-primary-text)]"
              >
                Land from Jobs
              </Link>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-[24px]">
          {error ? (
            <p className="mb-[12px] text-[12px] text-[var(--pdf-danger)]">{error}</p>
          ) : null}
          <div className="overflow-hidden rounded-[8px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] shadow-[var(--pdf-panel-shadow)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-solid border-[var(--pdf-border)] bg-[var(--pdf-table-head-bg)]">
                    {HEADERS.map((h, i) => (
                      <th
                        key={h}
                        className={[
                          'px-[16px] py-[12px] text-[10px] font-semibold tracking-[0.5px] text-[var(--pdf-text-muted)] uppercase',
                          i === 2 ? 'text-right' : '',
                          i === 3 ? 'text-center' : '',
                          i === 5 ? 'text-right' : '',
                        ].join(' ')}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-[16px] py-[24px] text-[13px] text-[var(--pdf-text-muted)]">
                        Loading datasets…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-[16px] py-[24px] text-[13px] text-[var(--pdf-text-muted)]">
                        No managed datasets yet. Run a job and land results, or open the{' '}
                        <a href="/plane" target="_blank" rel="noopener noreferrer" className="underline">
                          SQL workspace
                        </a>
                        .
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-solid border-[var(--pdf-border)]"
                      >
                        <td className="px-[16px] py-[18px]">
                          <div className="flex items-center gap-[12px]">
                            <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[2px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-muted)] p-px">
                              <span className="text-[10px] text-[var(--pdf-text-muted)]">▦</span>
                            </div>
                            <div className="flex flex-col gap-[2px]">
                              <p className="text-[14px] font-medium leading-[20px] text-[var(--pdf-text-primary)]">
                                {row.name}
                              </p>
                              <p className="font-mono text-[13px] leading-[18px] text-[var(--pdf-text-muted)]">
                                {row.slug}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-[16px] py-[18px]">
                          <span className="inline-flex items-center gap-[6px] rounded-[12px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-muted)] px-[9px] py-[5px] text-[12px] text-[var(--pdf-text-primary)]">
                            {row.jobId ? 'Job output' : 'Managed'}
                          </span>
                        </td>
                        <td className="px-[16px] py-[18px] text-right font-mono text-[13px] text-[var(--pdf-text-muted)]">
                          {formatRowCount(row.rowCount)}
                        </td>
                        <td className="px-[16px] py-[18px] text-center">
                          {row.certified ? (
                            <span className="inline-flex size-[24px] items-center justify-center rounded-full border border-solid border-[var(--pdf-accent-border)] bg-[var(--pdf-accent-surface)] text-[12px] text-[var(--pdf-accent)]">
                              ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={certifying === row.id}
                              onClick={() => void onCertify(row.id)}
                              className="text-[11px] text-[var(--pdf-accent)] hover:underline disabled:opacity-50"
                            >
                              {certifying === row.id ? '…' : 'Certify'}
                            </button>
                          )}
                        </td>
                        <td className="px-[16px] py-[18px] text-[12px] text-[var(--pdf-text-muted)]">
                          {relativeTime(row.updatedAt)}
                        </td>
                        <td className="px-[16px] py-[18px] text-right">
                          <a
                            href={`/plane?dataset=${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[12px] text-[var(--pdf-text-muted)] hover:text-[var(--pdf-text-primary)]"
                          >
                            Open in SQL
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-muted)] px-[16px] py-[12px] text-[12px] text-[var(--pdf-text-faint)]">
              <span>
                Showing {filtered.length} of {rows.length} datasets
              </span>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-panel)] px-[10px] py-[4px] text-[12px] text-[var(--pdf-text-primary)]"
              >
                Refresh
              </button>
            </footer>
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}

export default ManagedDatasetsPage
