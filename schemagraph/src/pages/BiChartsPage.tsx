import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { BiChartPreview } from '@/components/BiChartPreview'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  apiFetch,
  createBiChartApi,
  fetchBiCharts,
  fetchManagedDatasets,
  getActiveWorkspaceId,
  getApiBase,
  mintBiEmbedTokenApi,
  updateBiChartApi,
  type BiChart,
  type ManagedDataset,
} from '@/services/stitchApi'

async function previewChartRows(
  chartId: string,
): Promise<Record<string, unknown>[]> {
  const ws = getActiveWorkspaceId()
  const res = await apiFetch(`/workspaces/${ws}/bi/charts/${chartId}/preview`)
  const body = (await res.json().catch(() => ({}))) as {
    rows?: Record<string, unknown>[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `preview ${res.status}`)
  return body.rows || []
}

/**
 * Certified BI charts — create, edit fields, preview, certify, embed.
 */
export function BiChartsPage() {
  const { canWrite, role } = useWorkspaceRole()
  const canAdmin = role === 'admin' || role === 'owner'
  const [charts, setCharts] = useState<BiChart[]>([])
  const [datasets, setDatasets] = useState<ManagedDataset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [chartType, setChartType] = useState('table')
  const [xField, setXField] = useState('')
  const [yField, setYField] = useState('')
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [embedToken, setEmbedToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = useMemo(
    () => charts.find((c) => c.id === selectedId) ?? null,
    [charts, selectedId],
  )

  const fieldOpts = useMemo(() => {
    const ds = datasets.find((d) => d.id === (selected?.datasetId || datasetId))
    return (ds?.columns || []).map((c) => c.name)
  }, [datasets, selected, datasetId])

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [c, d] = await Promise.all([
        fetchBiCharts(),
        fetchManagedDatasets(),
      ])
      setCharts(c)
      setDatasets(d.items.filter((x) => x.certified))
      setSelectedId((prev) => {
        if (prev && c.some((x) => x.id === prev)) return prev
        return c[0]?.id ?? null
      })
      if (!datasetId && d.items.filter((x) => x.certified)[0]) {
        setDatasetId(d.items.filter((x) => x.certified)[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [datasetId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!selected) {
      setPreviewRows([])
      return
    }
    setTitle(selected.title)
    setChartType(selected.chartType)
    setDatasetId(selected.datasetId || '')
    setXField(String(selected.config?.xField || ''))
    setYField(String(selected.config?.yField || ''))
    void previewChartRows(selected.id)
      .then(setPreviewRows)
      .catch(() => setPreviewRows([]))
  }, [selected?.id])

  async function create() {
    if (!canWrite || !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const item = await createBiChartApi({
        title: title.trim(),
        chartType,
        datasetId: datasetId || null,
        config: { xField: xField || undefined, yField: yField || undefined },
      })
      setToast('Chart created')
      setSelectedId(item.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!selected || !canWrite) return
    setBusy(true)
    try {
      await updateBiChartApi(selected.id, {
        title: title.trim() || selected.title,
        chartType,
        datasetId: datasetId || null,
        config: { xField: xField || undefined, yField: yField || undefined },
      })
      setToast('Chart updated')
      await reload()
      const rows = await previewChartRows(selected.id)
      setPreviewRows(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function certify(id: string) {
    setBusy(true)
    try {
      await updateBiChartApi(id, { certified: true })
      setToast('Chart certified')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function mint(id: string) {
    if (!canAdmin) return
    setBusy(true)
    try {
      const out = await mintBiEmbedTokenApi(id, { label: 'client-embed' })
      setEmbedToken(out.token)
      setToast('Embed token minted — copy now; shown once')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const embedUrl = embedToken
    ? `${window.location.origin}/embed/${embedToken}`
    : null
  const embedApiUrl = embedToken
    ? `${getApiBase()}/bi/embed/${embedToken}`
    : null

  return (
    <QueAppChrome eyebrow="CERTIFIED BI">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <div className="shrink-0 border-b border-outline-variant/20 px-md py-md md:px-lg">
          <h1 className="font-headline text-xl font-semibold text-on-surface">
            Certified BI
          </h1>
          <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
            Edit chart type and axes, preview from certified managed datasets,
            then certify and mint embed tokens. AI never sees row payloads.
          </p>
          <p className="mt-sm text-[12px] text-on-surface-variant">
            Datasets:{' '}
            <Link to="/managed" className="text-secondary underline">
              Managed data plane
            </Link>
          </p>
        </div>

        {error ? (
          <p className="border-b border-error/40 bg-error/10 px-md py-sm text-[13px] text-error">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="border-b border-secondary/25 bg-secondary/5 px-md py-sm text-[12px] text-secondary">
            {toast}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
          <aside className="min-h-0 overflow-y-auto border-b lg:col-span-4 lg:border-r lg:border-b-0">
            {canWrite ? (
              <div className="border-b border-outline-variant/20 p-md">
                <p className="font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                  New chart
                </p>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="mt-sm w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
                />
                <button
                  type="button"
                  disabled={busy || !title.trim()}
                  onClick={() => void create()}
                  className="mt-sm w-full rounded bg-secondary px-md py-1.5 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            ) : null}
            <ul className="divide-y divide-outline-variant/10">
              {charts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={[
                      'w-full px-md py-md text-left',
                      selectedId === c.id
                        ? 'bg-secondary/5'
                        : 'hover:bg-surface-container-low',
                    ].join(' ')}
                  >
                    <p className="font-label text-[13px] font-semibold">
                      {c.title}
                    </p>
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      {c.chartType} · {c.certified ? 'certified' : 'draft'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="min-h-0 overflow-y-auto p-md lg:col-span-8 md:p-lg">
            {!selected ? (
              <p className="text-[13px] text-on-surface-variant">
                Create or select a chart.
              </p>
            ) : (
              <div className="space-y-lg">
                <div className="grid gap-md md:grid-cols-2">
                  <label className="block text-[11px] text-on-surface-variant">
                    Title
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={!canWrite}
                      className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px] text-on-surface"
                    />
                  </label>
                  <label className="block text-[11px] text-on-surface-variant">
                    Type
                    <select
                      value={chartType}
                      onChange={(e) => setChartType(e.target.value)}
                      disabled={!canWrite}
                      className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
                    >
                      <option value="table">Table</option>
                      <option value="bar">Bar</option>
                      <option value="line">Line</option>
                      <option value="pie">Pie</option>
                      <option value="kpi">KPI</option>
                    </select>
                  </label>
                  <label className="block text-[11px] text-on-surface-variant">
                    Dataset
                    <select
                      value={datasetId}
                      onChange={(e) => setDatasetId(e.target.value)}
                      disabled={!canWrite}
                      className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
                    >
                      <option value="">None</option>
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-sm">
                    <label className="block text-[11px] text-on-surface-variant">
                      X field
                      <select
                        value={xField}
                        onChange={(e) => setXField(e.target.value)}
                        disabled={!canWrite}
                        className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
                      >
                        <option value="">Auto</option>
                        {fieldOpts.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] text-on-surface-variant">
                      Y field
                      <select
                        value={yField}
                        onChange={(e) => setYField(e.target.value)}
                        disabled={!canWrite}
                        className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
                      >
                        <option value="">Auto</option>
                        {fieldOpts.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-sm">
                  {canWrite ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveEdit()}
                      className="rounded-lg border border-secondary px-md py-1.5 text-[12px] font-semibold text-secondary disabled:opacity-40"
                    >
                      Save edits
                    </button>
                  ) : null}
                  {canWrite && !selected.certified ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void certify(selected.id)}
                      className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                    >
                      Certify
                    </button>
                  ) : null}
                  {canAdmin && selected.certified ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void mint(selected.id)}
                      className="rounded-lg border border-outline-variant px-md py-1.5 text-[12px]"
                    >
                      Mint embed
                    </button>
                  ) : null}
                </div>

                {embedToken ? (
                  <div className="rounded-xl border border-secondary/40 bg-secondary/5 p-md">
                    <p className="font-label text-[11px] text-secondary">
                      Embed token (once)
                    </p>
                    <pre className="mt-sm overflow-x-auto font-mono text-[11px]">
                      {embedToken}
                    </pre>
                    {embedUrl ? (
                      <p className="mt-sm break-all font-mono text-[11px] text-on-surface-variant">
                        Viewer {embedUrl}
                        {embedApiUrl ? (
                          <>
                            <br />
                            API GET {embedApiUrl}
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <section>
                  <h2 className="font-headline text-base font-semibold text-on-surface-variant">
                    Preview
                  </h2>
                  <div className="mt-md">
                    <BiChartPreview
                      chartType={chartType}
                      rows={previewRows}
                      xField={xField || undefined}
                      yField={yField || undefined}
                    />
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </QueAppChrome>
  )
}

export default BiChartsPage
