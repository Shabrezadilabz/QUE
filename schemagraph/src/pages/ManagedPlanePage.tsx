import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ManagedPlaneLayout } from '@/layouts/ManagedPlaneLayout'
import { PlaneObjectTree } from '@/components/plane/PlaneObjectTree'
import { PlaneSqlEditor } from '@/components/plane/PlaneSqlEditor'
import { PlaneActivityFeed } from '@/components/plane/PlaneActivityFeed'
import { PlaneNlpComposer } from '@/components/plane/PlaneNlpComposer'
import { PlaneResultsGrid } from '@/components/plane/PlaneResultsGrid'
import { PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import { useManagedPlaneGate } from '@/hooks/useManagedPlaneGate'
import {
  appendPlaneActivity,
  ensurePlaneWelcome,
  type PlaneActivityEvent,
  type PlaneActivitySource,
} from '@/plane/planeActivity'
import {
  fetchManagedDatasets,
  fetchPlanePreviewConnections,
  fetchWorkspaceSchema,
  previewPlaneQueryApi,
  type ManagedDataset,
  type PlaneNlpToSqlResult,
  type PlanePreviewConnection,
} from '@/services/stitchApi'

const DEFAULT_SQL = `-- Managed Plane — read-only preview (max 20 rows)
-- Pick a managed dataset or warehouse connection, then Run preview.
SELECT *
FROM your_table
LIMIT 20;`

type CenterTab = 'query' | 'nlp'
type PreviewTarget = 'auto' | 'managed' | 'warehouse'

/** SQL-first Managed Plane workspace — opens in new tab from top bar. */
export function ManagedPlanePage() {
  const [searchParams] = useSearchParams()
  const { enabled, loading: gateLoading } = useManagedPlaneGate()

  const [datasets, setDatasets] = useState<ManagedDataset[]>([])
  const [datasetsLoading, setDatasetsLoading] = useState(true)
  const [selectedDataset, setSelectedDataset] = useState<ManagedDataset | null>(null)
  const [schemaTables, setSchemaTables] = useState<
    { id: string; name: string; schema?: string }[]
  >([])

  const [centerTab, setCenterTab] = useState<CenterTab>('query')
  const [sql, setSql] = useState(DEFAULT_SQL)

  const [resultColumns, setResultColumns] = useState<string[]>([])
  const [resultRows, setResultRows] = useState<Record<string, unknown>[]>([])
  const [resultLoading, setResultLoading] = useState(false)
  const [resultError, setResultError] = useState<string | null>(null)
  const [resultCount, setResultCount] = useState<number | null>(null)

  const [activityFilter, setActivityFilter] = useState<'all' | PlaneActivitySource>('all')
  const [selectedActivity, setSelectedActivity] = useState<PlaneActivityEvent | null>(null)
  const [detailSql, setDetailSql] = useState<string | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')
  const [previewConnections, setPreviewConnections] = useState<PlanePreviewConnection[]>([])
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>('auto')
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  const [displayMasked, setDisplayMasked] = useState(false)
  const [nlpAsk, setNlpAsk] = useState<string | null>(null)

  useEffect(() => {
    void ensurePlaneWelcome()
  }, [])
  useEffect(() => {
    const fromUrl = searchParams.get('sql')
    if (!fromUrl) return
    setSql(fromUrl)
  }, [searchParams])

  useEffect(() => {
    const ask = searchParams.get('ask')
    if (!ask?.trim()) return
    setNlpAsk(ask.trim())
    setCenterTab('nlp')
  }, [searchParams])

  useEffect(() => {
    const datasetId = searchParams.get('dataset')
    if (!datasetId || !datasets.length) return
    const ds = datasets.find((d) => d.id === datasetId)
    if (!ds || selectedDataset?.id === ds.id) return
    setSelectedDataset(ds)
    setSql(`-- Preview ${ds.name} (${ds.slug})\nSELECT *\nFROM ${ds.slug}\nLIMIT 20;`)
  }, [searchParams, datasets, selectedDataset?.id])

  useEffect(() => {
    if (gateLoading || enabled === false) return
    let cancelled = false
    void fetchManagedDatasets()
      .then((res) => {
        if (!cancelled) setDatasets(res.items)
      })
      .catch(() => {
        if (!cancelled) setDatasets([])
      })
      .finally(() => {
        if (!cancelled) setDatasetsLoading(false)
      })
    void fetchWorkspaceSchema()
      .then((schema) => {
        if (!cancelled) {
          setSchemaTables(
            schema.tables.map((t) => ({
              id: t.id,
              name: t.name,
              schema: t.sourceLabel,
            })),
          )
        }
      })
      .catch(() => {
        if (!cancelled) setSchemaTables([])
      })
    void fetchPlanePreviewConnections()
      .then((items) => {
        if (!cancelled) {
          setPreviewConnections(items)
          setSelectedConnectionId((prev) => prev || items[0]?.id || '')
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewConnections([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled, gateLoading])

  const onSelectDataset = useCallback((ds: ManagedDataset) => {
    setSelectedDataset(ds)
    setSql(
      `-- Preview ${ds.name} (${ds.slug})\nSELECT *\nFROM ${ds.slug}\nLIMIT 20;`,
    )
    void appendPlaneActivity({
      kind: 'edited',
      source: 'plane_sql',
      actor: 'user',
      title: `Selected dataset ${ds.name}`,
      datasetId: ds.id,
      sql: `-- ${ds.slug}`,
    })
  }, [])

  const runPreview = useCallback(async () => {
    setResultLoading(true)
    setResultError(null)
    setPreviewNote(null)
    setDetailSql(sql)

    const useManaged =
      previewTarget === 'managed' ||
      (previewTarget === 'auto' && Boolean(selectedDataset))
    const useWarehouse = previewTarget === 'warehouse'
    const autoWarehouse =
      previewTarget === 'auto' && !selectedDataset && Boolean(selectedConnectionId)

    try {
      const result = await previewPlaneQueryApi({
        sql,
        datasetId: useManaged ? selectedDataset?.id ?? null : null,
        connectionId:
          useWarehouse || autoWarehouse ? selectedConnectionId || null : null,
      })
      setResultColumns(result.columns.map((c) => c.name))
      setResultRows(result.rows)
      setResultCount(result.rowCount)
      setPreviewNote(result.note ?? null)
      setDisplayMasked(Boolean(result.displayMasked))
      if (result.sqlExecuted && result.sqlExecuted !== sql) {
        setSql(result.sqlExecuted)
      }
      window.dispatchEvent(new CustomEvent('que-plane-activity'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preview failed'
      setResultError(msg)
      setResultColumns([])
      setResultRows([])
      setResultCount(null)
      void appendPlaneActivity({
        kind: 'failed',
        source: 'plane_sql',
        actor: 'system',
        title: 'Preview failed',
        detail: msg,
        sql,
        datasetId: selectedDataset?.id ?? null,
        connectionId: selectedConnectionId || null,
      })
    } finally {
      setResultLoading(false)
    }
  }, [previewTarget, selectedConnectionId, selectedDataset, sql])

  const onNlpGenerated = useCallback((result: PlaneNlpToSqlResult) => {
    if (!result.sql) return
    setSql(result.sql)
    setCenterTab('query')
    setDetailSql(result.sql)
  }, [])

  const onSelectActivity = useCallback((ev: PlaneActivityEvent) => {
    setSelectedActivity(ev)
    if (ev.sql) {
      setDetailSql(ev.sql)
      setSql(ev.sql)
    }
  }, [])

  const quotasHint = useMemo(() => {
    if (datasets.length === 0) return null
    return `${datasets.length} dataset(s) in plane`
  }, [datasets.length])

  if (gateLoading) {
    return (
      <ManagedPlaneLayout>
        <div className="flex h-full items-center justify-center text-[13px] text-[var(--pdf-text-muted)]">
          Loading Managed Plane…
        </div>
      </ManagedPlaneLayout>
    )
  }

  if (enabled === false) {
    return (
      <ManagedPlaneLayout>
        <div className="flex h-full flex-col items-center justify-center gap-[12px] p-[24px] text-center">
          <p className="text-[16px] font-semibold text-[var(--pdf-text-primary)]">
            Managed Plane is disabled
          </p>
          <p className="max-w-[420px] text-[13px] text-[var(--pdf-text-muted)]">
            Enable <strong>Que Managed Data Plane (Offer B)</strong> in Settings → AI &amp; Policy,
            then reopen this tab.
          </p>
          <Link to="/settings/ai-policy" className="pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[12px] font-semibold">
            Open AI &amp; Policy
          </Link>
        </div>
      </ManagedPlaneLayout>
    )
  }

  return (
    <ManagedPlaneLayout>
      <div className="flex h-full min-h-0">
        <PlaneObjectTree
          datasets={datasets}
          loading={datasetsLoading}
          selectedId={selectedDataset?.id ?? null}
          onSelect={onSelectDataset}
          schemaTables={schemaTables}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-[8px] border-b border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[12px] py-[8px]">
            <div className="flex items-center gap-[4px]">
              {(['query', 'nlp'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCenterTab(tab)}
                  className={[
                    'rounded-[4px] px-[12px] py-[6px] text-[11px] font-semibold tracking-[0.4px] uppercase',
                    centerTab === tab
                      ? 'bg-[var(--pdf-accent-surface)] text-[var(--pdf-accent)]'
                      : 'text-[var(--pdf-text-muted)] hover:bg-[var(--pdf-bg-muted)]',
                  ].join(' ')}
                >
                  {tab === 'query' ? 'SQL' : 'Ask (SSM)'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-[8px]">
              <select
                value={previewTarget}
                onChange={(e) => setPreviewTarget(e.target.value as PreviewTarget)}
                className="rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-input)] px-[8px] py-[5px] text-[11px] text-[var(--pdf-text-primary)]"
                title="Preview target"
              >
                <option value="auto">Auto target</option>
                <option value="managed">Managed dataset</option>
                <option value="warehouse">Warehouse</option>
              </select>
              {(previewTarget === 'warehouse' ||
                (previewTarget === 'auto' && !selectedDataset)) &&
              previewConnections.length > 0 ? (
                <select
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="max-w-[180px] rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-input)] px-[8px] py-[5px] text-[11px] text-[var(--pdf-text-primary)]"
                >
                  {previewConnections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              ) : null}
              {quotasHint ? (
                <span className="hidden text-[11px] text-[var(--pdf-text-faint)] sm:inline">
                  {quotasHint}
                </span>
              ) : null}
              <PdfGhostButton type="button" onClick={() => {
                setDatasetsLoading(true)
                void fetchManagedDatasets()
                  .then((res) => setDatasets(res.items))
                  .finally(() => setDatasetsLoading(false))
              }}>
                Refresh
              </PdfGhostButton>
              <PdfPrimaryButton type="button" onClick={() => void runPreview()}>
                Run preview
              </PdfPrimaryButton>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(160px,1fr)_minmax(120px,0.55fr)]">
            <div className="min-h-0 border-b border-solid border-[var(--pdf-border)]">
              {centerTab === 'query' ? (
                <PlaneSqlEditor
                  value={sql}
                  onChange={setSql}
                  placeholder="Write SQL…"
                />
              ) : (
                <PlaneNlpComposer
                  datasetId={selectedDataset?.id ?? null}
                  datasetName={selectedDataset?.name ?? null}
                  initialPrompt={nlpAsk}
                  onSqlGenerated={onNlpGenerated}
                />
              )}
            </div>

            <div className="flex min-h-0 flex-col bg-[var(--pdf-bg-panel)]">
              <div className="shrink-0 border-b border-solid border-[var(--pdf-border)] px-[12px] py-[6px] text-[10px] font-semibold tracking-[0.5px] text-[var(--pdf-text-faint)] uppercase">
                Results · human-visible only
                {previewNote ? (
                  <span className="ml-2 font-normal normal-case text-[var(--pdf-text-muted)]">
                    · {previewNote}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1">
                <PlaneResultsGrid
                  columns={resultColumns}
                  rows={resultRows}
                  loading={resultLoading}
                  error={resultError}
                  rowCount={resultCount}
                  displayMasked={displayMasked}
                />
              </div>
            </div>
          </div>

          {detailSql && selectedActivity ? (
            <footer className="shrink-0 border-t border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-muted)] px-[12px] py-[8px]">
              <p className="text-[10px] font-semibold text-[var(--pdf-text-faint)] uppercase">
                Activity detail — {selectedActivity.title}
              </p>
              <pre className="mt-[4px] max-h-[80px] overflow-auto font-mono text-[11px] text-[var(--pdf-text-secondary)]">
                {detailSql}
              </pre>
            </footer>
          ) : null}
        </main>

        <div className="flex min-h-0 w-[280px] shrink-0 flex-col">
          <div className="flex shrink-0 gap-[4px] border-b border-solid border-[var(--pdf-border)] p-[6px]">
            {(
              [
                ['all', 'All'],
                ['chat', 'Chat'],
                ['plane_sql', 'SQL'],
                ['job', 'Jobs'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivityFilter(key)}
                className={[
                  'rounded-[4px] px-[8px] py-[4px] text-[10px] font-semibold',
                  activityFilter === key
                    ? 'bg-[var(--pdf-accent-surface)] text-[var(--pdf-accent)]'
                    : 'text-[var(--pdf-text-muted)]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <PlaneActivityFeed
              filter={activityFilter}
              onSelect={onSelectActivity}
              selectedId={selectedActivity?.id ?? null}
            />
          </div>
        </div>
      </div>
    </ManagedPlaneLayout>
  )
}

export default ManagedPlanePage
