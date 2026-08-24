/** Query results grid — human-visible only; never sent to AI Chat. */
import { formatGridCell } from '@/utils/maskGridCell'

interface PlaneResultsGridProps {
  columns: string[]
  rows: Record<string, unknown>[]
  loading: boolean
  error: string | null
  rowCount?: number | null
  displayMasked?: boolean
}

export function PlaneResultsGrid({
  columns,
  rows,
  loading,
  error,
  rowCount,
  displayMasked,
}: PlaneResultsGridProps) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--pdf-text-muted)]">
        Running query…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-[16px] text-center text-[12px] text-[var(--pdf-danger)]">
        {error}
      </div>
    )
  }

  if (columns.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[8px] p-[16px] text-center">
        <p className="text-[12px] text-[var(--pdf-text-muted)]">
          Results appear here after you run a query.
        </p>
        <p className="text-[11px] text-[var(--pdf-text-faint)]">
          Row payloads stay in Managed Plane — AI Chat never receives them.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-solid border-[var(--pdf-border)] px-[12px] py-[6px] text-[11px] text-[var(--pdf-text-muted)]">
        {rowCount != null ? `${rowCount} row(s)` : `${rows.length} row(s)`} · preview cap applies
        {displayMasked ? (
          <span className="ml-[8px] text-[var(--pdf-warn)]">PII columns masked</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[480px] border-collapse text-left text-[12px]">
          <thead className="sticky top-0 bg-[var(--pdf-table-head-bg)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="border-b border-solid border-[var(--pdf-border)] px-[10px] py-[8px] font-semibold text-[var(--pdf-text-muted)]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-solid border-[var(--pdf-border-subtle)]">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-[240px] truncate px-[10px] py-[6px] font-mono text-[11px] text-[var(--pdf-text-secondary)]"
                    title={formatGridCell(col, row[col], { forceMask: displayMasked })}
                  >
                    {formatGridCell(col, row[col], { forceMask: displayMasked })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
