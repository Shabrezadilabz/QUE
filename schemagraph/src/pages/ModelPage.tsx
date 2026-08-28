import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createQueModelApi,
  deleteQueModelApi,
  exportQueModelsDbtApi,
  fetchQueModelLineage,
  fetchQueModels,
  runQueModelPreviewApi,
  updateQueModelApi,
  type QueSqlModel,
} from '@/services/stitchApi'
import { RunInWarehouseButton } from '@/components/warehouse/RunInWarehouseButton'
import type { ChatLiveQueryResult } from '@/components/chat/ChatLiveResults'

type Tab = 'editor' | 'preview' | 'lineage'

const LAYERS = ['staging', 'mart', 'seed'] as const

/** Que Model IDE — dbt-class SQL models with warehouse preview. */
export function ModelPage() {
  const { modelId: routeModelId } = useParams<{ modelId?: string }>()
  const navigate = useNavigate()
  const { canWrite } = useWorkspaceRole()
  const { page: autofillPage } = usePageAutofill('model')

  const [models, setModels] = useState<QueSqlModel[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(routeModelId || null)
  const [tab, setTab] = useState<Tab>('editor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [layer, setLayer] = useState<(typeof LAYERS)[number]>('staging')
  const [materialization, setMaterialization] = useState('view')
  const [description, setDescription] = useState('')
  const [sqlText, setSqlText] = useState(
    `-- stg_example\nSELECT *\nFROM raw_shopify_orders\nLIMIT 100`,
  )
  const [status, setStatus] = useState('draft')

  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([])
  const [previewCols, setPreviewCols] = useState<string[]>([])
  const [lineage, setLineage] = useState<{
    nodes: { id: string; name: string; layer: string }[]
    edges: { from: string; to: string; fromName: string; toName: string }[]
  } | null>(null)

  const selected = useMemo(
    () => models.find((m) => m.id === selectedId) ?? null,
    [models, selectedId],
  )

  const grouped = useMemo(() => {
    const g: Record<string, QueSqlModel[]> = { staging: [], mart: [], seed: [] }
    for (const m of models) {
      if (g[m.layer]) g[m.layer].push(m)
    }
    return g
  }, [models])

  const reload = useCallback(async () => {
    setError(null)
    const items = await fetchQueModels()
    setModels(items)
    setSelectedId((prev) => {
      if (routeModelId && items.some((m) => m.id === routeModelId)) return routeModelId
      if (prev && items.some((m) => m.id === prev)) return prev
      return items[0]?.id ?? null
    })
  }, [routeModelId])

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [reload])

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setLayer(selected.layer as (typeof LAYERS)[number])
    setMaterialization(selected.materialization)
    setDescription(selected.description)
    setSqlText(selected.sqlText)
    setStatus(selected.status)
  }, [selected?.id])

  useEffect(() => {
    if (tab !== 'lineage') return
    void fetchQueModelLineage()
      .then(setLineage)
      .catch(() => setLineage(null))
  }, [tab, models.length])

  async function saveModel() {
    if (!canWrite || !selectedId) return
    setBusy(true)
    try {
      await updateQueModelApi(selectedId, {
        name,
        layer,
        materialization,
        description,
        sqlText,
        status,
      })
      setToast('Model saved')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function createModel() {
    if (!canWrite) return
    setBusy(true)
    try {
      const item = await createQueModelApi({
        name: name.trim() || `stg_model_${models.length + 1}`,
        layer,
        materialization,
        description,
        sqlText,
      })
      setSelectedId(item.id)
      navigate(`/model/${item.id}`)
      setToast(`Created ${item.name}`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const modelRunFn = useCallback(async (): Promise<ChatLiveQueryResult> => {
    if (!selectedId) {
      return { ok: false, error: 'No model selected' }
    }
    if (canWrite) {
      await updateQueModelApi(selectedId, { sqlText, name, layer, materialization, description })
    }
    const started = Date.now()
    const out = await runQueModelPreviewApi(selectedId, { sql: sqlText })
    setPreviewRows(out.rows)
    setPreviewCols(out.columns)
    setTab('preview')
    await reload()
    return {
      ok: true,
      columns: out.columns,
      rows: out.rows,
      rowCount: out.rowCount,
      connectionName: 'Que Warehouse',
      durationMs: Date.now() - started,
      aiIsolation: 'row_payloads_never_sent_to_model',
      policy: out.source === 'que_warehouse' ? 'que-warehouse-readonly' : 'que-model-preview',
      source: out.source,
      sql: sqlText,
    }
  }, [selectedId, canWrite, sqlText, name, layer, materialization, description, reload])

  async function exportDbt() {
    setBusy(true)
    try {
      const pack = await exportQueModelsDbtApi()
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'que-models-dbt.json'
      a.click()
      URL.revokeObjectURL(url)
      setToast(`Exported ${pack.modelCount} model(s) for dbt`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeModel() {
    if (!canWrite || !selectedId) return
    setBusy(true)
    try {
      await deleteQueModelApi(selectedId)
      setSelectedId(null)
      navigate('/model')
      await reload()
      setToast('Model deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function selectModel(id: string) {
    setSelectedId(id)
    navigate(`/model/${id}`)
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Que Model"
          subtitle="dbt-class SQL · staging & marts · warehouse preview · dbt export"
          actions={
            <div className="flex flex-wrap gap-[8px]">
              <PdfGhostButton type="button" disabled={busy} onClick={() => void exportDbt()}>
                Export dbt
              </PdfGhostButton>
              {canWrite ? (
                <PdfPrimaryButton type="button" disabled={busy} onClick={() => void createModel()}>
                  + New model
                </PdfPrimaryButton>
              ) : null}
            </div>
          }
        />

        {autofillPage ? (
          <div className="shrink-0 px-[16px] pt-[8px]">
            <PageAutofillBanner page={autofillPage} compact />
          </div>
        ) : null}

        <div className="flex shrink-0 gap-[8px] border-b border-solid border-[#424850] px-[16px]">
          {(['editor', 'preview', 'lineage'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'border-b-2 px-[12px] py-[10px] text-[12px] font-semibold capitalize',
                tab === t
                  ? 'border-[#7aecd0] text-[#7aecd0]'
                  : 'border-transparent text-[#a3afbe] hover:text-[#d4dbe3]',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>

        {error ? (
          <p className="shrink-0 px-[16px] py-[8px] text-[12px] text-[#ff6b6b]">{error}</p>
        ) : null}
        {toast ? (
          <p className="shrink-0 px-[16px] py-[8px] text-[12px] text-[#7aecd0]">
            {toast}{' '}
            <button type="button" className="underline" onClick={() => setToast(null)}>
              dismiss
            </button>
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-solid border-[#424850] bg-[#0f1215] md:block">
            {LAYERS.map((L) => (
              <div key={L}>
                <p className="px-[12px] py-[8px] text-[10px] font-bold tracking-widest text-[#8a9099] uppercase">
                  {L}
                </p>
                <ul>
                  {(grouped[L] || []).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => selectModel(m.id)}
                        className={[
                          'w-full truncate px-[12px] py-[8px] text-left text-[11px]',
                          selectedId === m.id
                            ? 'bg-[#1e2328] text-[#7aecd0]'
                            : 'text-[#d4dbe3] hover:bg-[#1e2328]/60',
                        ].join(' ')}
                      >
                        {m.name}
                        {m.status === 'ready' ? ' ✓' : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!models.length ? (
              <p className="p-[12px] text-[11px] text-[#a3afbe]">
                No models yet — create one to start building marts.
              </p>
            ) : null}
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {tab === 'editor' ? (
              <>
                <div className="grid shrink-0 gap-[8px] border-b border-solid border-[#424850] p-[12px] sm:grid-cols-4">
                  <label className="text-[10px] text-[#a3afbe]">
                    Name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!canWrite}
                      className="mt-[4px] w-full rounded-[4px] border border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
                    />
                  </label>
                  <label className="text-[10px] text-[#a3afbe]">
                    Layer
                    <select
                      value={layer}
                      onChange={(e) => setLayer(e.target.value as (typeof LAYERS)[number])}
                      disabled={!canWrite}
                      className="mt-[4px] w-full rounded-[4px] border border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
                    >
                      {LAYERS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[10px] text-[#a3afbe]">
                    Materialize
                    <select
                      value={materialization}
                      onChange={(e) => setMaterialization(e.target.value)}
                      disabled={!canWrite}
                      className="mt-[4px] w-full rounded-[4px] border border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
                    >
                      <option value="view">view</option>
                      <option value="table">table</option>
                      <option value="incremental">incremental</option>
                    </select>
                  </label>
                  <label className="text-[10px] text-[#a3afbe]">
                    Status
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={!canWrite}
                      className="mt-[4px] w-full rounded-[4px] border border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
                    >
                      <option value="draft">draft</option>
                      <option value="ready">ready</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                </div>
                <textarea
                  value={sqlText}
                  onChange={(e) => setSqlText(e.target.value)}
                  disabled={!canWrite}
                  spellCheck={false}
                  className="min-h-0 flex-1 resize-none border-0 bg-[#0f1215] p-[16px] font-mono text-[12px] leading-relaxed text-[#c8cdd3] outline-none"
                  placeholder="SELECT ..."
                />
                <div className="flex shrink-0 flex-wrap gap-[8px] border-t border-solid border-[#424850] p-[12px]">
                  <RunInWarehouseButton
                    sql={sqlText}
                    runFn={modelRunFn}
                    showResults={false}
                    onResult={(r) => {
                      if (r.ok) setToast(`Preview · ${r.rowCount ?? 0} row(s) from warehouse`)
                    }}
                  />
                  {canWrite && selectedId ? (
                    <>
                      <PdfGhostButton
                        type="button"
                        disabled={busy}
                        onClick={() => void saveModel()}
                        className="px-[14px] py-[8px] text-[12px]"
                      >
                        Save
                      </PdfGhostButton>
                      <PdfGhostButton
                        type="button"
                        disabled={busy}
                        onClick={() => void removeModel()}
                        className="px-[14px] py-[8px] text-[12px] text-[#ff6b6b]"
                      >
                        Delete
                      </PdfGhostButton>
                    </>
                  ) : null}
                  <Link to="/lineage" className="self-center text-[11px] text-[#7aecd0] underline">
                    Full lineage →
                  </Link>
                </div>
              </>
            ) : null}

            {tab === 'preview' ? (
              <div className="min-h-0 flex-1 overflow-auto p-[16px]">
                <RunInWarehouseButton
                  sql={sqlText}
                  runFn={modelRunFn}
                  showResults={false}
                  className="mb-[12px]"
                />
                {selected?.lastRunAt ? (
                  <p className="mb-[12px] text-[11px] text-[#8a9099]">
                    Last run: {new Date(selected.lastRunAt).toLocaleString()} ·{' '}
                    {selected.lastRunRows ?? 0} rows · {selected.lastRunStatus}
                  </p>
                ) : null}
                {!previewRows.length ? (
                  <p className="text-[12px] text-[#a3afbe]">
                    Run the model to preview warehouse results.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-[4px] border border-[#424850]">
                    <table className="min-w-full text-left text-[11px]">
                      <thead className="bg-[#121619] text-[#8a9099]">
                        <tr>
                          {(previewCols.length
                            ? previewCols
                            : Object.keys(previewRows[0] || {})
                          ).map((c) => (
                            <th key={c} className="px-[10px] py-[8px]">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 100).map((r, i) => (
                          <tr key={i} className="border-t border-[#424850]/50">
                            {(previewCols.length
                              ? previewCols
                              : Object.keys(r)
                            ).map((c) => (
                              <td key={c} className="px-[10px] py-[6px] text-[#c8cdd3]">
                                {String(r[c] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === 'lineage' ? (
              <div className="min-h-0 flex-1 overflow-auto p-[16px]">
                {!lineage?.edges.length ? (
                  <p className="text-[12px] text-[#a3afbe]">
                    Add models with ref() or FROM dependencies to see lineage.
                  </p>
                ) : (
                  <ul className="space-y-[8px]">
                    {lineage.edges.map((e, i) => (
                      <li
                        key={i}
                        className="rounded-[4px] border border-[#424850] bg-[#0f1215] px-[12px] py-[10px] text-[11px] text-[#c8cdd3]"
                      >
                        <span className="text-[#7aecd0]">{e.fromName}</span>
                        <span className="mx-[8px] text-[#6b7380]">→</span>
                        <span className="font-semibold">{e.toName}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </QueAppChrome>
  )
}

export default ModelPage
