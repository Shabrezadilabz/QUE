import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  certifyManagedDatasetApi,
  fetchManagedDatasetRows,
  fetchManagedDatasets,
  type ManagedDataset,
  type ManagedPlaneQuotas,
} from '@/services/stitchApi'

/**
 * Offer B — Que Managed Data Plane browser (human rows; AI denied).
 */
export function ManagedDatasetsPage() {
  const { canWrite } = useWorkspaceRole()
  const [enabled, setEnabled] = useState(false)
  const [quotas, setQuotas] = useState<ManagedPlaneQuotas | null>(null)
  const [items, setItems] = useState<ManagedDataset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchManagedDatasets()
      setEnabled(data.enabled)
      setQuotas(data.quotas || null)
      setItems(data.items)
      setSelectedId((prev) => {
        if (prev && data.items.some((i) => i.id === prev)) return prev
        return data.items[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!selectedId) {
      setPreview([])
      return
    }
    void fetchManagedDatasetRows(selectedId, { limit: 25 })
      .then((r) => setPreview(r.rows.map((x) => x.data)))
      .catch(() => setPreview([]))
  }, [selectedId])

  async function certify() {
    if (!selectedId || !canWrite) return
    setBusy(true)
    try {
      await certifyManagedDatasetApi(selectedId)
      setToast('Dataset certified for BI')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const selected = items.find((i) => i.id === selectedId) ?? null

  return (
    <QueAppChrome eyebrow="MANAGED DATA · OFFER B">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <div className="shrink-0 border-b border-outline-variant/20 px-md py-md md:px-lg">
          <h1 className="font-headline text-xl font-semibold text-on-surface">
            Managed datasets
          </h1>
          <p className="mt-xs max-w-[40rem] font-body text-[13px] text-on-surface-variant">
            Que-hosted job outputs for teams without a warehouse. Humans can
            preview rows; AI never receives managed row payloads.
          </p>
          {!enabled ? (
            <p className="mt-md font-body text-[13px] text-primary">
              Enable in{' '}
              <Link to="/settings/ai-policy" className="underline">
                Settings → AI &amp; Policy
              </Link>{' '}
              (enableManagedDataPlane) and set execution plane to managed.
            </p>
          ) : null}
          {quotas ? (
            <p className="mt-sm font-body text-[12px] text-on-surface-variant">
              Quota {quotas.usedDatasets}/{quotas.maxDatasets} datasets · row cap{' '}
              {quotas.maxRowsPerDataset.toLocaleString()} · retention{' '}
              {quotas.retentionDays}d
            </p>
          ) : null}
        </div>
        {error ? (
          <p className="border-b border-error/40 bg-error/10 px-md py-sm text-[13px] text-error">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="border-b border-primary/20 bg-primary/5 px-md py-sm text-[12px] text-primary">
            {toast}
          </p>
        ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
          <aside className="min-h-0 overflow-y-auto border-b lg:col-span-4 lg:border-r lg:border-b-0">
            {items.length === 0 ? (
              <p className="p-lg text-[13px] text-on-surface-variant">
                No managed datasets yet. Run a live validate with plane=managed.
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant/10">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={[
                        'w-full px-md py-md text-left',
                        selectedId === item.id
                          ? 'bg-primary/5'
                          : 'hover:bg-surface-container-low',
                      ].join(' ')}
                    >
                      <p className="font-label text-[13px] font-semibold">
                        {item.name}
                      </p>
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        {item.rowCount} rows · {item.certified ? 'certified' : 'draft'} ·
                        AI {item.aiAccess}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <main className="min-h-0 overflow-y-auto p-md lg:col-span-8 md:p-lg">
            {!selected ? (
              <p className="text-[13px] text-on-surface-variant">
                Select a dataset.
              </p>
            ) : (
              <div className="space-y-md">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div>
                    <h2 className="font-headline text-lg font-semibold">
                      {selected.name}
                    </h2>
                    <p className="mt-1 text-[12px] text-on-surface-variant">
                      {selected.slug} · {selected.columns.map((c) => c.name).join(', ')}
                    </p>
                  </div>
                  {canWrite && !selected.certified ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void certify()}
                      className="rounded-lg bg-primary px-md py-1.5 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
                    >
                      Certify for BI
                    </button>
                  ) : null}
                </div>
                <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="bg-surface-container-low">
                      <tr>
                        {selected.columns.map((c) => (
                          <th key={c.name} className="px-md py-sm font-label">
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-t border-outline-variant/10">
                          {selected.columns.map((c) => (
                            <td key={c.name} className="px-md py-sm font-mono">
                              {String(row[c.name] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </QueAppChrome>
  )
}

export default ManagedDatasetsPage
