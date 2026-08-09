type Row = Record<string, unknown>

/**
 * Lightweight certified-BI preview (table / bar / kpi / pie) — no chart lib.
 */
export function BiChartPreview({
  chartType,
  rows,
  xField,
  yField,
}: {
  chartType: string
  rows: Row[]
  xField?: string
  yField?: string
}) {
  if (!rows.length) {
    return (
      <p className="font-body text-[13px] text-on-surface-variant">
        No preview rows — bind a certified managed dataset and load preview.
      </p>
    )
  }

  const keys = Object.keys(rows[0] || {})
  const x = xField && keys.includes(xField) ? xField : keys[0]
  const y =
    yField && keys.includes(yField)
      ? yField
      : keys.find((k) => k !== x && typeof rows[0][k] === 'number') || keys[1]

  if (chartType === 'kpi') {
    const val = y ? rows[0][y] : rows.length
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-lg py-xl text-center">
        <p className="font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
          {y || 'rows'}
        </p>
        <p className="mt-sm font-headline text-4xl font-semibold text-on-surface">
          {String(val ?? '—')}
        </p>
      </div>
    )
  }

  if (chartType === 'bar' || chartType === 'line') {
    const nums = rows.map((r) => Number(r[y!] ?? 0)).filter((n) => Number.isFinite(n))
    const max = Math.max(...nums, 1)
    return (
      <div className="space-y-sm">
        {rows.slice(0, 24).map((r, i) => {
          const n = Number(r[y!] ?? 0)
          const pct = Math.max(2, Math.round((n / max) * 100))
          return (
            <div key={i} className="flex items-center gap-md">
              <span className="w-28 truncate font-label text-[11px] text-on-surface-variant">
                {String(r[x!] ?? i)}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary-container">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-16 text-right font-mono text-[11px]">{n}</span>
            </div>
          )
        })}
      </div>
    )
  }

  if (chartType === 'pie') {
    const nums = rows.map((r) => Math.max(0, Number(r[y!] ?? 0)))
    const total = nums.reduce((a, b) => a + b, 0) || 1
    return (
      <ul className="space-y-sm">
        {rows.slice(0, 12).map((r, i) => {
          const n = Math.max(0, Number(r[y!] ?? 0))
          const pct = Math.round((n / total) * 1000) / 10
          return (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-surface-container-low px-md py-sm text-[12px]"
            >
              <span>{String(r[x!] ?? i)}</span>
              <span className="font-mono text-primary">
                {pct}% · {n}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  // table default
  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
      <table className="min-w-full text-left text-[12px]">
        <thead className="bg-surface-container-low">
          <tr>
            {keys.map((k) => (
              <th key={k} className="px-md py-sm font-label">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, i) => (
            <tr key={i} className="border-t border-outline-variant/10">
              {keys.map((k) => (
                <td key={k} className="px-md py-sm font-mono">
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
