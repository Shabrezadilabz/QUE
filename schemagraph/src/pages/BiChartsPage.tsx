import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { BiChartPreview } from '@/components/BiChartPreview'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  apiFetch,
  createBiChartApi,
  createMetricApi,
  deleteBiChartApi,
  fetchBiCharts,
  fetchManagedDatasets,
  fetchMetricsDefs,
  getActiveWorkspaceId,
  getApiBase,
  mintBiEmbedTokenApi,
  previewBiChartApi,
  publishMetricBiApi,
  scaffoldBiReportApi,
  updateBiChartApi,
  type BiChart,
  type ManagedDataset,
} from '@/services/stitchApi'

type MetricDef = {
  id: string
  name: string
  expressionSql: string
  datasetId: string | null
  certified: boolean
  sourceColumnName?: string
}

type Layout = { col: number; row: number; w: number; h: number }

const VISUAL_TYPES = [
  { id: 'bar', label: 'Bar' },
  { id: 'stacked_bar', label: 'Stacked bar' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'pie', label: 'Pie' },
  { id: 'table', label: 'Table' },
  { id: 'kpi', label: 'KPI' },
  { id: 'card', label: 'Card' },
] as const

function layoutOf(c: BiChart): Layout {
  const L = (c.config?.layout || {}) as Partial<Layout>
  return {
    col: Number(L.col ?? 0),
    row: Number(L.row ?? 0),
    w: Math.min(12, Math.max(3, Number(L.w ?? 6))),
    h: Math.min(8, Math.max(2, Number(L.h ?? 4))),
  }
}

function applyFilters(
  rows: Record<string, unknown>[],
  field: string,
  value: string,
): Record<string, unknown>[] {
  if (!field || !value.trim()) return rows
  const q = value.trim().toLowerCase()
  return rows.filter((r) =>
    String(r[field] ?? '')
      .toLowerCase()
      .includes(q),
  )
}

/**
 * Full Report Studio — Metrics + multi-visual BI canvas (Power BI–like).
 */
export function BiChartsPage() {
  const { canWrite, role } = useWorkspaceRole()
  const canAdmin = role === 'admin' || role === 'owner'
  const [searchParams, setSearchParams] = useSearchParams()
  const reportFilter = searchParams.get('report') || ''

  const [ribbon, setRibbon] = useState<
    'home' | 'insert' | 'data' | 'view' | 'format'
  >('home')
  const [charts, setCharts] = useState<BiChart[]>([])
  const [metrics, setMetrics] = useState<MetricDef[]>([])
  const [datasets, setDatasets] = useState<ManagedDataset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewMap, setPreviewMap] = useState<
    Record<string, Record<string, unknown>[]>
  >({})
  const [pageId, setPageId] = useState('page1')

  const [title, setTitle] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [chartType, setChartType] = useState('bar')
  const [xField, setXField] = useState('')
  const [yField, setYField] = useState('')
  const [layout, setLayout] = useState<Layout>({ col: 0, row: 0, w: 6, h: 4 })

  const [metricName, setMetricName] = useState('')
  const [metricExpr, setMetricExpr] = useState('COUNT(*)')
  const [metricDatasetId, setMetricDatasetId] = useState('')

  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [metricPreview, setMetricPreview] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [embedToken, setEmbedToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editMode, setEditMode] = useState(true)

  const selected = useMemo(
    () => charts.find((c) => c.id === selectedId) ?? null,
    [charts, selectedId],
  )

  const pageCharts = useMemo(() => {
    let list = charts
    if (reportFilter) {
      list = list.filter((c) => String(c.config?.reportId || '') === reportFilter)
    }
    list = list.filter(
      (c) => String(c.config?.pageId || 'page1') === pageId,
    )
    return [...list].sort((a, b) => {
      const la = layoutOf(a)
      const lb = layoutOf(b)
      return la.row - lb.row || la.col - lb.col
    })
  }, [charts, reportFilter, pageId])

  const fieldOpts = useMemo(() => {
    const ds = datasets.find((d) => d.id === (selected?.datasetId || datasetId))
    return (ds?.columns || []).map((c) => c.name)
  }, [datasets, selected, datasetId])

  const filterFieldOpts = useMemo(() => {
    const first = pageCharts[0]
    const ds = datasets.find((d) => d.id === first?.datasetId)
    return (ds?.columns || []).map((c) => c.name)
  }, [datasets, pageCharts])

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [c, d, m] = await Promise.all([
        fetchBiCharts(),
        fetchManagedDatasets(),
        fetchMetricsDefs(),
      ])
      const certified = d.items.filter((x) => x.certified)
      setCharts(c)
      setDatasets(certified)
      setMetrics(m)
      setSelectedId((prev) => {
        if (prev && c.some((x) => x.id === prev)) return prev
        return c[0]?.id ?? null
      })
      const firstDs = certified[0]?.id || ''
      if (!datasetId && firstDs) setDatasetId(firstDs)
      if (!metricDatasetId && firstDs) setMetricDatasetId(firstDs)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [datasetId, metricDatasetId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!selected) return
    setTitle(selected.title)
    setChartType(selected.chartType)
    setDatasetId(selected.datasetId || '')
    setXField(String(selected.config?.xField || ''))
    setYField(String(selected.config?.yField || ''))
    setLayout(layoutOf(selected))
  }, [selected?.id])

  async function loadPreview(chartId: string) {
    const rows = await previewBiChartApi(chartId)
    setPreviewMap((prev) => ({ ...prev, [chartId]: rows }))
    return rows
  }

  async function runAll() {
    setBusy(true)
    setError(null)
    try {
      await Promise.all(pageCharts.map((c) => loadPreview(c.id)))
      setToast(`Ran ${pageCharts.length} visual(s)`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (pageCharts.length === 0) return
    void Promise.all(
      pageCharts.slice(0, 12).map((c) =>
        loadPreview(c.id).catch(() => [] as Record<string, unknown>[]),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCharts.map((c) => c.id).join(',')])

  async function scaffold(prompt?: string) {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      const out = await scaffoldBiReportApi({
        title: 'Workspace report',
        datasetId: datasetId || null,
        prompt: prompt || 'Build semantic BI from certified managed data',
      })
      const p = new URLSearchParams(searchParams)
      p.set('report', out.reportId)
      setSearchParams(p, { replace: true })
      setSelectedId(out.charts[0]?.id ?? null)
      setToast(
        `Scaffolded “${out.title}” · ${out.charts.length} visuals on ${out.datasetName}`,
      )
      await reload()
      await Promise.all(out.charts.map((c) => loadPreview(c.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function addVisual(type = chartType) {
    if (!canWrite) return
    setBusy(true)
    try {
      const item = await createBiChartApi({
        title: title.trim() || `New ${type}`,
        chartType: type,
        datasetId: datasetId || null,
        config: {
          xField: xField || undefined,
          yField: yField || undefined,
          layout: { col: 0, row: 99, w: 6, h: 4 },
          reportId: reportFilter || undefined,
          pageId,
        },
      })
      setSelectedId(item.id)
      setToast('Visual inserted')
      await reload()
      await loadPreview(item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveSelected() {
    if (!selected || !canWrite) return
    setBusy(true)
    try {
      await updateBiChartApi(selected.id, {
        title: title.trim() || selected.title,
        chartType,
        datasetId: datasetId || null,
        config: {
          ...selected.config,
          xField: xField || undefined,
          yField: yField || undefined,
          layout,
          pageId,
          reportId: selected.config?.reportId || reportFilter || undefined,
        },
      })
      setToast('Visual saved')
      await reload()
      await loadPreview(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function certifySelected() {
    if (!selected || !canWrite) return
    setBusy(true)
    try {
      await updateBiChartApi(selected.id, { certified: true })
      setToast('Certified')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function deleteSelected() {
    if (!selected || !canWrite) return
    if (!window.confirm(`Delete visual “${selected.title}”?`)) return
    setBusy(true)
    try {
      await deleteBiChartApi(selected.id)
      setSelectedId(null)
      setToast('Visual deleted')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function mintSelected() {
    if (!selected || !canAdmin) return
    setBusy(true)
    try {
      const out = await mintBiEmbedTokenApi(selected.id, { label: 'studio' })
      setEmbedToken(out.token)
      setToast('Embed token minted (once)')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function createMetric() {
    if (!canWrite || !metricName.trim()) return
    setBusy(true)
    try {
      await createMetricApi({
        name: metricName.trim(),
        expressionSql: metricExpr,
        datasetId: metricDatasetId || null,
        tags: ['report-studio'],
      })
      setMetricName('')
      setToast('Metric added')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function certifyMetric(id: string) {
    const ws = getActiveWorkspaceId()
    const res = await apiFetch(`/workspaces/${ws}/metrics-defs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ certified: true }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error || 'certify failed')
    }
    await reload()
  }

  async function previewMetric(id: string) {
    const ws = getActiveWorkspaceId()
    const res = await apiFetch(`/workspaces/${ws}/metrics-defs/${id}/preview`)
    const body = (await res.json().catch(() => ({}))) as {
      value?: unknown
      error?: string
    }
    if (!res.ok) throw new Error(body.error || 'preview failed')
    setMetricPreview(String(body.value ?? '—'))
  }

  const embedUrl = embedToken
    ? `${window.location.origin}/embed/${embedToken}`
    : null

  return (
    <QueAppChrome eyebrow="REPORT STUDIO · FULL BI">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#141820]">
        {/* Title bar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-sm border-b border-outline-variant/30 bg-surface-container-low px-md py-sm">
          <div>
            <h1 className="font-headline text-base font-semibold text-on-surface">
              Report Studio
            </h1>
            <p className="text-[11px] text-on-surface-variant">
              Metrics + visuals · edit · run · certify · embed — schema-first
              managed data only
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={() => void scaffold()}
              className="rounded bg-secondary px-md py-1.5 font-label text-[11px] font-semibold text-on-secondary disabled:opacity-40"
            >
              Build full report
            </button>
            <button
              type="button"
              disabled={busy || pageCharts.length === 0}
              onClick={() => void runAll()}
              className="rounded-lg border border-secondary/50 px-md py-1.5 font-label text-[11px] text-secondary disabled:opacity-40"
            >
              Run all
            </button>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className="rounded-lg border border-outline-variant px-md py-1.5 font-label text-[11px]"
            >
              {editMode ? 'Reading view' : 'Edit view'}
            </button>
            <Link
              to="/ship"
              className="rounded-lg border border-outline-variant px-md py-1.5 font-label text-[11px]"
            >
              Ship
            </Link>
              <Link
                to="/jobs"
                className="rounded-lg border border-outline-variant px-md py-1.5 font-label text-[11px]"
              >
                Jobs · Results
              </Link>
          </div>
        </div>

        {/* Ribbon */}
        <div className="shrink-0 border-b border-outline-variant/25 bg-surface-container-low/90">
          <div className="flex gap-xs px-md pt-sm">
            {(
              [
                ['home', 'Home'],
                ['insert', 'Insert'],
                ['data', 'Data'],
                ['view', 'View'],
                ['format', 'Format'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRibbon(id)}
                className={[
                  'rounded-t px-md py-1.5 font-label text-[11px]',
                  ribbon === id
                    ? 'bg-surface text-secondary'
                    : 'text-on-surface-variant hover:text-on-surface',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-sm border-t border-outline-variant/20 px-md py-sm">
            {ribbon === 'home' ? (
              <>
                <RibbonBtn
                  disabled={!canWrite || busy}
                  onClick={() => void saveSelected()}
                  label="Save"
                />
                <RibbonBtn
                  disabled={!canWrite || busy || !selected}
                  onClick={() => void certifySelected()}
                  label="Certify"
                />
                <RibbonBtn
                  disabled={busy || pageCharts.length === 0}
                  onClick={() => void runAll()}
                  label="Run"
                />
                <RibbonBtn
                  disabled={!canAdmin || busy || !selected?.certified}
                  onClick={() => void mintSelected()}
                  label="Embed"
                />
                <RibbonBtn
                  disabled={!canWrite || busy || !selected}
                  onClick={() => void deleteSelected()}
                  label="Delete"
                  danger
                />
              </>
            ) : null}
            {ribbon === 'insert' ? (
              <>
                {VISUAL_TYPES.map((v) => (
                  <RibbonBtn
                    key={v.id}
                    disabled={!canWrite || busy}
                    onClick={() => {
                      setChartType(v.id)
                      void addVisual(v.id)
                    }}
                    label={v.label}
                  />
                ))}
              </>
            ) : null}
            {ribbon === 'data' ? (
              <p className="font-label text-[11px] text-on-surface-variant">
                Use the left Fields pane — metrics, datasets, and columns.
              </p>
            ) : null}
            {ribbon === 'view' ? (
              <>
                <RibbonBtn
                  onClick={() => setPageId('page1')}
                  label="Page 1"
                  active={pageId === 'page1'}
                />
                <RibbonBtn
                  onClick={() => setPageId('page2')}
                  label="Page 2"
                  active={pageId === 'page2'}
                />
                <RibbonBtn
                  onClick={() => setEditMode(true)}
                  label="Edit"
                  active={editMode}
                />
                <RibbonBtn
                  onClick={() => setEditMode(false)}
                  label="Reading"
                  active={!editMode}
                />
              </>
            ) : null}
            {ribbon === 'format' ? (
              <p className="font-label text-[11px] text-on-surface-variant">
                Select a visual — use the right Format pane for type, axes,
                layout.
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="shrink-0 border-b border-error/40 bg-error/10 px-md py-sm text-[12px] text-error">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="shrink-0 border-b border-secondary/25 bg-secondary/5 px-md py-sm text-[12px] text-secondary">
            {toast}{' '}
            <button type="button" className="underline" onClick={() => setToast(null)}>
              dismiss
            </button>
          </p>
        ) : null}
        {metricPreview != null ? (
          <p className="shrink-0 border-b border-outline-variant/20 px-md py-sm text-[12px] text-secondary">
            Metric run: {metricPreview}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
          {/* Fields */}
          <aside className="min-h-0 overflow-y-auto border-b border-outline-variant/20 lg:col-span-2 lg:border-r lg:border-b-0">
            <SectionTitle>Filters</SectionTitle>
            <div className="space-y-sm px-sm pb-md">
              <select
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
                className="w-full rounded border border-outline-variant/40 bg-surface px-sm py-1 text-[11px]"
              >
                <option value="">Field…</option>
                {filterFieldOpts.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <input
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="Contains…"
                className="w-full rounded border border-outline-variant/40 bg-surface px-sm py-1 text-[11px]"
              />
            </div>

            <SectionTitle>Datasets</SectionTitle>
            <ul className="px-sm pb-md">
              {datasets.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="w-full truncate rounded px-sm py-1 text-left text-[11px] hover:bg-secondary/10"
                    onClick={() => {
                      setDatasetId(d.id)
                      setMetricDatasetId(d.id)
                    }}
                  >
                    {d.name}
                  </button>
                  <ul className="mb-sm ml-sm border-l border-outline-variant/20 pl-sm">
                    {(d.columns || []).slice(0, 16).map((c) => (
                      <li key={c.name}>
                        <button
                          type="button"
                          className="w-full truncate py-0.5 text-left font-mono text-[10px] text-on-surface-variant hover:text-secondary"
                          onClick={() => {
                            if (!xField) setXField(c.name)
                            else setYField(c.name)
                          }}
                          title="Click to set X then Y on selected visual"
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {datasets.length === 0 ? (
                <li className="px-sm text-[11px] text-on-surface-variant">
                  Certify data on{' '}
                  <Link to="/jobs" className="text-secondary underline">
                    Jobs → Results
                  </Link>{' '}
                  after a job run.
                </li>
              ) : null}
            </ul>

            <SectionTitle>Metrics</SectionTitle>
            {canWrite ? (
              <div className="space-y-sm px-sm pb-sm">
                <input
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                  placeholder="Name"
                  className="w-full rounded border border-outline-variant/40 bg-surface px-sm py-1 text-[11px]"
                />
                <input
                  value={metricExpr}
                  onChange={(e) => setMetricExpr(e.target.value)}
                  placeholder="COUNT(*)"
                  className="w-full rounded border border-outline-variant/40 bg-surface px-sm py-1 font-mono text-[10px]"
                />
                <button
                  type="button"
                  disabled={busy || !metricName.trim()}
                  onClick={() => void createMetric()}
                  className="w-full rounded bg-secondary/90 py-1 text-[10px] font-semibold text-on-secondary disabled:opacity-40"
                >
                  Add metric
                </button>
              </div>
            ) : null}
            <ul className="px-sm pb-lg">
              {metrics.map((m) => (
                <li key={m.id} className="border-t border-outline-variant/10 py-sm">
                  <p className="truncate text-[11px] font-semibold">{m.name}</p>
                  <p className="font-mono text-[9px] text-on-surface-variant">
                    {m.expressionSql}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <TinyBtn
                      onClick={() =>
                        void previewMetric(m.id).catch((e) =>
                          setError(String(e.message || e)),
                        )
                      }
                      label="Run"
                    />
                    {canWrite && !m.certified ? (
                      <TinyBtn
                        onClick={() =>
                          void certifyMetric(m.id).catch((e) =>
                            setError(String(e.message || e)),
                          )
                        }
                        label="Certify"
                      />
                    ) : null}
                    {canWrite && m.certified ? (
                      <TinyBtn
                        onClick={() =>
                          void publishMetricBiApi(m.id)
                            .then(() => reload())
                            .then(() => setToast('Published to visuals'))
                            .catch((e) => setError(String(e.message || e)))
                        }
                        label="→ Visual"
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          {/* Canvas */}
          <main className="min-h-0 overflow-auto lg:col-span-7">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-sm border-b border-outline-variant/20 bg-[#141820]/90 px-md py-sm backdrop-blur">
              <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
                Canvas · {pageId}
                {reportFilter ? ` · report ${reportFilter.slice(0, 8)}` : ''}
              </p>
              <p className="text-[10px] text-on-surface-variant">
                {pageCharts.length} visual(s)
              </p>
            </div>

            {pageCharts.length === 0 ? (
              <div className="flex min-h-[24rem] flex-col items-center justify-center gap-md p-lg text-center">
                <p className="max-w-md text-[13px] text-on-surface-variant">
                    Empty report. After a job run, open{' '}
                    <Link to="/jobs" className="text-secondary underline">
                      Jobs → Results
                    </Link>{' '}
                    to preview/certify the managed table, then build a full
                    multi-visual report — or Insert visuals from the ribbon.
                </p>
                {canWrite ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void scaffold()}
                    className="rounded bg-secondary px-lg py-2 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                  >
                    Build full report
                  </button>
                ) : null}
              </div>
            ) : (
              <div
                className="grid gap-sm p-md"
                style={{
                  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                  gridAutoRows: 'minmax(4.5rem, auto)',
                }}
              >
                {pageCharts.map((c) => {
                  const L = layoutOf(c)
                  const raw = previewMap[c.id] || []
                  const rows = applyFilters(raw, filterField, filterValue)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id)
                        setRibbon('format')
                      }}
                      className={[
                        'overflow-hidden rounded-lg border bg-surface-container-low/80 p-sm text-left transition-shadow',
                        selectedId === c.id
                          ? 'border-secondary shadow-[0_0_0_1px_var(--color-secondary)]'
                          : 'border-outline-variant/30 hover:border-secondary/40',
                      ].join(' ')}
                      style={{
                        gridColumn: `${L.col + 1} / span ${L.w}`,
                        gridRow: `span ${L.h}`,
                        minHeight: `${L.h * 3.2}rem`,
                      }}
                    >
                      <div className="mb-sm flex items-center justify-between gap-sm">
                        <p className="truncate font-label text-[11px] font-semibold">
                          {c.title}
                        </p>
                        <span className="shrink-0 font-label text-[9px] uppercase text-on-surface-variant">
                          {c.chartType}
                          {c.certified ? ' · ✓' : ''}
                        </span>
                      </div>
                      <BiChartPreview
                        chartType={c.chartType}
                        rows={rows}
                        xField={String(c.config?.xField || '') || undefined}
                        yField={String(c.config?.yField || '') || undefined}
                        compact
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </main>

          {/* Format / visualizations */}
          <aside className="min-h-0 overflow-y-auto border-t border-outline-variant/20 lg:col-span-3 lg:border-t-0 lg:border-l">
            <SectionTitle>Visualizations</SectionTitle>
            {!selected ? (
              <p className="px-md text-[12px] text-on-surface-variant">
                Select a tile on the canvas.
              </p>
            ) : (
              <div className="space-y-md px-md pb-lg">
                <div className="flex flex-wrap gap-1">
                  {VISUAL_TYPES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={!canWrite || !editMode}
                      onClick={() => setChartType(v.id)}
                      className={[
                        'rounded px-sm py-1 font-label text-[10px]',
                        chartType === v.id
                          ? 'bg-secondary text-on-secondary'
                          : 'border border-outline-variant text-on-surface-variant',
                      ].join(' ')}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <Field
                  label="Title"
                  value={title}
                  onChange={setTitle}
                  disabled={!canWrite || !editMode}
                />
                <label className="block text-[10px] text-on-surface-variant">
                  Dataset
                  <select
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    disabled={!canWrite || !editMode}
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface px-sm py-1.5 text-[12px]"
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
                  <label className="block text-[10px] text-on-surface-variant">
                    X / Legend
                    <select
                      value={xField}
                      onChange={(e) => setXField(e.target.value)}
                      disabled={!canWrite || !editMode}
                      className="mt-1 w-full rounded border border-outline-variant/40 bg-surface px-sm py-1.5 text-[12px]"
                    >
                      <option value="">Auto</option>
                      {fieldOpts.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[10px] text-on-surface-variant">
                    Y / Values
                    <select
                      value={yField}
                      onChange={(e) => setYField(e.target.value)}
                      disabled={!canWrite || !editMode}
                      className="mt-1 w-full rounded border border-outline-variant/40 bg-surface px-sm py-1.5 text-[12px]"
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

                <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
                  Layout (12-col grid)
                </p>
                <div className="grid grid-cols-4 gap-sm">
                  {(
                    [
                      ['col', layout.col, 0, 11],
                      ['row', layout.row, 0, 40],
                      ['w', layout.w, 3, 12],
                      ['h', layout.h, 2, 8],
                    ] as const
                  ).map(([key, val, min, max]) => (
                    <label
                      key={key}
                      className="block text-[10px] text-on-surface-variant"
                    >
                      {key}
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={val}
                        disabled={!canWrite || !editMode}
                        onChange={(e) =>
                          setLayout((L) => ({
                            ...L,
                            [key]: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full rounded border border-outline-variant/40 bg-surface px-sm py-1 text-[12px]"
                      />
                    </label>
                  ))}
                </div>

                <div className="flex flex-col gap-sm pt-sm">
                  <button
                    type="button"
                    disabled={!canWrite || busy || !editMode}
                    onClick={() => void saveSelected()}
                    className="rounded-lg border border-secondary px-md py-1.5 text-[12px] font-semibold text-secondary disabled:opacity-40"
                  >
                    Apply / Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void loadPreview(selected.id).then(() =>
                        setToast('Preview refreshed'),
                      )
                    }
                    className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                  >
                    Run visual
                  </button>
                  {canWrite && !selected.certified ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void certifySelected()}
                      className="rounded-lg border border-outline-variant px-md py-1.5 text-[12px] disabled:opacity-40"
                    >
                      Certify
                    </button>
                  ) : null}
                  {canAdmin && selected.certified ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void mintSelected()}
                      className="rounded-lg border border-outline-variant px-md py-1.5 text-[12px] disabled:opacity-40"
                    >
                      Mint embed
                    </button>
                  ) : null}
                </div>

                {embedToken ? (
                  <div className="rounded border border-secondary/40 bg-secondary/5 p-sm">
                    <p className="font-label text-[10px] text-secondary">
                      Embed (once)
                    </p>
                    <pre className="mt-1 overflow-x-auto font-mono text-[9px]">
                      {embedToken}
                    </pre>
                    {embedUrl ? (
                      <p className="mt-1 break-all font-mono text-[9px] text-on-surface-variant">
                        {embedUrl}
                        <br />
                        {getApiBase()}/bi/embed/{embedToken}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    </QueAppChrome>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="px-md py-sm font-label text-[10px] font-bold tracking-widest text-secondary uppercase">
      {children}
    </p>
  )
}

function RibbonBtn({
  label,
  onClick,
  disabled,
  danger,
  active,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded px-md py-1.5 font-label text-[11px] disabled:opacity-40',
        active
          ? 'bg-secondary text-on-secondary'
          : danger
            ? 'border border-error/40 text-error'
            : 'border border-outline-variant text-on-surface',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function TinyBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-outline-variant px-sm py-px text-[9px]"
    >
      {label}
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-[10px] text-on-surface-variant">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded border border-outline-variant/40 bg-surface px-sm py-1.5 text-[12px] text-on-surface"
      />
    </label>
  )
}

export default BiChartsPage
