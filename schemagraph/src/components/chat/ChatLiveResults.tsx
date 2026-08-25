/** Live warehouse query results — shown in chat UI only, never in AI context. */

export interface ChatLiveQueryResult {
  ok: boolean
  columns?: string[]
  rows?: Record<string, unknown>[]
  rowCount?: number
  connectionName?: string | null
  connectionId?: string | null
  durationMs?: number
  displayMasked?: boolean
  policy?: string
  aiIsolation?: string
  error?: string
}

export function ChatLiveResults({
  liveQuery,
}: {
  liveQuery: ChatLiveQueryResult
}) {
  if (!liveQuery?.ok) {
    if (liveQuery?.error) {
      return (
        <div className="que-live-results que-live-results--error">
          <p className="que-live-results__title">Live query failed</p>
          <p className="que-live-results__meta">{liveQuery.error}</p>
        </div>
      )
    }
    return null
  }

  const columns = liveQuery.columns || []
  const rows = liveQuery.rows || []

  return (
    <div className="que-live-results">
      <div className="que-live-results__header">
        <div className="que-live-results__badges">
          <span className="que-live-results__badge que-live-results__badge--live">
            Live data
          </span>
          {liveQuery.displayMasked ? (
            <span className="que-live-results__badge que-live-results__badge--pii">
              PII masked
            </span>
          ) : null}
          <span className="que-live-results__badge que-live-results__badge--shield">
            Not sent to AI
          </span>
        </div>
        <p className="que-live-results__meta">
          {liveQuery.connectionName || 'Warehouse'}
          {' · '}
          {liveQuery.rowCount ?? rows.length} row
          {(liveQuery.rowCount ?? rows.length) === 1 ? '' : 's'}
          {liveQuery.durationMs != null ? ` · ${liveQuery.durationMs}ms` : ''}
        </p>
      </div>
      <div className="que-live-results__scroll">
        <table className="que-live-results__table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="que-live-results__empty">
                  No rows returned
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr key={ri}>
                  {columns.map((col) => (
                    <td key={col} title={String(row[col] ?? '')}>
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatCell(value: unknown) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  const s = String(value)
  return s.length > 120 ? `${s.slice(0, 117)}…` : s
}
