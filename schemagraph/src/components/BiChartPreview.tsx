type Row = Record<string, unknown>

/**
 * Certified-BI visual preview — Power BI–like types without a heavy chart lib.
 * Rows come from managed data plane only (never AI lake access).
 */
export function BiChartPreview({
  chartType,
  rows,
  xField,
  yField,
  compact = false,
}: {
  chartType: string
  rows: Row[]
  xField?: string
  yField?: string
  compact?: boolean
}) {
  if (!rows.length) {
    return (
      <p className="font-body text-[12px] text-on-surface-variant">
        No preview rows — bind a certified managed dataset and Run.
      </p>
    )
  }

  const keys = Object.keys(rows[0] || {})
  const x = xField && keys.includes(xField) ? xField : keys[0]
  const y =
    yField && keys.includes(yField)
      ? yField
      : keys.find((k) => k !== x && typeof rows[0][k] === 'number') || keys[1]
  const limit = compact ? 12 : 24
  const type = String(chartType || 'table').toLowerCase()

  if (type === 'kpi' || type === 'card') {
    const nums = rows
      .map((r) => Number(r[y!] ?? 0))
      .filter((n) => Number.isFinite(n))
    const sum = nums.reduce((a, b) => a + b, 0)
    const val =
      type === 'kpi'
        ? y
          ? rows[0][y]
          : rows.length
        : Number.isFinite(sum)
          ? sum
          : rows.length
    return (
      <div
        className={[
          'rounded-xl border border-outline-variant/30 bg-surface-container-low text-center',
          compact ? 'px-md py-md' : 'px-lg py-xl',
        ].join(' ')}
      >
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          {type === 'card' ? 'Card · sum' : 'KPI'} · {y || 'rows'}
        </p>
        <p
          className={[
            'mt-sm font-headline font-semibold text-on-surface',
            compact ? 'text-2xl' : 'text-4xl',
          ].join(' ')}
        >
          {String(val ?? '—')}
        </p>
        <p className="mt-1 font-label text-[10px] text-on-surface-variant">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </p>
      </div>
    )
  }

  if (
    type === 'bar' ||
    type === 'line' ||
    type === 'area' ||
    type === 'stacked_bar'
  ) {
    const nums = rows
      .map((r) => Number(r[y!] ?? 0))
      .filter((n) => Number.isFinite(n))
    const max = Math.max(...nums, 1)
    const isLine = type === 'line' || type === 'area'
    return (
      <div className="space-y-sm">
        {rows.slice(0, limit).map((r, i) => {
          const n = Number(r[y!] ?? 0)
          const pct = Math.max(2, Math.round((n / max) * 100))
          return (
            <div key={i} className="flex items-center gap-md">
              <span className="w-24 truncate font-label text-[10px] text-on-surface-variant">
                {String(r[x!] ?? i)}
              </span>
              <div
                className={[
                  'h-3 flex-1 overflow-hidden bg-secondary-container',
                  isLine ? 'rounded-sm' : 'rounded-full',
                ].join(' ')}
              >
                <div
                  className={[
                    'h-full transition-all',
                    type === 'area'
                      ? 'rounded-sm bg-secondary/70'
                      : type === 'stacked_bar'
                        ? 'rounded-full bg-tertiary'
                        : isLine
                          ? 'rounded-sm bg-primary'
                          : 'rounded-full bg-primary',
                  ].join(' ')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-14 text-right font-mono text-[10px]">{n}</span>
            </div>
          )
        })}
      </div>
    )
  }

  if (type === 'pie') {
    const nums = rows.map((r) => Math.max(0, Number(r[y!] ?? 0)))
    const total = nums.reduce((a, b) => a + b, 0) || 1
    return (
      <ul className="space-y-sm">
        {rows.slice(0, compact ? 8 : 12).map((r, i) => {
          const n = Math.max(0, Number(r[y!] ?? 0))
          const pct = Math.round((n / total) * 1000) / 10
          return (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-surface-container-low px-md py-sm text-[12px]"
            >
              <span className="truncate">{String(r[x!] ?? i)}</span>
              <span className="shrink-0 font-mono text-primary">
                {pct}% · {n}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
      <table className="min-w-full text-left text-[11px]">
        <thead className="bg-surface-container-low">
          <tr>
            {keys.map((k) => (
              <th key={k} className="px-sm py-sm font-label">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, compact ? 20 : 50).map((row, i) => (
            <tr key={i} className="border-t border-outline-variant/10">
              {keys.map((k) => (
                <td key={k} className="px-sm py-sm font-mono">
                  {String(row[k] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
