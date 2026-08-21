/** PDF page-06 demo dashboard — shown until certified visuals exist. */
export function BiPdfDemoDashboard({
  onBuild,
  canWrite,
  busy,
}: {
  onBuild: () => void
  canWrite: boolean
  busy: boolean
}) {
  const bars = [42, 58, 45, 72, 55, 68, 48, 62, 75, 52, 66, 70, 44, 60]

  return (
    <div className="flex flex-col gap-[16px] p-[24px]">
      <div className="grid gap-[16px] md:grid-cols-2">
        <DemoKpiCard
          title="Total Query Volume"
          value="4.2M"
          trend="↑ 12% vs last wk"
          trendUp
          badge="LIVE"
          badgeTone="live"
        />
        <DemoKpiCard
          title="Average Latency"
          value="112ms"
          trend="↓ 4% vs last wk"
          trendUp={false}
          badge="OPTIMIZED"
          badgeTone="ok"
        />
      </div>

      <article className="overflow-hidden rounded-[4px] border border-solid border-[#424850] bg-[#0f1215]">
        <div className="flex items-center justify-between border-b border-solid border-[#424850] px-[17px] py-[14px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[#a3afbe]" aria-hidden>
              ▦
            </span>
            <h3 className="text-[14px] font-semibold text-[#d4dbe3]">Daily Active Sources</h3>
          </div>
          <button type="button" className="text-[14px] text-[#6b7380]" aria-label="Chart options">
            ⋮
          </button>
        </div>
        <div className="relative px-[17px] py-[24px]">
          <div className="flex h-[180px] items-end justify-between gap-[6px]">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-[2px] bg-gradient-to-t from-[#424850] to-[#6b7380]"
                style={{ height: `${h}%`, minHeight: 8 }}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-solid border-[#424850] bg-[#121619]/90 px-[14px] py-[6px] text-[11px] font-medium text-[#c8cdd3]">
              Visualization Layer Active
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-solid border-[#424850] px-[17px] py-[12px] text-[11px] text-[#8a9099]">
          <span>Last updated: 5 mins ago</span>
          <span className="text-[#a3afbe]">Mint Embed &lt;&gt;</span>
        </div>
      </article>

      {canWrite ? (
        <div className="flex flex-wrap items-center justify-center gap-[12px] rounded-[4px] border border-dashed border-[#424850] bg-[#0f1215]/60 px-[20px] py-[20px]">
          <p className="text-[13px] text-[#a3afbe]">
            Connect certified managed datasets to replace this preview with live visuals.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onBuild}
            className="pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[12px] font-semibold disabled:opacity-40"
          >
            {busy ? 'Building…' : 'Build from certified data'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DemoKpiCard({
  title,
  value,
  trend,
  trendUp,
  badge,
  badgeTone,
}: {
  title: string
  value: string
  trend: string
  trendUp: boolean
  badge: string
  badgeTone: 'live' | 'ok'
}) {
  return (
    <article className="rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] p-[17px]">
      <div className="mb-[12px] flex items-start justify-between gap-[8px]">
        <p className="text-[12px] font-medium text-[#c8cdd3]">{title}</p>
        <span
          className={[
            'shrink-0 rounded-[2px] border border-solid px-[7px] py-[2px] text-[9px] font-bold tracking-[0.8px] uppercase',
            badgeTone === 'live'
              ? 'border-[rgba(122,236,208,0.45)] bg-[rgba(122,236,208,0.12)] text-[#7aecd0]'
              : 'border-[rgba(122,236,208,0.35)] bg-transparent text-[#7aecd0]',
          ].join(' ')}
        >
          {badge}
        </span>
      </div>
      <p className="text-[32px] font-bold leading-none tracking-[-0.5px] text-[#ecf0f4]">{value}</p>
      <div className="mt-[12px] flex items-center justify-between gap-[8px]">
        <p
          className={[
            'text-[11px] font-medium',
            trendUp ? 'text-[#7aecd0]' : 'text-[#7aecd0]',
          ].join(' ')}
        >
          {trend}
        </p>
        <span className="text-[10px] text-[#6b7380]">Mint Embed &lt;&gt;</span>
      </div>
    </article>
  )
}
