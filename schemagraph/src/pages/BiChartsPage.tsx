import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { BiChartPreview } from '@/components/BiChartPreview'
import { MetricLiveValue } from '@/components/bi/MetricLiveValue'
import { BoardFilterBar } from '@/components/bi/BoardFilterBar'
import { StudioBoardSchedulePanel } from '@/components/bi/StudioBoardSchedulePanel'
import { StudioEmptyBoard } from '@/components/bi/StudioEmptyBoard'
import { StudioQueMlPanel } from '@/components/bi/StudioQueMlPanel'
import { StudioWidgetRunPanel } from '@/components/bi/StudioWidgetRunPanel'
import { StudioWidgetPlaceholder } from '@/components/bi/StudioWidgetPlaceholder'
import { StudioCanvasTile } from '@/components/bi/StudioCanvasTile'
import { DrillToSqlPanel } from '@/components/bi/DrillToSqlPanel'
import { StudioQueExprPanel } from '@/components/bi/StudioQueExprPanel'
import {
  PdfPageHeader,
  PdfPrimaryButton,
  PdfGhostButton,
} from '@/components/pdf/PdfUi'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
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
  executeBiChartApi,
  previewMetricApi,
  publishMetricBiApi,
  scaffoldBiReportApi,
  updateBiChartApi,
  fetchBiChartDrillSql,
  fetchLookerExport,
  fetchMetabaseExport,
  fetchPowerBiExport,
  fetchTableauExport,
  fetchReportBoardConfig,
  applyBoardLayoutApi,
  previewBoardAllApi,
  fetchStudioSummary,
  fetchBiAccessSummary,
  type BiChart,
  type BiAccessSummary,
  type ManagedDataset,
  type StudioSummary,
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

function isChartWarehouseBound(c: BiChart): boolean {
  return Boolean(c.config?.sqlFallback || c.config?.warehouseSql || c.datasetId)
}

/**
 * Full Report Studio — Metrics + multi-visual BI canvas (Power BI–like).
 */
export function BiChartsPage() {
  const { canWrite, role } = useWorkspaceRole()
  const canAdmin = role === 'admin' || role === 'owner'
  const [searchParams, setSearchParams] = useSearchParams()
  const reportFilter = searchParams.get('report') || ''
  const { page: autofillPage } = usePageAutofill('bi')

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
  const [previewMeta, setPreviewMeta] = useState<
    Record<string, { source?: string; cached?: boolean; durationMs?: number }>
  >({})
  const [pageId, setPageId] = useState('page1')

  const [title, setTitle] = useState('')
  const [datasetId, setDatasetId] = useState('')
  const [chartType, setChartType] = useState('bar')
  const [xField, setXField] = useState('')
  const [yField, setYField] = useState('')
  const [yExpr, setYExpr] = useState('')
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
  const [studioSummary, setStudioSummary] = useState<StudioSummary | null>(null)
  const [biAccess, setBiAccess] = useState<BiAccessSummary | null>(null)
  const paramAutoApplyReady = useRef(false)
  const [editMode, setEditMode] = useState(true)
  const [drillSql, setDrillSql] = useState<string | null>(null)
  const [boardLayout, setBoardLayout] = useState('executive')
  const [boardParams, setBoardParams] = useState<
    { id: string; label: string; defaultValue?: string; bindField?: string }[]
  >([])
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({})
  const [crossFilter, setCrossFilter] = useState<{
    field: string
    value: string
    fromChart?: string
  } | null>(null)
  const [boardFilterVersion, setBoardFilterVersion] = useState(0)
  const [layoutDrafts, setLayoutDrafts] = useState<
    Record<string, Partial<Layout>>
  >({})

  const selected = useMemo(
    () => charts.find((c) => c.id === selectedId) ?? null,
    [charts, selectedId],
  )

  const pageCharts = useMemo(() => {
    let list = charts
    if (reportFilter) {
      list = list.filter(
        (c) =>
          String(c.config?.reportId || '') === reportFilter ||
          String(c.config?.dashboardId || '') === reportFilter,
      )
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

  const warehouseUnbound = useMemo(
    () => pageCharts.filter((c) => !isChartWarehouseBound(c)).length,
    [pageCharts],
  )

  function effectiveLayout(c: BiChart): Layout {
    const base = layoutOf(c)
    const draft = layoutDrafts[c.id]
    return draft ? { ...base, ...draft } : base
  }

  async function commitChartLayout(chartId: string, patch: Partial<Layout>) {
    const chart = charts.find((c) => c.id === chartId)
    if (!chart || !canWrite) return
    const newLayout = { ...layoutOf(chart), ...patch }
    setLayoutDrafts((prev) => {
      const next = { ...prev }
      delete next[chartId]
      return next
    })
    try {
      await updateBiChartApi(chartId, {
        config: { ...chart.config, layout: newLayout },
      })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

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
      const [c, d, m, studio, access] = await Promise.all([
        fetchBiCharts(),
        fetchManagedDatasets(),
        fetchMetricsDefs(),
        fetchStudioSummary().catch(() => null),
        fetchBiAccessSummary().catch(() => null),
      ])
      const certified = d.items.filter((x) => x.certified)
      setCharts(c)
      setDatasets(certified)
      setMetrics(m)
      setStudioSummary(studio)
      setBiAccess(access)
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
    const rid = reportFilter || 'sportedge-exec'
    void fetchReportBoardConfig(rid)
      .then((c) => {
        setBoardLayout(c.layoutPreset)
        setBoardParams(c.parameters || [])
        const init: Record<string, string> = {}
        for (const p of c.parameters || []) {
          init[p.id] = p.defaultValue ?? ''
        }
        setParameterValues(init)
      })
      .catch(() => {
        /* optional */
      })
  }, [reportFilter])

  const boardPreviewOpts = useMemo(
    () => ({
      filters: filterField && filterValue.trim()
        ? [{ field: filterField, op: 'contains' as const, value: filterValue.trim() }]
        : undefined,
      parameters: boardParams,
      parameterOverrides: parameterValues,
      crossFilter,
    }),
    [filterField, filterValue, boardParams, parameterValues, crossFilter],
  )

  useEffect(() => {
    if (!boardParams.length) return
    if (!paramAutoApplyReady.current) {
      paramAutoApplyReady.current = true
      return
    }
    const t = window.setTimeout(() => {
      void applyBoardFilters()
    }, 500)
    return () => window.clearTimeout(t)
  }, [parameterValues])

  async function applyBoardFilters(overrideCross = crossFilter) {
    setBoardFilterVersion((v) => v + 1)
    setBusy(true)
    try {
      const rid = reportFilter || 'sportedge-exec'
      const results = await previewBoardAllApi(rid, {
        filters: filterField && filterValue.trim()
          ? [{ field: filterField, op: 'contains', value: filterValue.trim() }]
          : undefined,
        parameters: boardParams,
        parameterOverrides: parameterValues,
        crossFilter: overrideCross,
        skipCache: true,
      })
      const next: Record<string, Record<string, unknown>[]> = {}
      for (const r of results) {
        next[r.chartId] = r.rows
      }
      setPreviewMap((prev) => ({ ...prev, ...next }))
      setToast(`Applied filters to ${results.length} visual(s) via warehouse SQL`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function applyLayoutPreset(preset: string) {
    if (!canWrite) return
    setBusy(true)
    try {
      const rid = reportFilter || 'sportedge-exec'
      const out = await applyBoardLayoutApi(rid, preset)
      setBoardLayout(preset)
      await reload()
      setToast(`Layout “${preset}” applied to ${out.updatedCount} visual(s)`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!selected?.id) {
      setDrillSql(null)
      return
    }
    void fetchBiChartDrillSql(selected.id, { crossFilter })
      .then((r) => setDrillSql(r.sql))
      .catch(() => setDrillSql(null))
  }, [selected?.id, crossFilter])

  async function exportBoard(format: 'looker' | 'metabase' | 'powerbi' | 'tableau') {
    setBusy(true)
    setError(null)
    try {
      const reportId = reportFilter || 'sportedge-exec'
      let payload: unknown
      if (format === 'looker') payload = await fetchLookerExport({ reportId })
      else if (format === 'metabase') payload = await fetchMetabaseExport({ reportId })
      else if (format === 'powerbi') payload = await fetchPowerBiExport({ reportId })
      else payload = await fetchTableauExport({ reportId })
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `que-${format}-${reportId}.json`
      a.click()
      URL.revokeObjectURL(url)
      setToast(`Exported ${format} pack for ${reportId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!selected) return
    setTitle(selected.title)
    setChartType(selected.chartType)
    setDatasetId(selected.datasetId || '')
    setXField(String(selected.config?.xField || ''))
    setYField(String(selected.config?.yField || ''))
    setYExpr(String(selected.config?.yExpr || ''))
    setLayout(layoutOf(selected))
  }, [selected?.id])

  async function loadPreview(chartId: string, opts?: { forceWarehouse?: boolean }) {
    const useExecute =
      opts?.forceWarehouse ||
      boardFilterVersion > 0 ||
      Boolean(crossFilter) ||
      Boolean(filterField && filterValue.trim())
    const out = useExecute
      ? await executeBiChartApi(chartId, {
          ...boardPreviewOpts,
          skipCache: true,
        })
      : await previewBiChartApi(chartId, undefined, {
          ...boardPreviewOpts,
          skipCache: boardFilterVersion > 0,
        })
    setPreviewMap((prev) => ({ ...prev, [chartId]: out.rows }))
    setPreviewMeta((prev) => ({
      ...prev,
      [chartId]: {
        source: out.source,
        cached: out.cached,
        durationMs: out.durationMs,
      },
    }))
    return out.rows
  }

  async function runAll() {
    setBusy(true)
    setError(null)
    try {
      await Promise.all(
        pageCharts.map((c) => loadPreview(c.id, { forceWarehouse: true })),
      )
      setToast(`Ran ${pageCharts.length} visual(s) on Que Warehouse`)
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
        loadPreview(c.id, { forceWarehouse: true }).catch(
          () => [] as Record<string, unknown>[],
        ),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCharts.map((c) => c.id).join(','), boardFilterVersion])

  function handleSegmentClick(chart: BiChart, field: string, value: string) {
    if (
      crossFilter?.field === field &&
      crossFilter?.value === value &&
      crossFilter?.fromChart === chart.title
    ) {
      setCrossFilter(null)
      void applyBoardFilters(null)
      setDrillSql(null)
      return
    }
    const cf = { field, value, fromChart: chart.title }
    setCrossFilter(cf)
    void applyBoardFilters(cf)
    void fetchBiChartDrillSql(chart.id, { crossFilter: cf })
      .then((r) => setDrillSql(r.sql))
      .catch(() => setDrillSql(null))
    setSelectedId(chart.id)
    setRibbon('format')
  }

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
          yExpr: yExpr.trim() || undefined,
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
    const out = await previewMetricApi(id)
    setMetricPreview(String(out.value ?? '—'))
  }

  const embedUrl = embedToken
    ? `${window.location.origin}/embed/${embedToken}`
    : null

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title={
            <span className="inline-flex items-center gap-[10px]">
              Certified BI Dashboard
              <span
                className="inline-flex size-[22px] items-center justify-center rounded-full border border-solid border-[rgba(122,236,208,0.45)] bg-[rgba(122,236,208,0.12)] text-[11px] text-[#7aecd0]"
                title="Certified workspace"
              >
                ✓
              </span>
            </span>
          }
          subtitle="Managed datasets, certified visualizations, and strict compliance."
          actions={
            <div className="flex flex-wrap items-center gap-[8px]">
              <Link to="/studio/grid">
                <PdfGhostButton type="button">Grid explore</PdfGhostButton>
              </Link>
              <PdfGhostButton type="button" onClick={() => setRibbon('data')}>
                ⊙ Filter
              </PdfGhostButton>
              <PdfGhostButton type="button" disabled={busy} onClick={() => void runAll()}>
                Run all
              </PdfGhostButton>
              <PdfGhostButton type="button" onClick={() => setEditMode((v) => !v)}>
                {editMode ? 'Reading view' : 'Edit view'}
              </PdfGhostButton>
              {canWrite ? (
                <PdfPrimaryButton
                  type="button"
                  disabled={busy}
                  onClick={() => void addVisual()}
                >
                  + Create New Chart
                </PdfPrimaryButton>
              ) : null}
            </div>
          }
        />

        {/* Power BI / Sigma-style ribbon */}
        <div className="shrink-0 border-b border-solid border-[#424850] bg-[#0f1215]">
          <div className="flex gap-[4px] px-[16px] pt-[8px]">
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
                  'rounded-t-[4px] px-[14px] py-[7px] text-[11px] font-semibold',
                  ribbon === id
                    ? 'border border-b-0 border-solid border-[#424850] bg-[#111416] text-[#d4dbe3]'
                    : 'text-[#a3afbe] hover:text-[#d4dbe3]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-[8px] border-t border-solid border-[#424850] px-[16px] py-[10px]">
            {ribbon === 'home' ? (
              <>
                <RibbonBtn disabled={!canWrite || busy} onClick={() => void saveSelected()} label="Save" />
                <RibbonBtn disabled={!canWrite || busy || !selected} onClick={() => void certifySelected()} label="Certify" />
                <RibbonBtn disabled={busy || pageCharts.length === 0} onClick={() => void runAll()} label="Run" />
                <RibbonBtn disabled={!canWrite || busy} onClick={() => void scaffold()} label="Build report" />
                <RibbonBtn
                  disabled={busy}
                  onClick={() => {
                    const p = new URLSearchParams(searchParams)
                    p.set('report', 'sportedge-exec')
                    setSearchParams(p, { replace: true })
                    setToast('SportEdge exec board filter applied')
                  }}
                  label="SportEdge board"
                />
                <RibbonBtn disabled={busy} onClick={() => void exportBoard('looker')} label="Export Looker" />
                <RibbonBtn disabled={busy} onClick={() => void exportBoard('metabase')} label="Metabase" />
                <RibbonBtn disabled={busy} onClick={() => void exportBoard('powerbi')} label="Power BI" />
                <RibbonBtn disabled={busy} onClick={() => void exportBoard('tableau')} label="Tableau" />
                <RibbonBtn disabled={!canAdmin || busy || !selected?.certified} onClick={() => void mintSelected()} label="Embed" />
                <RibbonBtn disabled={!canWrite || busy || !selected} onClick={() => void deleteSelected()} label="Delete" danger />
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
              <div className="flex flex-wrap items-center gap-[8px]">
                <p className="text-[11px] text-[#a3afbe]">
                  Certified datasets only — parameters:
                </p>
                {boardParams.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-[4px] border border-solid border-[#424850] px-[8px] py-[4px] text-[10px] text-[#c8cdd3]"
                  >
                    {p.label}: {p.defaultValue || '—'}
                  </span>
                ))}
              </div>
            ) : null}
            {ribbon === 'view' ? (
              <>
                <RibbonBtn onClick={() => setPageId('page1')} label="Page 1" active={pageId === 'page1'} />
                <RibbonBtn onClick={() => setPageId('page2')} label="Page 2" active={pageId === 'page2'} />
                {(['executive', 'ops', 'mobile'] as const).map((preset) => (
                  <RibbonBtn
                    key={preset}
                    disabled={!canWrite || busy}
                    onClick={() => void applyLayoutPreset(preset)}
                    label={`Layout: ${preset}`}
                    active={boardLayout === preset}
                  />
                ))}
                <RibbonBtn onClick={() => setEditMode(true)} label="Edit" active={editMode} />
                <RibbonBtn onClick={() => setEditMode(false)} label="Reading" active={!editMode} />
              </>
            ) : null}
            {ribbon === 'format' ? (
              <p className="text-[11px] text-[#a3afbe]">
                Select a visual — configure type, axes, and layout in the right pane.
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="shrink-0 border-b border-solid border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)] px-[16px] py-[8px] text-[12px] text-[#ff6b6b]">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="shrink-0 border-b border-solid border-[#424850] bg-[#0f1215] px-[16px] py-[8px] text-[12px] text-[#7aecd0]">
            {toast}{' '}
            <button type="button" className="underline" onClick={() => setToast(null)}>
              dismiss
            </button>
          </p>
        ) : null}
        {ribbon === 'view' ? (
          <div className="shrink-0 px-[16px] pb-[8px]">
            <StudioBoardSchedulePanel
              reportId={reportFilter || 'sportedge-exec'}
              canWrite={canWrite}
              onRefreshAll={() => void runAll()}
              onToast={(msg) => setToast(msg)}
            />
            <StudioQueMlPanel reportId={reportFilter || 'sportedge-exec'} />
          </div>
        ) : null}
        {crossFilter ? (
          <div className="shrink-0 border-b border-[#7aecd0]/20 bg-[#7aecd0]/5 px-[16px] py-[8px] text-[11px] text-[#7aecd0]">
            Cross-filter active: {crossFilter.field} = {crossFilter.value}
            {crossFilter.fromChart ? ` (from ${crossFilter.fromChart})` : ''}
            {drillSql ? ' · drill SQL ready in right rail' : ''}
            <span className="ml-[8px] text-[#a3afbe]">· click same segment again to clear</span>
          </div>
        ) : null}
        {metricPreview != null ? (
          <p className="shrink-0 border-b border-solid border-[#424850] px-[16px] py-[8px] text-[12px] text-[#c8cdd3]">
            Metric run: {metricPreview}
          </p>
        ) : null}

        <BoardFilterBar
          parameters={boardParams}
          parameterValues={parameterValues}
          onParameterChange={(id, value) =>
            setParameterValues((prev) => ({ ...prev, [id]: value }))
          }
          filterField={filterField}
          filterValue={filterValue}
          onFilterFieldChange={setFilterField}
          onFilterValueChange={setFilterValue}
          crossFilter={crossFilter}
          onClearCrossFilter={() => {
            setCrossFilter(null)
            void applyBoardFilters(null)
          }}
          fieldOptions={filterFieldOpts}
          onApply={() => void applyBoardFilters()}
          busy={busy}
        />

        <div className="flex min-h-0 flex-1">
          {/* Data explorer — Sigma-style left rail */}
          <aside className="hidden w-[240px] shrink-0 flex-col overflow-y-auto border-r border-solid border-[#424850] bg-[#0f1215] lg:flex">
            <SectionTitle>Filters</SectionTitle>
            <div className="space-y-[8px] px-[12px] pb-[12px]">
              <select
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
                className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[7px] text-[11px] text-[#d4dbe3]"
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
                className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[7px] text-[11px] text-[#d4dbe3] placeholder:text-[#6b7380]"
              />
            </div>

            <SectionTitle>Datasets</SectionTitle>
            <ul className="px-[12px] pb-[12px]">
              {datasets.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="w-full truncate rounded-[4px] px-[8px] py-[6px] text-left text-[11px] text-[#d4dbe3] hover:bg-[#1e2328]"
                    onClick={() => {
                      setDatasetId(d.id)
                      setMetricDatasetId(d.id)
                    }}
                  >
                    {d.name}
                  </button>
                  <ul className="mb-[8px] ml-[8px] border-l border-solid border-[#424850] pl-[8px]">
                    {(d.columns || []).slice(0, 16).map((c) => (
                      <li key={c.name}>
                        <button
                          type="button"
                          className="w-full truncate py-[3px] text-left font-mono text-[10px] text-[#a3afbe] hover:text-[#7aecd0]"
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
                <li className="px-[8px] text-[11px] text-[#a3afbe]">
                  Certify data on{' '}
                  <Link to="/jobs" className="text-[#d0d8e0] underline">
                    Jobs → Results
                  </Link>{' '}
                  after a job run.
                </li>
              ) : null}
            </ul>

            <SectionTitle>Metrics</SectionTitle>
            {canWrite ? (
              <div className="space-y-[8px] px-[12px] pb-[8px]">
                <input
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                  placeholder="Name"
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[7px] text-[11px] text-[#d4dbe3]"
                />
                <input
                  value={metricExpr}
                  onChange={(e) => setMetricExpr(e.target.value)}
                  placeholder="COUNT(*)"
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[7px] font-mono text-[10px] text-[#d4dbe3]"
                />
                <button
                  type="button"
                  disabled={busy || !metricName.trim()}
                  onClick={() => void createMetric()}
                  className="pdf-btn-ghost w-full py-[6px] text-[10px] font-semibold disabled:opacity-40"
                >
                  Add metric
                </button>
              </div>
            ) : null}
            <ul className="px-[12px] pb-[16px]">
              {metrics.map((m) => (
                <li key={m.id} className="border-t border-solid border-[#424850]/60 py-[8px]">
                  <p className="truncate text-[11px] font-semibold text-[#d4dbe3]">{m.name}</p>
                  <p className="font-mono text-[9px] text-[#8a9099]">{m.expressionSql}</p>
                  <div className="mt-[6px] flex flex-wrap gap-[4px]">
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

          {/* Canvas — dashboard / report studio */}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#111416]">
            <div className="px-[16px] pt-[12px] lg:px-[24px]">
              <PageAutofillBanner page={autofillPage} compact />
              {studioSummary ? (
                <div className="mt-[10px] grid gap-[8px] sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: 'Widgets',
                      value: studioSummary.readiness.chartCount,
                      sub: `${studioSummary.readiness.warehouseWidgets} WH-bound`,
                    },
                    {
                      label: 'Certified',
                      value: studioSummary.readiness.certifiedCharts,
                      sub: 'board widgets',
                    },
                    {
                      label: 'Metrics',
                      value: studioSummary.readiness.metricCount,
                      sub: 'hover = live WH',
                    },
                    {
                      label: 'Grid tables',
                      value: studioSummary.gridTableCount,
                      sub: studioSummary.readiness.label,
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-[8px] border border-[#424850] bg-[#0f1215] px-[12px] py-[8px]"
                    >
                      <div className="text-[10px] uppercase tracking-wider text-[#8a9099]">
                        {card.label}
                      </div>
                      <div className="text-[18px] font-semibold text-[#d4dbe3]">
                        {card.value}
                      </div>
                      <div className="text-[10px] text-[#6b7380]">{card.sub}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {biAccess && !biAccess.unrestricted ? (
                <div className="mt-[8px] rounded-[8px] border border-[#f0a020]/30 bg-[#f0a020]/10 px-[12px] py-[8px] text-[11px] text-[#f0a020]">
                  BI access policy active — {biAccess.groupCount} group(s)
                  {biAccess.allowedTableCount
                    ? ` · ${biAccess.allowedTableCount} allowed table(s)`
                    : ''}
                  {biAccess.restrictedColumnCount
                    ? ` · ${biAccess.restrictedColumnCount} restricted column(s)`
                    : ''}
                  {biAccess.rowFilterCount
                    ? ` · ${biAccess.rowFilterCount} row filter(s)`
                    : ''}
                  .{' '}
                  <Link to="/settings/bi-access" className="underline">
                    Manage groups
                  </Link>
                </div>
              ) : null}
            </div>
            {pageCharts.length === 0 ? (
              <StudioEmptyBoard
                canWrite={canWrite}
                busy={busy}
                hasDatasets={datasets.length > 0}
                onScaffold={() => void scaffold()}
              />
            ) : (
              <div className="flex flex-col gap-[16px] p-[16px] lg:p-[24px]">
                <div className="flex items-center justify-between gap-[8px]">
                  <p className="text-[10px] font-bold tracking-[0.8px] text-[#8a9099] uppercase">
                    Canvas · {pageId}
                    {reportFilter ? ` · report ${reportFilter.slice(0, 8)}` : ''}
                  </p>
                  <p className="text-[10px] text-[#8a9099]">{pageCharts.length} visual(s)</p>
                </div>
                {warehouseUnbound > 0 ? (
                  <div className="rounded-[8px] border border-[#f0a020]/30 bg-[#f0a020]/10 px-[12px] py-[8px] text-[11px] text-[#f0a020]">
                    {warehouseUnbound} visual(s) are not warehouse-bound — add sqlFallback or
                    assign a certified dataset before publishing.
                  </div>
                ) : null}

                <div
                  data-studio-grid
                  className="grid gap-[12px]"
                  style={{
                    gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                    gridAutoRows: 'minmax(4.5rem, auto)',
                  }}
                >
                  {pageCharts.map((c) => {
                    const L = effectiveLayout(c)
                    const raw = previewMap[c.id] || []
                    const meta = previewMeta[c.id]
                    const bound = isChartWarehouseBound(c)
                    const rows =
                      boardFilterVersion > 0 || crossFilter
                        ? raw
                        : applyFilters(raw, filterField, filterValue)
                    const isKpi = c.chartType === 'kpi' || c.chartType === 'card'
                    const isCrossSource =
                      crossFilter?.fromChart === c.title
                    const isCrossDimmed =
                      Boolean(crossFilter) && !isCrossSource
                    const segmentCrossFilter =
                      crossFilter &&
                      String(c.config?.xField || '') === crossFilter.field
                        ? { field: crossFilter.field, value: crossFilter.value }
                        : isCrossSource
                          ? crossFilter
                          : null
                    const showPlaceholder =
                      !bound ||
                      meta?.source === 'warehouse_only' ||
                      (meta != null && rows.length === 0)

                    return (
                      <StudioCanvasTile
                        key={c.id}
                        chart={c}
                        layout={L}
                        editMode={editMode}
                        canWrite={canWrite}
                        selected={selectedId === c.id}
                        crossFilterSource={isCrossSource}
                        crossFilterDimmed={isCrossDimmed}
                        onSelect={() => {
                          setSelectedId(c.id)
                          setRibbon('format')
                        }}
                        onLayoutDraft={(patch) =>
                          setLayoutDrafts((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], ...patch },
                          }))
                        }
                        onLayoutCommit={(patch) => void commitChartLayout(c.id, patch)}
                      >
                        <div className="mb-[10px] flex items-center justify-between gap-[8px]">
                          <p className="truncate text-[13px] font-semibold text-[#d4dbe3]">
                            {c.title}
                          </p>
                          <span className="shrink-0 text-[9px] font-bold tracking-[0.6px] text-[#8a9099] uppercase">
                            {c.chartType}
                            {c.certified ? ' · ✓' : ''}
                            {previewMeta[c.id]?.source === 'que_warehouse'
                              ? ' · WH'
                              : previewMeta[c.id]?.source === 'warehouse_only'
                                ? ' · WH?'
                                : ''}
                            {!bound ? ' · ⚠' : ''}
                          </span>
                        </div>
                        {showPlaceholder ? (
                          <StudioWidgetPlaceholder
                            title={c.title}
                            reason={
                              !bound
                                ? 'unbound'
                                : meta?.source === 'warehouse_only'
                                  ? 'warehouse'
                                  : 'empty'
                            }
                            compact={isKpi}
                          />
                        ) : isKpi ? (
                          <MetricLiveValue
                            compact
                            label={String(c.config?.yField || 'KPI')}
                            initialValue={
                              rows[0]?.[String(c.config?.yField || 'value')] ??
                              rows[0]?.value ??
                              rows.length
                            }
                            fetchLive={async () => {
                              const out = await executeBiChartApi(c.id, {
                                skipCache: true,
                              })
                              const y = String(c.config?.yField || 'value')
                              const val =
                                out.rows[0]?.[y] ??
                                out.rows[0]?.value ??
                                out.rows.length
                              return {
                                value: val,
                                source: out.source,
                                cached: out.cached,
                              }
                            }}
                          />
                        ) : (
                          <BiChartPreview
                            chartType={c.chartType}
                            rows={rows}
                            xField={String(c.config?.xField || '') || undefined}
                            yField={
                              String(c.config?.yExpr ? 'measure_value' : c.config?.yField || '') ||
                              undefined
                            }
                            compact
                            activeCrossFilter={segmentCrossFilter}
                            onSegmentClick={(field, value) =>
                              handleSegmentClick(c, field, value)
                            }
                          />
                        )}
                        <div className="mt-[10px] flex items-center justify-between text-[10px] text-[#6b7380]">
                          <span>Last updated: live</span>
                          {c.certified ? (
                            <span className="text-[#7aecd0]">Mint Embed &lt;&gt;</span>
                          ) : null}
                        </div>
                      </StudioCanvasTile>
                    )
                  })}
                </div>
              </div>
            )}
          </main>

          {/* Format / properties — right rail */}
          <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-l border-solid border-[#424850] bg-[#0f1215] lg:flex">
            <SectionTitle>Visualizations</SectionTitle>
            {!selected ? (
              <p className="px-[16px] text-[12px] text-[#a3afbe]">
                Select a tile on the canvas to edit fields, type, and layout.
              </p>
            ) : (
              <div className="space-y-[14px] px-[16px] pb-[24px]">
                <div className="flex flex-wrap gap-[4px]">
                  {VISUAL_TYPES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={!canWrite || !editMode}
                      onClick={() => setChartType(v.id)}
                      className={[
                        'rounded-[4px] px-[8px] py-[4px] text-[10px] font-semibold',
                        chartType === v.id
                          ? 'border border-solid border-[#d0d8e0]/40 bg-[#2e343b] text-[#d4dbe3]'
                          : 'border border-solid border-[#424850] text-[#a3afbe]',
                      ].join(' ')}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <Field label="Title" value={title} onChange={setTitle} disabled={!canWrite || !editMode} />
                <label className="block text-[10px] text-[#a3afbe]">
                  Dataset
                  <select
                    value={datasetId}
                    onChange={(e) => setDatasetId(e.target.value)}
                    disabled={!canWrite || !editMode}
                    className="mt-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[8px] text-[12px] text-[#d4dbe3]"
                  >
                    <option value="">None</option>
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        ✓ {d.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-[4px] block text-[9px] text-[#7aecd0]">Certified fields only</span>
                </label>
                <div className="grid grid-cols-2 gap-[8px]">
                  <label className="block text-[10px] text-[#a3afbe]">
                    X / Legend
                    <select
                      value={xField}
                      onChange={(e) => setXField(e.target.value)}
                      disabled={!canWrite || !editMode}
                      className="mt-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[8px] py-[7px] text-[12px] text-[#d4dbe3]"
                    >
                      <option value="">Auto</option>
                      {fieldOpts.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[10px] text-[#a3afbe]">
                    Y / Values
                    <select
                      value={yField}
                      onChange={(e) => setYField(e.target.value)}
                      disabled={!canWrite || !editMode}
                      className="mt-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[8px] py-[7px] text-[12px] text-[#d4dbe3]"
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

                <StudioQueExprPanel
                  value={yExpr}
                  xField={xField || undefined}
                  table={datasets.find((d) => d.id === datasetId)?.slug}
                  disabled={!canWrite || !editMode}
                  onChange={setYExpr}
                  onApply={(expr) => {
                    setYExpr(expr)
                    setToast('QueExpr applied — save visual to persist')
                  }}
                />

                <p className="text-[10px] font-bold tracking-[0.8px] text-[#8a9099] uppercase">
                  Layout (12-col grid)
                </p>
                <div className="grid grid-cols-4 gap-[8px]">
                  {(
                    [
                      ['col', layout.col, 0, 11],
                      ['row', layout.row, 0, 40],
                      ['w', layout.w, 3, 12],
                      ['h', layout.h, 2, 8],
                    ] as const
                  ).map(([key, val, min, max]) => (
                    <label key={key} className="block text-[10px] text-[#a3afbe]">
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
                        className="mt-[4px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[12px] text-[#d4dbe3]"
                      />
                    </label>
                  ))}
                </div>

                {drillSql ? (
                  <DrillToSqlPanel
                    sql={drillSql}
                    chartTitle={selected.title}
                    xField={xField || undefined}
                  />
                ) : null}

                <StudioWidgetRunPanel
                  chartId={selected.id}
                  chartTitle={selected.title}
                  runOpts={boardPreviewOpts}
                  onResult={(out) => {
                    setPreviewMap((prev) => ({ ...prev, [selected.id]: out.rows }))
                    setPreviewMeta((prev) => ({
                      ...prev,
                      [selected.id]: {
                        source: out.source,
                        cached: out.cached,
                        durationMs: out.durationMs,
                      },
                    }))
                  }}
                />

                <div className="flex flex-col gap-[8px] pt-[8px]">
                  <PdfGhostButton
                    type="button"
                    disabled={!canWrite || busy || !editMode}
                    onClick={() => void saveSelected()}
                    className="w-full py-[8px] text-[12px]"
                  >
                    Apply / Save
                  </PdfGhostButton>
                  {canWrite && !selected.certified ? (
                    <PdfGhostButton type="button" disabled={busy} onClick={() => void certifySelected()} className="w-full py-[8px] text-[12px]">
                      Certify
                    </PdfGhostButton>
                  ) : null}
                  {canAdmin && selected.certified ? (
                    <PdfGhostButton type="button" disabled={busy} onClick={() => void mintSelected()} className="w-full py-[8px] text-[12px]">
                      Mint embed
                    </PdfGhostButton>
                  ) : null}
                </div>

                {embedToken ? (
                  <div className="rounded-[4px] border border-solid border-[rgba(122,236,208,0.35)] bg-[rgba(122,236,208,0.08)] p-[10px]">
                    <p className="text-[10px] font-semibold text-[#7aecd0]">Embed (once)</p>
                    <pre className="mt-[6px] overflow-x-auto font-mono text-[9px] text-[#c8cdd3]">
                      {embedToken}
                    </pre>
                    {embedUrl ? (
                      <p className="mt-[6px] break-all font-mono text-[9px] text-[#8a9099]">
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
    <p className="px-[12px] py-[10px] text-[10px] font-bold tracking-[0.8px] text-[#8a9099] uppercase">
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
        'rounded-[4px] px-[12px] py-[6px] text-[11px] font-semibold disabled:opacity-40',
        active
          ? 'border border-solid border-[#d0d8e0]/40 bg-[#2e343b] text-[#d4dbe3]'
          : danger
            ? 'border border-solid border-[rgba(255,107,107,0.35)] text-[#ff6b6b]'
            : 'border border-solid border-[#424850] text-[#c8cdd3] hover:border-[#6b7380]',
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
      className="rounded-[4px] border border-solid border-[#424850] px-[8px] py-[2px] text-[9px] text-[#a3afbe] hover:text-[#d4dbe3]"
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
    <label className="block text-[10px] text-[#a3afbe]">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[8px] text-[12px] text-[#d4dbe3] disabled:opacity-50"
      />
    </label>
  )
}

export default BiChartsPage
