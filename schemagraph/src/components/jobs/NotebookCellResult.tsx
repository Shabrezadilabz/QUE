import type {
  JobRun,
  JobRunLiveResult,
  JobRunSamplePreview,
} from '@/services/stitchApi'

export type NotebookCellRunSlice = {
  running: boolean
  status?: string
  kind?: string
  title?: string
  issues?: { level: string; message: string }[]
  tableRefs?: string[]
  live?: JobRunLiveResult | null
  samples: JobRunSamplePreview[]
  mode?: JobRun['mode'] | null
  runError?: string | null
}

/** Pick the latest-run slice that belongs to one notebook command. */
export function getNotebookCellRunSlice(
  run: JobRun | null | undefined,
  cellId: string,
): NotebookCellRunSlice | null {
  if (!run) return null

  const inScope =
    run.scope === 'all' || run.cellId === cellId || run.cellId == null
  const running =
    (run.status === 'running' || run.status === 'queued' || run.id === 'pending') &&
    inScope &&
    (run.scope === 'all' || run.cellId === cellId)

  const cr = run.output?.cellResults?.find((c) => c.cellId === cellId)
  const live =
    run.output?.liveResults?.find((c) => c.cellId === cellId) || null
  const samples = (run.output?.samplePreviews || []).filter(
    (s) => s.cellId === cellId,
  )

  if (!running && !cr && !live && samples.length === 0) {
    // Still show a failed whole-run banner on the targeted cell
    if (
      run.status === 'failed' &&
      run.cellId === cellId &&
      (run.output?.error || run.summary)
    ) {
      return {
        running: false,
        status: 'failed',
        samples: [],
        mode: run.mode,
        runError: run.output?.error || run.summary,
      }
    }
    return null
  }

  return {
    running,
    status: cr?.status || (running ? 'running' : live || samples.length ? 'ok' : undefined),
    kind: cr?.kind,
    title: cr?.title,
    issues: cr?.issues,
    tableRefs: cr?.tableRefs,
    live,
    samples,
    mode: run.mode,
    runError: run.output?.error || null,
  }
}

function cellValue(v: unknown): string {
  if (v == null) return 'null'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/** Databricks-style inline result block under a notebook command. */
export function NotebookCellResult({
  slice,
}: {
  slice: NotebookCellRunSlice
}) {
  if (slice.running) {
    return (
      <div className="que-nb-result que-nb-result--running">
        <div className="que-nb-result-meta">
          <span className="que-nb-result-dot" />
          Running command…
        </div>
      </div>
    )
  }

  const failed =
    slice.status === 'failed' ||
    slice.status === 'error' ||
    Boolean(slice.runError) ||
    (slice.issues || []).some((i) => i.level === 'error')

  const live = slice.live
  const sample = slice.samples[0]
  const columns = live?.columns || sample?.columns || []
  const rows = live?.rows || sample?.rows || []
  const rowCount = live?.rowCount ?? sample?.rowCount ?? rows.length
  const hasTable = columns.length > 0

  return (
    <div
      className={[
        'que-nb-result',
        failed ? 'que-nb-result--failed' : 'que-nb-result--ok',
      ].join(' ')}
    >
      <div className="que-nb-result-meta">
        <span className="que-nb-result-status">
          {failed ? 'FAILED' : slice.mode === 'live' ? 'OK' : 'DRY-RUN'}
        </span>
        {live?.durationMs != null ? (
          <span>{live.durationMs}ms</span>
        ) : null}
        {hasTable ? (
          <span>
            {rowCount} row{rowCount === 1 ? '' : 's'}
            {live?.truncated ? ' · truncated' : ''}
          </span>
        ) : null}
        {sample?.table ? <span>table · {sample.table}</span> : null}
        {live?.connectionName ? (
          <span>{live.connectionName}</span>
        ) : null}
        {(slice.tableRefs || []).length > 0 ? (
          <span>refs · {slice.tableRefs!.join(', ')}</span>
        ) : null}
      </div>

      {slice.runError ? (
        <pre className="que-nb-result-error">{slice.runError}</pre>
      ) : null}

      {(slice.issues || []).length > 0 ? (
        <ul className="que-nb-result-issues">
          {slice.issues!.map((issue, i) => (
            <li
              key={`${issue.level}-${i}`}
              className={
                issue.level === 'error'
                  ? 'is-error'
                  : issue.level === 'warn'
                    ? 'is-warn'
                    : ''
              }
            >
              [{issue.level}] {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {hasTable ? (
        <div className="que-nb-result-table-wrap">
          <table className="que-nb-result-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.name}>
                    {c.name}
                    {'dataType' in c && c.dataType ? (
                      <span className="que-nb-result-dtype">
                        {' '}
                        {String(c.dataType)}
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row, ri) => (
                <tr key={ri}>
                  {columns.map((c) => (
                    <td key={c.name}>{cellValue(row[c.name])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 20 ? (
            <p className="que-nb-result-more">
              Showing 20 of {rowCount} rows — open Results for the full
              preview.
            </p>
          ) : null}
        </div>
      ) : !failed && slice.status ? (
        <p className="que-nb-result-empty">
          {slice.kind === 'markdown'
            ? 'Markdown command — no tabular output.'
            : 'No preview rows for this command.'}
        </p>
      ) : null}

      {live?.sqlExecuted ? (
        <details className="que-nb-result-sql">
          <summary>Executed SQL</summary>
          <pre>{live.sqlExecuted}</pre>
        </details>
      ) : null}
    </div>
  )
}
