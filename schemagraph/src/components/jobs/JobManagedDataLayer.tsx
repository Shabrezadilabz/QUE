import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  certifyManagedDatasetApi,
  fetchManagedDatasetRows,
  fetchManagedDatasets,
  type ManagedDataset,
} from '@/services/stitchApi'
import { formatGridCell } from '@/utils/maskGridCell'

type Props = {
  jobId: string
  canWrite: boolean
  /** Compact strip under notebook vs full Results panel */
  compact?: boolean
}

/**
 * Inline managed-data preview + certify after a job run —
 * replaces the need for a separate Managed page in the main flow.
 */
export function JobManagedDataLayer({
  jobId,
  canWrite,
  compact = false,
}: Props) {
  const [enabled, setEnabled] = useState(false)
  const [datasets, setDatasets] = useState<ManagedDataset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [displayMasked, setDisplayMasked] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchManagedDatasets()
      setEnabled(data.enabled)
      const forJob = data.items.filter((d) => d.jobId === jobId)
      // Prefer job-linked; if none, show nothing (don't steal other jobs' data)
      setDatasets(forJob)
      setSelectedId((prev) => {
        if (prev && forJob.some((d) => d.id === prev)) return prev
        return forJob[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [jobId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!selectedId) {
      setRows([])
      return
    }
    void fetchManagedDatasetRows(selectedId, { limit: compact ? 12 : 40 })
      .then((r) => {
        setDisplayMasked(Boolean(r.displayMasked))
        setRows(r.rows.map((x) => x.data))
      })
      .catch(() => setRows([]))
  }, [selectedId, compact])

  async function certify() {
    if (!selectedId || !canWrite) return
    setBusy(true)
    setError(null)
    try {
      await certifyManagedDatasetApi(selectedId)
      setToast('Certified — ready for Report Studio')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const selected = datasets.find((d) => d.id === selectedId) ?? null
  const cols =
    selected?.columns?.map((c) => c.name) ||
    (rows[0] ? Object.keys(rows[0]) : [])

  if (!enabled) {
    return (
      <div
        className={[
          'rounded-xl border border-outline-variant/25 bg-surface-container-low/60',
          compact ? 'p-sm' : 'p-md',
        ].join(' ')}
      >
        <p className="font-label text-[11px] font-semibold text-on-surface">
          Managed output (optional)
        </p>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          Enable in Settings → AI & Policy (
          <span className="font-mono text-[11px]">enableManagedDataPlane</span>
          ) and run with plane=managed to host job rows here for preview /
          certify — AI never receives these payloads.
        </p>
        <Link
          to="/settings"
          className="mt-sm inline-block text-[12px] text-secondary underline"
        >
          Open Settings
        </Link>
      </div>
    )
  }

  if (datasets.length === 0) {
    return (
      <div
        className={[
          'rounded-xl border border-dashed border-outline-variant/35 bg-surface-container-low/40',
          compact ? 'p-sm' : 'p-md',
        ].join(' ')}
      >
        <p className="font-label text-[11px] font-semibold text-on-surface">
          Managed output
        </p>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          No managed dataset for this job yet. Run with the managed execution
          plane to land a table here for preview + certify (no separate page).
        </p>
      </div>
    )
  }

  return (
    <div
      className={[
        'rounded-xl border border-secondary/25 bg-secondary/5',
        compact ? 'p-sm' : 'p-md',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <p className="font-label text-[10px] font-bold tracking-widest text-secondary uppercase">
            Managed preview · certify
          </p>
          <p className="mt-1 font-label text-[13px] font-semibold text-on-surface">
            {selected?.name || 'Dataset'}
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">
            {selected?.rowCount ?? 0} rows ·{' '}
            {selected?.certified ? 'certified for BI' : 'draft — certify to use in Report Studio'}
            {displayMasked ? ' · PII masked' : ''}
            {' · '}
            AI denied row payloads
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          {datasets.length > 1 ? (
            <select
              value={selectedId || ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded border border-outline-variant/40 bg-surface px-sm py-1 text-[11px]"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.certified ? ' ✓' : ''}
                </option>
              ))}
            </select>
          ) : null}
          {canWrite && selected && !selected.certified ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void certify()}
              className="rounded bg-secondary px-md py-1.5 font-label text-[11px] font-semibold text-on-secondary disabled:opacity-40"
            >
              {busy ? 'Certifying…' : 'Certify for BI'}
            </button>
          ) : null}
          {selected?.certified ? (
            <Link
              to="/bi"
              className="rounded-lg border border-secondary/50 px-md py-1.5 font-label text-[11px] text-secondary"
            >
              Open Report Studio
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-sm text-[12px] text-error">{error}</p>
      ) : null}
      {toast ? (
        <p className="mt-sm text-[12px] text-secondary">{toast}</p>
      ) : null}

      <div
        className={[
          'mt-md overflow-x-auto rounded-lg border border-outline-variant/30 bg-surface',
          compact ? 'max-h-48' : 'max-h-80',
        ].join(' ')}
      >
        {cols.length === 0 || rows.length === 0 ? (
          <p className="p-md text-[12px] text-on-surface-variant">
            No preview rows yet.
          </p>
        ) : (
          <table className="min-w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-surface-container-low">
              <tr>
                {cols.map((c) => (
                  <th
                    key={c}
                    className="px-sm py-sm font-label text-[10px] tracking-wide text-on-surface-variant uppercase"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-outline-variant/10"
                >
                  {cols.map((c) => (
                    <td key={c} className="px-sm py-1.5 font-mono text-on-surface">
                      {formatGridCell(c, row[c], { forceMask: displayMasked })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
