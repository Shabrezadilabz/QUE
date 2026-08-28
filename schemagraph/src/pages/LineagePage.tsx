import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CatalogAssetCard,
  CatalogDetailBody,
  CatalogDetailHeader,
  CatalogDetailPane,
  CatalogDetailTabs,
  CatalogDirectory,
  CatalogDirectoryCard,
  CatalogFilterChip,
  CatalogMetaItem,
  CatalogSection,
  CatalogSplitPage,
  PdfGhostButton,
  PdfPrimaryButton,
  type CatalogBadgeTone,
} from '@/components/catalog/CatalogSplitLayout'
import {
  fetchColumnLineage,
  fetchWorkspaceLineage,
  fetchDbtManifestStatus,
  ingestDbtManifestApi,
  exportLineageBundleApi,
  type ColumnLineageResult,
  type DbtManifestStatus,
  type LineagePath,
  type WorkspaceLineage,
} from '@/services/stitchApi'

type PathFilter = 'all' | 'complete' | 'progress'

function pathBadge(path: LineagePath): { label: string; tone: CatalogBadgeTone } {
  if (path.complete) return { label: 'Complete', tone: 'approved' }
  return { label: 'In progress', tone: 'review' }
}

/** Lineage — PDF page-07 split directory + detail. */
export function LineagePage() {
  const [data, setData] = useState<WorkspaceLineage | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pathFilter, setPathFilter] = useState<PathFilter>('all')
  const [detailTab, setDetailTab] = useState('pipeline')
  const [colTable, setColTable] = useState('')
  const [colColumn, setColColumn] = useState('')
  const [colLineage, setColLineage] = useState<ColumnLineageResult | null>(null)
  const [colBusy, setColBusy] = useState(false)
  const [dbtStatus, setDbtStatus] = useState<DbtManifestStatus | null>(null)
  const [dbtBusy, setDbtBusy] = useState(false)
  const [dbtToast, setDbtToast] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)

  const reloadDbtStatus = useCallback(async () => {
    try {
      const st = await fetchDbtManifestStatus()
      setDbtStatus(st)
    } catch {
      setDbtStatus(null)
    }
  }, [])

  useEffect(() => {
    void reloadDbtStatus()
  }, [reloadDbtStatus])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchWorkspaceLineage({ limit: 40 })
      setData(next)
      setSelectedId((prev) => {
        if (prev && next.paths.some((p) => p.job.id === prev)) return prev
        return next.paths[0]?.job.id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const selected = data?.paths.find((p) => p.job.id === selectedId) ?? null

  const filteredPaths = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.paths.filter((p) => {
      if (pathFilter === 'complete' && !p.complete) return false
      if (pathFilter === 'progress' && p.complete) return false
      if (!q) return true
      return p.job.title.toLowerCase().includes(q)
    })
  }, [data, query, pathFilter])

  async function traceColumn() {
    if (!colTable.trim()) return
    setColBusy(true)
    try {
      const result = await fetchColumnLineage({
        table: colTable.trim(),
        column: colColumn.trim() || undefined,
        direction: 'both',
        maxHops: 4,
      })
      setColLineage(result)
      setDetailTab('column')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setColBusy(false)
    }
  }

  async function uploadDbtManifest(file: File) {
    setDbtBusy(true)
    setDbtToast(null)
    setError(null)
    try {
      const text = await file.text()
      const manifest = JSON.parse(text) as Record<string, unknown>
      const out = await ingestDbtManifestApi(manifest)
      setDbtToast(
        `Ingested ${out.edges ?? 0} ref edge(s) · ${out.matchedTables ?? 0} matched · ${out.columnRefCount ?? 0} column refs`,
      )
      await reloadDbtStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDbtBusy(false)
    }
  }

  async function downloadLineageBundle() {
    setExportBusy(true)
    setError(null)
    try {
      const bundle = await exportLineageBundleApi({
        table: colTable.trim() || undefined,
        column: colColumn.trim() || undefined,
      })
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `que-lineage-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setDbtToast('Lineage export bundle downloaded')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <CatalogSplitPage
      title="Lineage"
      subtitle="Sources → promoted joins → stitch jobs → attested export or warehouse objects."
      headerActions={
        <>
          <Link to="/catalog" className="pdf-btn-ghost rounded-[4px] px-[13px] py-[7px] text-[12px] font-semibold">
            Catalog
          </Link>
          <PdfGhostButton type="button" disabled={loading} onClick={() => void reload()}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </PdfGhostButton>
          <PdfPrimaryButton
            type="button"
            disabled={exportBusy}
            onClick={() => void downloadLineageBundle()}
            className="py-[7px]"
          >
            {exportBusy ? 'Exporting…' : 'Export bundle'}
          </PdfPrimaryButton>
        </>
      }
      banner={
        <>
          {error ? (
            <p className="shrink-0 border-b border-solid border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)] px-[24px] py-[8px] text-[12px] text-[#ff6b6b]">
              {error}
            </p>
          ) : null}
          {dbtToast ? (
            <p className="shrink-0 border-b border-solid border-[#424850] px-[24px] py-[8px] text-[12px] text-[#7aecd0]">
              {dbtToast}
            </p>
          ) : null}
        </>
      }
    >
      <CatalogDirectory
        title="Path Directory"
        search={query}
        onSearch={setQuery}
        searchPlaceholder="Filter paths…"
        filters={
          <>
            <CatalogFilterChip label="All" active={pathFilter === 'all'} onClick={() => setPathFilter('all')} />
            <CatalogFilterChip label="Complete" active={pathFilter === 'complete'} onClick={() => setPathFilter('complete')} />
            <CatalogFilterChip label="In progress" active={pathFilter === 'progress'} onClick={() => setPathFilter('progress')} />
          </>
        }
        footer={
          data ? (
            <span>
              {data.summary.completePaths} complete · {data.summary.jobs} jobs ·{' '}
              {data.summary.acceptedJoins} joins
            </span>
          ) : null
        }
      >
        {!filteredPaths.length && !loading ? (
          <p className="px-[8px] py-[16px] text-[12px] text-[#a3afbe]">
            No job paths yet. Create a stitch job from promoted joins.
          </p>
        ) : null}
        {filteredPaths.map((p) => {
          const b = pathBadge(p)
          return (
            <CatalogDirectoryCard
              key={p.job.id}
              title={p.job.title}
              badge={b.label}
              badgeTone={b.tone}
              description={`${p.sources.length} sources · ${p.joins.length} joins · ${p.job.status}`}
              meta={
                <>
                  <span>{p.complete ? '✓ End-to-end' : '○ Partial'}</span>
                  <span>{p.tables.length} tables</span>
                </>
              }
              active={selectedId === p.job.id}
              onClick={() => setSelectedId(p.job.id)}
            />
          )
        })}
      </CatalogDirectory>

      <CatalogDetailPane
        empty="Select a lineage path to inspect the pipeline."
      >
        {selected ? (
          <>
            <CatalogDetailHeader
              title={selected.job.title}
              badge={pathBadge(selected).label}
              badgeTone={pathBadge(selected).tone}
              meta={
                <>
                  <CatalogMetaItem label="Status" value={selected.job.status} />
                  <CatalogMetaItem
                    label="Updated"
                    value={
                      selected.job.updatedAt
                        ? new Date(selected.job.updatedAt).toLocaleDateString()
                        : '—'
                    }
                  />
                  <CatalogMetaItem label="Tables" value={String(selected.tables.length)} />
                </>
              }
              description="End-to-end metadata path from connected sources through promoted joins to export or materialized warehouse objects."
              actions={
                <Link
                  to={`/jobs/${selected.job.id}/deploy`}
                  className="pdf-btn-primary rounded-[4px] px-[14px] py-[8px] text-[12px] font-semibold"
                >
                  Open Deploy
                </Link>
              }
            />

            <CatalogDetailTabs
              tabs={[
                { id: 'pipeline', label: 'Pipeline' },
                { id: 'assets', label: 'Linked Assets' },
                { id: 'column', label: 'Column Trace' },
                { id: 'dbt', label: 'dbt Manifest' },
              ]}
              active={detailTab}
              onChange={setDetailTab}
            />

            <CatalogDetailBody>
              {detailTab === 'pipeline' ? (
                <PathPipeline path={selected} />
              ) : null}
              {detailTab === 'assets' ? (
                <CatalogSection title={`Technical Mapping (${selected.sources.length + selected.joins.length + (selected.export ? 1 : 0)} assets)`}>
                  <div className="grid gap-[12px] sm:grid-cols-2">
                    {selected.sources.map((s) => (
                      <CatalogAssetCard
                        key={s.id || s.name}
                        icon="⎔"
                        title={s.name}
                        platform={s.type || 'SOURCE'}
                        description="Connected source in workspace graph."
                      />
                    ))}
                    {selected.joins.map((j, i) => (
                      <CatalogAssetCard
                        key={j.id || `${j.label}-${i}`}
                        icon="↔"
                        title={j.label}
                        platform={j.frozen ? 'FROZEN JOIN' : 'JOIN'}
                        description="Promoted relationship on this job."
                      />
                    ))}
                    {selected.export ? (
                      <CatalogAssetCard
                        icon="⬡"
                        title={`Export · ${selected.export.format}`}
                        platform="ATTESTED"
                        field={selected.export.fingerprint?.slice(0, 24)}
                        fieldType="SHA256"
                      />
                    ) : null}
                  </div>
                </CatalogSection>
              ) : null}
              {detailTab === 'column' ? (
                <ColumnTracePanel
                  colTable={colTable}
                  colColumn={colColumn}
                  onTable={setColTable}
                  onColumn={setColColumn}
                  onTrace={() => void traceColumn()}
                  busy={colBusy}
                  result={colLineage}
                />
              ) : null}
              {detailTab === 'dbt' ? (
                <DbtManifestPanel
                  status={dbtStatus}
                  busy={dbtBusy}
                  onUpload={(f) => void uploadDbtManifest(f)}
                />
              ) : null}
            </CatalogDetailBody>
          </>
        ) : null}
      </CatalogDetailPane>
    </CatalogSplitPage>
  )
}

function PathPipeline({ path }: { path: LineagePath }) {
  const stages = [
    { title: 'Sources', ready: path.stages[0]?.ready, content: path.sources.map((s) => s.name).join(', ') || 'None linked' },
    { title: 'Promoted joins', ready: path.stages[1]?.ready, content: path.joins.map((j) => j.label).join(', ') || 'None frozen' },
    { title: 'Stitch job', ready: true, content: path.tables.length ? path.tables.join(', ') : '—' },
    {
      title: 'Export / warehouse',
      ready: path.stages[3]?.ready,
      content: path.export
        ? `${path.export.format} export`
        : path.materializations.length
          ? path.materializations.map((m) => m.qualifiedName).join(', ')
          : 'Not shipped yet',
    },
  ]

  return (
    <CatalogSection title="Lineage Graph">
      <ol className="space-y-[12px]">
        {stages.map((s, i) => (
          <li
            key={s.title}
            className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[14px]"
          >
            <div className="flex items-center gap-[10px]">
              <span
                className={[
                  'flex size-[24px] items-center justify-center rounded-full text-[11px] font-bold',
                  s.ready
                    ? 'border border-solid border-[rgba(122,236,208,0.45)] bg-[rgba(122,236,208,0.12)] text-[#7aecd0]'
                    : 'border border-solid border-[#424850] bg-[#1e2328] text-[#8a9099]',
                ].join(' ')}
              >
                {i + 1}
              </span>
              <p className="text-[13px] font-semibold text-[#d4dbe3]">{s.title}</p>
            </div>
            <p className="mt-[8px] pl-[34px] text-[12px] text-[#a3afbe]">{s.content}</p>
            {i < stages.length - 1 ? (
              <p className="mt-[6px] pl-[34px] text-[#424850]" aria-hidden>
                ↓
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </CatalogSection>
  )
}

function ColumnTracePanel({
  colTable,
  colColumn,
  onTable,
  onColumn,
  onTrace,
  busy,
  result,
}: {
  colTable: string
  colColumn: string
  onTable: (v: string) => void
  onColumn: (v: string) => void
  onTrace: () => void
  busy: boolean
  result: ColumnLineageResult | null
}) {
  return (
    <>
      <CatalogSection title="Column lineage (multi-hop)">
        <div className="flex flex-wrap items-end gap-[10px]">
          <label className="block text-[11px] text-[#a3afbe]">
            Table
            <input
              value={colTable}
              onChange={(e) => onTable(e.target.value)}
              placeholder="orders"
              className="mt-[4px] block rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[7px] text-[12px] text-[#d4dbe3]"
            />
          </label>
          <label className="block text-[11px] text-[#a3afbe]">
            Column
            <input
              value={colColumn}
              onChange={(e) => onColumn(e.target.value)}
              placeholder="customer_id"
              className="mt-[4px] block rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[7px] text-[12px] text-[#d4dbe3]"
            />
          </label>
          <PdfPrimaryButton type="button" disabled={busy || !colTable.trim()} onClick={onTrace} className="py-[7px]">
            {busy ? 'Tracing…' : 'Trace'}
          </PdfPrimaryButton>
        </div>
      </CatalogSection>
      {result ? (
        <div className="grid gap-[12px] sm:grid-cols-2">
          <HopList title="Upstream" nodes={result.upstream?.nodes || []} />
          <HopList title="Downstream" nodes={result.downstream?.nodes || []} />
        </div>
      ) : null}
    </>
  )
}

function DbtManifestPanel({
  status,
  busy,
  onUpload,
}: {
  status: DbtManifestStatus | null
  busy: boolean
  onUpload: (file: File) => void
}) {
  return (
    <>
      <CatalogSection title="dbt manifest assist (S4.3)">
        <p className="mb-[12px] text-[12px] leading-relaxed text-[#a3afbe]">
          Upload <code className="text-[#c8cdd3]">manifest.json</code> from your existing dbt
          project to overlay ref edges and column metadata on Que lineage.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-[10px] rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[12px] py-[8px] text-[12px] font-semibold text-[#c8cdd3] hover:bg-[#1a1f24]">
          {busy ? 'Uploading…' : 'Upload manifest.json'}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ''
            }}
          />
        </label>
      </CatalogSection>
      {status ? (
        <CatalogSection title="Latest ingest">
          <p className="text-[12px] text-[#a3afbe]">
            {status.edgeCount} ref edges · {status.matchedTables} tables matched
            {status.columnRefCount != null ? ` · ${status.columnRefCount} column refs` : ''}
          </p>
          <p className="mt-[6px] text-[11px] text-[#8a9099]">
            {status.ingestedAt
              ? new Date(status.ingestedAt).toLocaleString()
              : status.label}
          </p>
          {status.samples?.length ? (
            <ul className="mt-[10px] max-h-[160px] space-y-[4px] overflow-y-auto font-mono text-[11px] text-[#c8cdd3]">
              {status.samples.slice(0, 12).map((s) => (
                <li key={`${s.from}-${s.to}`}>
                  {s.from} → {s.to}
                </li>
              ))}
            </ul>
          ) : null}
        </CatalogSection>
      ) : (
        <p className="text-[12px] text-[#8a9099]">No dbt manifest ingested yet.</p>
      )}
    </>
  )
}

function HopList({
  title,
  nodes,
}: {
  title: string
  nodes: { key: string; hop?: number }[]
}) {
  return (
    <div className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[12px]">
      <p className="text-[11px] font-bold tracking-[0.6px] text-[#8a9099] uppercase">
        {title} · {nodes.length}
      </p>
      <ul className="mt-[8px] max-h-[200px] space-y-[4px] overflow-y-auto font-mono text-[11px] text-[#c8cdd3]">
        {nodes.slice(0, 24).map((n) => (
          <li key={n.key}>
            {n.key}
            {n.hop != null ? ` · hop ${n.hop}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default LineagePage
