import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicStatus } from '@/services/stitchApi'
import {
  FigmaLiveUpdates,
  FigmaPublicShell,
  FigmaStatusFooter,
  PUBLIC_ASSETS,
} from '@/components/figma/FigmaPublicShell'

const CORE_SERVICES = [
  { name: 'Ingestion API', key: 'api' as const },
  { name: 'Vector Storage', key: 'db' as const },
  { name: 'Sync Engine', key: 'jobs' as const },
] as const

const LATENCY_BAR_HEIGHTS = [
  18, 22, 15, 27, 34, 51, 80, 48, 42, 34, 24, 22, 18, 15,
]

function serviceOk(data: Record<string, unknown> | null, key: string): boolean {
  if (!data) return true
  const block = data[key]
  if (block && typeof block === 'object' && 'ok' in (block as object)) {
    return Boolean((block as { ok?: boolean }).ok)
  }
  return Boolean(data.ok)
}

/** Operational Status — pixel-faithful Figma v2 frame (2:1176). */
export function StatusPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchPublicStatus()
      .then((d) => setData(d as Record<string, unknown>))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const ok = error ? false : Boolean(data?.ok ?? true)
  const inv = (data?.inventory || {}) as Record<string, number>
  const latency =
    (data?.db as { latencyMs?: number } | undefined)?.latencyMs ?? 42
  const tablesSynced = inv.connections ?? inv.workspaces ?? 14208
  const joinsPromoted = inv.jobs ?? inv.managedDatasets ?? 3450

  return (
    <FigmaPublicShell
      section="Status"
      headerRight={<FigmaLiveUpdates />}
      footer={<FigmaStatusFooter />}
    >
      <div className="flex flex-col gap-[24px] p-[24px]">
        {error ? (
          <p className="rounded-[8px] border border-solid border-[#ff6b6b]/40 bg-[rgba(255,107,107,0.13)] px-[16px] py-[12px] text-[13px] text-[#ff6b6b]">
            {error}
          </p>
        ) : null}

        {/* Status banner */}
        <div
          className={[
            'flex w-full items-center gap-[16px] rounded-[8px] border border-solid p-[24px]',
            ok
              ? 'border-[#68ceaf] bg-[#1e2328]'
              : 'border-[#ffb06b] bg-[#1e2328]',
          ].join(' ')}
        >
          <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[24px] border border-solid border-[#68ceaf] bg-[rgba(104,206,175,0.13)]">
            <img alt="" className="size-[24px]" src={PUBLIC_ASSETS.check} />
          </div>
          <div className="flex flex-col gap-[4px]">
            <p className="text-[20px] font-bold text-[#ecf0f4]">
              {ok ? 'All Systems Operational' : 'Degraded Performance'}
            </p>
            <p className="text-[14px] text-[#c8cdd3]">
              {ok
                ? 'The Que Data Engine and associated services are currently healthy and operating within normal parameters.'
                : 'One or more services reported issues. Engineering has been notified.'}
            </p>
          </div>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-3 lg:grid-rows-[180px_220px]">
          {/* Core Services — spans 2 cols */}
          <section className="flex flex-col gap-[12px] rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e] p-[16px] lg:col-span-2 lg:row-start-1">
            <p className="text-[14px] font-bold text-[#ecf0f4]">Core Services</p>
            <div className="flex flex-col gap-[8px]">
              {CORE_SERVICES.map((svc) => {
                const operational = serviceOk(data, svc.key)
                return (
                  <div
                    key={svc.key}
                    className="flex items-center justify-between border-b border-solid border-[#2a313c] pb-[8px]"
                  >
                    <p className="text-[13px] text-[#d4dbe3]">{svc.name}</p>
                    <span
                      className={[
                        'rounded-[4px] px-[8px] py-[2px] text-[10px] font-bold',
                        operational
                          ? 'bg-[rgba(104,206,175,0.13)] text-[#68ceaf]'
                          : 'bg-[rgba(255,176,107,0.13)] text-[#ffb06b]',
                      ].join(' ')}
                    >
                      {operational ? 'OPERATIONAL' : 'DEGRADED'}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* System Load */}
          <section className="flex flex-col gap-[16px] rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e] p-[16px] lg:col-start-3 lg:row-start-1">
            <p className="text-[14px] font-bold text-[#ecf0f4]">System Load</p>
            <div className="flex gap-[16px]">
              <div className="flex flex-1 flex-col gap-[4px] rounded-[6px] bg-[#0f1216] p-[12px]">
                <p className="text-[11px] text-[#a3afbe]">Tables Synced</p>
                <p className="text-[18px] font-extrabold text-[#ecf0f4]">
                  {tablesSynced.toLocaleString()}
                </p>
                <p className="text-[10px] text-[#68ceaf]">+2.4% today</p>
              </div>
              <div className="flex flex-1 flex-col gap-[4px] rounded-[6px] bg-[#0f1216] p-[12px]">
                <p className="text-[11px] text-[#a3afbe]">Joins Promoted</p>
                <p className="text-[18px] font-extrabold text-[#ecf0f4]">
                  {joinsPromoted.toLocaleString()}
                </p>
                <p className="text-[10px] text-[#68ceaf]">+0.8% today</p>
              </div>
            </div>
          </section>

          {/* API Latency — full width row 2 */}
          <section className="flex flex-col gap-[16px] rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e] p-[16px] lg:col-span-3 lg:row-start-2">
            <div className="flex w-full items-center justify-between">
              <div className="flex flex-col gap-[2px]">
                <p className="text-[14px] font-bold text-[#ecf0f4]">API Latency</p>
                <p className="text-[12px] text-[#a3afbe]">
                  Average response time across all endpoints (Last 24h)
                </p>
              </div>
              <p className="text-[20px] font-extrabold text-[#68ceaf]">{latency}ms</p>
            </div>
            <div className="flex flex-1 items-end justify-between border-b border-solid border-[#2a313c] pb-[8px]">
              {LATENCY_BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className={[
                    'w-[40px] shrink-0 rounded-tl-[2px] rounded-tr-[2px]',
                    h === 80 ? 'bg-[#ffb06b] opacity-90' : 'bg-[#68ceaf] opacity-60',
                  ].join(' ')}
                  style={{ height: h }}
                />
              ))}
            </div>
          </section>
        </div>

        <p className="text-center text-[12px] text-[#a3afbe]">
          <Link to="/verify" className="text-[#68ceaf] hover:underline">
            Verify attestation
          </Link>
          {' · '}
          <Link to="/login" className="text-[#68ceaf] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </FigmaPublicShell>
  )
}

export default StatusPage
