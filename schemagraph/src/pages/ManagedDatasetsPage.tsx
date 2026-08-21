import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'

type DatasetRow = {
  id: string
  name: string
  path: string
  source: string
  rows: string
  certified: boolean
  drift?: boolean
  updated: string
}

const DEMO_ROWS: DatasetRow[] = [
  {
    id: '1',
    name: 'core_customer_dimensions',
    path: 'prod.analytics.dim_customers',
    source: 'Snowflake',
    rows: '42.5M',
    certified: true,
    updated: '12 mins ago',
  },
  {
    id: '2',
    name: 'events_stream_raw',
    path: 'kafka.topics.events_raw',
    source: 'Kafka',
    rows: '> 1B',
    certified: false,
    updated: 'Live',
  },
  {
    id: '3',
    name: 'financial_ledger_q3',
    path: 'prod.finance.fct_ledger_q3',
    source: 'Snowflake',
    rows: '12.1M',
    certified: true,
    updated: '2 hours ago',
  },
  {
    id: '4',
    name: 'ml_training_set_v4 (Drift Detected)',
    path: 's3://data-lake/ml/train_v4',
    source: 'S3 Bucket',
    rows: '2.1M',
    certified: false,
    drift: true,
    updated: '3 days ago',
  },
]

const HEADERS = [
  'DATASET NAME',
  'SOURCE',
  'ROW COUNT',
  'CERTIFICATION',
  'LAST UPDATED',
  'ACTIONS',
] as const

/** Managed Data Plane — pixel-faithful Figma v1 slate frame (1:64). */
export function ManagedDatasetsPage() {
  const [search, setSearch] = useState('')
  const rows = DEMO_ROWS.filter(
    (r) =>
      !search.trim() ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.path.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        {/* Page Header — Figma 1:66 */}
        <header className="shrink-0 border-b border-solid border-[#424850] bg-[#0f1215] px-[24px] pb-[33px] pt-[32px]">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between">
            <div className="flex flex-col gap-[4px]">
              <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[#d4dbe3]">
                Managed Data Plane
              </h1>
              <p className="text-[12px] leading-[18px] text-[#c8cdd3]">
                Hosted and certified datasets ready for consumption.
              </p>
            </div>
            <div className="flex items-center gap-[16px]">
              <div className="relative w-[256px]">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search datasets..."
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] py-[10px] pl-[37px] pr-[13px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#c8cdd3]"
                />
                <img
                  alt=""
                  className="pointer-events-none absolute left-[12px] top-1/2 size-[13.5px] -translate-y-1/2"
                  src={FIGMA_NAV.search}
                />
              </div>
              <Link
                to="/jobs"
                className="flex items-center gap-[8px] rounded-[4px] bg-[#d0d8e0] px-[16px] py-[8px] text-[12px] font-semibold tracking-[0.6px] text-[#323840]"
              >
                Certify Dataset
              </Link>
            </div>
          </div>
        </header>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-y-auto p-[24px]">
          <div className="overflow-hidden rounded-[8px] border border-solid border-[#424850] bg-[#0f1215] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-solid border-[#424850] bg-[#1e2328]">
                    {HEADERS.map((h, i) => (
                      <th
                        key={h}
                        className={[
                          'px-[16px] py-[12px] text-[10px] font-semibold tracking-[0.5px] text-[#c8cdd3] uppercase',
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
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-solid border-[#424850]"
                    >
                      <td className="px-[16px] py-[18px]">
                        <div className="flex items-center gap-[12px]">
                          <div
                            className={[
                              'flex size-[32px] shrink-0 items-center justify-center rounded-[2px] border border-solid p-px',
                              row.drift
                                ? 'border-[rgba(240,160,32,0.3)] bg-[rgba(240,160,32,0.1)]'
                                : 'border-[rgba(208,216,224,0.3)] bg-[rgba(170,181,192,0.2)]',
                            ].join(' ')}
                          >
                            <span className="text-[10px] text-[#c8cdd3]">▦</span>
                          </div>
                          <div className="flex flex-col gap-[2px]">
                            <p
                              className={[
                                'text-[14px] font-medium leading-[20px]',
                                row.drift ? 'text-[#f0a020]' : 'text-[#d4dbe3]',
                              ].join(' ')}
                            >
                              {row.name}
                            </p>
                            <p className="font-mono text-[13px] leading-[18px] text-[#c8cdd3]">
                              {row.path}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-[16px] py-[18px]">
                        <span className="inline-flex items-center gap-[6px] rounded-[12px] border border-solid border-[#424850] bg-[#252a30] px-[9px] py-[5px] text-[12px] text-[#d4dbe3]">
                          {row.source}
                        </span>
                      </td>
                      <td className="px-[16px] py-[18px] text-right font-mono text-[13px] text-[#c8cdd3]">
                        {row.rows}
                      </td>
                      <td className="px-[16px] py-[18px] text-center">
                        {row.certified ? (
                          <span className="inline-flex size-[24px] items-center justify-center rounded-full border border-solid border-[rgba(208,216,224,0.35)] bg-[rgba(170,181,192,0.15)] text-[12px] text-[#d0d8e0]">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-flex size-[24px] items-center justify-center rounded-full border border-solid border-[#424850] bg-[#252a30] text-[#a3afbe]">
                            ···
                          </span>
                        )}
                      </td>
                      <td className="px-[16px] py-[18px] text-[12px] text-[#c8cdd3]">
                        {row.updated}
                      </td>
                      <td className="px-[16px] py-[18px] text-right">
                        <Link
                          to="/jobs"
                          className="text-[12px] text-[#a3afbe] hover:text-[#d0d8e0]"
                        >
                          ···
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center justify-between border-t border-solid border-[#424850] bg-[#0f1216] px-[16px] py-[12px] text-[12px] text-[#a3afbe]">
              <span>
                Showing 1 to {rows.length} of {DEMO_ROWS.length} datasets
              </span>
              <div className="flex gap-[8px]">
                <button
                  type="button"
                  className="rounded-[4px] border border-solid border-[#424850] bg-[#252a30] px-[10px] py-[4px] text-[12px] text-[#d4dbe3]"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="rounded-[4px] border border-solid border-[#424850] bg-[#252a30] px-[10px] py-[4px] text-[12px] text-[#d4dbe3]"
                >
                  ›
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}

export default ManagedDatasetsPage
