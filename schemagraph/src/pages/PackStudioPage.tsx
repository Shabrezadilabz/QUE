import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfPrimaryButton, PdfGhostButton } from '@/components/pdf/PdfUi'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  fetchPackStudioSuggest,
  fetchPackStudioSummary,
  saveBlendedPackApi,
  upsertCustomPackApi,
  fetchEntityMappings,
  updateColumnMapsApi,
  learnGoldenPairsApi,
  fetchLearnedGoldenPairs,
  fetchReplicationPipelines,
  runReplicationPipelineApi,
  fetchReplicationV2Scope,
  runReplicationV2Api,
  fetchLookerExport,
  fetchMetabaseExport,
  fetchPowerBiExport,
  fetchTableauExport,
  fetchOrchestratorRecipes,
  pushReverseEtlApi,
  fetchLookerMergeKit,
  fetchMonkPacks,
  forkPackStudioApi,
  diffPackStudioApi,
  fetchBiMarketplace,
  type IndustryPackMeta,
  type PackStudioSummary,
} from '@/services/stitchApi'

type StudioTab = 'overview' | 'blend' | 'maps' | 'replication' | 'exports'

const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'blend', label: 'Blend & custom' },
  { id: 'maps', label: 'Maps & golden' },
  { id: 'replication', label: 'Replication' },
  { id: 'exports', label: 'Exports' },
]

type BlendedPreview = {
  id?: string
  displayName?: string
  industry?: string
  description?: string
  blendedFrom?: string[]
  kpis?: { id: string; label: string }[]
  jobs?: { id: string; title: string }[]
}

/** Pack Studio — custom packs, column maps, golden pairs, replication, exports. */
export function PackStudioPage() {
  const { canWrite } = useWorkspaceRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const studioTab = (searchParams.get('tab') as StudioTab) || 'overview'
  const [summary, setSummary] = useState<PackStudioSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [ranked, setRanked] = useState<
    { packId: string; displayName: string; scorePct: number }[]
  >([])
  const [blended, setBlended] = useState<BlendedPreview | null>(null)
  const [packs, setPacks] = useState<IndustryPackMeta[]>([])
  const [packId, setPackId] = useState('ecommerce-v1')
  const [mappings, setMappings] = useState<
    { entity: string; tableName: string; columnMap: Record<string, string> }[]
  >([])
  const [columnDraft, setColumnDraft] = useState<Record<string, string>>({})
  const [goldenPairs, setGoldenPairs] = useState<
    { fromTable: string; fromColumn: string; toTable: string; toColumn: string; hitCount?: number }[]
  >([])
  const [pipelines, setPipelines] = useState<
    { id: string; tableNames: string[]; lastStatus?: string; lastRowCount?: number | null }[]
  >([])
  const [customKpiLabel, setCustomKpiLabel] = useState('')
  const [customEntity, setCustomEntity] = useState('FactOrder')
  const [customPattern, setCustomPattern] = useState('orders')
  const [forkPreview, setForkPreview] = useState<BlendedPreview | null>(null)
  const [packDiff, setPackDiff] = useState<{ summary: string } | null>(null)
  const [marketplace, setMarketplace] = useState<
    { id: string; title: string; widgetCount: number }[]
  >([])

  const reload = useCallback(async () => {
    const [suggest, gp, pipes, builtIn, mkt, hub] = await Promise.all([
      fetchPackStudioSuggest(),
      fetchLearnedGoldenPairs().catch(() => []),
      fetchReplicationPipelines().catch(() => []),
      fetchMonkPacks(),
      fetchBiMarketplace().catch(() => []),
      fetchPackStudioSummary().catch(() => null),
    ])
    setRanked(suggest.ranked || [])
    setBlended(suggest.blended || null)
    setPacks(builtIn)
    setGoldenPairs(gp)
    setPipelines(pipes)
    setMarketplace(mkt)
    setSummary(hub)
    if (suggest.blended?.id && typeof suggest.blended.id === 'string') {
      setPackId(suggest.blended.id)
    }
  }, [])

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [reload])

  useEffect(() => {
    void fetchEntityMappings(packId)
      .then((items) => {
        setMappings(
          items.map((m) => ({
            entity: m.entity,
            tableName: m.tableName,
            columnMap: m.columnMap || {},
          })),
        )
      })
      .catch(() => setMappings([]))
  }, [packId])

  async function saveBlend() {
    if (!blended || !canWrite) return
    setBusy(true)
    try {
      const item = await saveBlendedPackApi(blended)
      setToast(`Saved blended pack: ${item.packId}`)
      setPackId(item.packId)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveCustomPack() {
    if (!canWrite) return
    setBusy(true)
    try {
      const item = await upsertCustomPackApi({
        packId,
        displayName: `Custom ${customEntity}`,
        industry: 'Custom',
        entities: [{ entity: customEntity, pattern: customPattern, weight: 1 }],
        kpis: customKpiLabel
          ? [{ id: customKpiLabel.toLowerCase().replace(/\s+/g, '_'), label: customKpiLabel, sqlTemplate: `SELECT COUNT(*) FROM {${customPattern}}` }]
          : [],
        jobs: [],
      })
      setToast(`Custom pack saved: ${item.packId}`)
      setPackId(item.packId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveColumnMaps() {
    if (!canWrite) return
    setBusy(true)
    try {
      const updated = mappings.map((m) => ({
        entity: m.entity,
        columnMap: { ...m.columnMap, ...columnDraft },
      }))
      await updateColumnMapsApi(packId, updated)
      setToast('Column mappings saved')
      setColumnDraft({})
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function learnGolden() {
    setBusy(true)
    try {
      const out = await learnGoldenPairsApi()
      setGoldenPairs(out.pairs || [])
      setToast(`Learned ${out.learnedCount ?? 0} golden pair(s)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function downloadLooker() {
    const md = String(await fetchLookerExport({ format: 'markdown' }))
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'que-looker-export.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadMetabase() {
    const data = await fetchMetabaseExport()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'que-metabase-dashboard.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function forkPack() {
    if (!canWrite) return
    setBusy(true)
    try {
      const fork = await forkPackStudioApi(packId, 'studio')
      setForkPreview(fork as BlendedPreview)
      setToast(`Forked ${packId} → ${String(fork.id)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function diffFork() {
    if (!forkPreview?.id) return
    setBusy(true)
    try {
      const diff = await diffPackStudioApi(packId, String(forkPreview.id))
      setPackDiff(diff)
      setToast(diff.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function setStudioTab(tab: StudioTab) {
    const p = new URLSearchParams(searchParams)
    p.set('tab', tab)
    setSearchParams(p, { replace: true })
  }

  const showBlend = studioTab === 'overview' || studioTab === 'blend'
  const showMaps = studioTab === 'overview' || studioTab === 'maps'
  const showReplication = studioTab === 'overview' || studioTab === 'replication'
  const showExports = studioTab === 'overview' || studioTab === 'exports'

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416] p-[20px]">
        <PdfPageHeader
          title="Pack Studio"
          subtitle="S12 — fork/diff packs, BI template marketplace, blend verticals, export mesh."
          actions={
            <div className="flex flex-wrap gap-[8px]">
              <Link to="/hub" className="rounded-[10px] border border-[#424850] px-[12px] py-[6px] text-[12px] font-semibold text-[#c8cdd3]">
                Platform →
              </Link>
              <Link to="/monk" className="rounded-[10px] border border-[#424850] px-[12px] py-[6px] text-[12px] font-semibold text-[#c8cdd3]">
                Monk Mode →
              </Link>
              <PdfGhostButton type="button" disabled={busy} onClick={() => void reload()}>
                Refresh
              </PdfGhostButton>
            </div>
          }
        />

        {error ? (
          <p className="mb-[12px] rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-[12px] py-[8px] text-[12px] text-rose-200">{error}</p>
        ) : null}
        {toast ? (
          <p className="mb-[12px] rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 px-[12px] py-[8px] text-[12px] text-emerald-200">{toast}</p>
        ) : null}

        {summary ? (
          <div className="mb-[14px] grid gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Top pack match',
                value: `${summary.readiness.topPackScore}%`,
                sub: summary.readiness.topPackName || '—',
              },
              {
                label: 'Golden pairs',
                value: summary.goldenPairCount,
                sub: 'learned from joins',
              },
              {
                label: 'Replication',
                value: summary.pipelines.length,
                sub:
                  summary.readiness.failedPipelineCount > 0
                    ? `${summary.readiness.failedPipelineCount} failed`
                    : 'pipelines',
              },
              {
                label: 'Exports',
                value: summary.exportTargets.length,
                sub: summary.readiness.label,
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-[12px] border border-[#2a3038] bg-[#15191e] px-[14px] py-[10px]"
              >
                <div className="text-[10px] uppercase tracking-wider text-[#8b949e]">
                  {c.label}
                </div>
                <div className="mt-[4px] text-[20px] font-semibold text-[#e8edf2]">
                  {c.value}
                </div>
                <div className="text-[11px] text-[#8b949e]">{c.sub}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-[14px] flex shrink-0 flex-wrap gap-[8px] border-b border-[#2a3038] pb-[8px]">
          {STUDIO_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStudioTab(t.id)}
              className={[
                'rounded-[8px] px-[12px] py-[6px] text-[12px] font-semibold',
                studioTab === t.id
                  ? 'bg-[#7aecd0]/15 text-[#7aecd0]'
                  : 'text-[#8b949e] hover:text-[#c8cdd3]',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 gap-[16px] overflow-y-auto xl:grid-cols-2">
          {showBlend ? (
          <section className="rounded-[16px] border border-[#2a3038] bg-[#15191e] p-[18px]">
            <h2 className="text-[14px] font-semibold text-[#e8edf2]">AI pack blend</h2>
            <p className="mt-[6px] text-[12px] text-[#8b949e]">
              Que scores your schema against all verticals and suggests a merged pack.
            </p>
            <ul className="mt-[12px] space-y-[6px]">
              {ranked.map((r) => (
                <li key={r.packId} className="flex justify-between rounded-[8px] bg-[#0f1215] px-[10px] py-[8px] text-[12px]">
                  <span className="text-[#e8edf2]">{r.displayName}</span>
                  <span className="font-semibold text-sky-300">{r.scorePct}%</span>
                </li>
              ))}
            </ul>
            {blended ? (
              <div className="mt-[14px] rounded-[12px] border border-sky-500/25 bg-sky-500/5 p-[12px]">
                <p className="text-[13px] font-semibold text-sky-200">{blended.displayName}</p>
                <p className="mt-[4px] text-[11px] text-[#9aa3ad]">{blended.description}</p>
                <p className="mt-[8px] text-[11px] text-[#8b949e]">
                  KPIs: {blended.kpis?.length ?? 0} · Jobs: {blended.jobs?.length ?? 0}
                </p>
                <PdfPrimaryButton type="button" className="mt-[12px]" disabled={!canWrite || busy} onClick={() => void saveBlend()}>
                  Save blended pack
                </PdfPrimaryButton>
              </div>
            ) : null}
          </section>
          ) : null}

          {showBlend ? (
          <section className="rounded-[16px] border border-[#2a3038] bg-[#15191e] p-[18px]">
            <h2 className="text-[14px] font-semibold text-[#e8edf2]">Custom pack builder</h2>
            <div className="mt-[12px] space-y-[10px]">
              <label className="block text-[11px] text-[#9aa3ad]">
                Base pack
                <select value={packId} onChange={(e) => setPackId(e.target.value)} className="mt-[4px] w-full rounded-[8px] border border-[#424850] bg-[#0f1215] px-[10px] py-[8px] text-[12px] text-[#e8edf2]">
                  {packs.map((p) => (
                    <option key={p.id} value={p.id}>{p.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-[#9aa3ad]">
                Entity / pattern
                <div className="mt-[4px] flex gap-[8px]">
                  <input value={customEntity} onChange={(e) => setCustomEntity(e.target.value)} className="flex-1 rounded-[8px] border border-[#424850] bg-[#0f1215] px-[10px] py-[8px] text-[12px]" placeholder="FactOrder" />
                  <input value={customPattern} onChange={(e) => setCustomPattern(e.target.value)} className="flex-1 rounded-[8px] border border-[#424850] bg-[#0f1215] px-[10px] py-[8px] text-[12px]" placeholder="orders" />
                </div>
              </label>
              <label className="block text-[11px] text-[#9aa3ad]">
                KPI label (optional)
                <input value={customKpiLabel} onChange={(e) => setCustomKpiLabel(e.target.value)} className="mt-[4px] w-full rounded-[8px] border border-[#424850] bg-[#0f1215] px-[10px] py-[8px] text-[12px]" placeholder="Revenue by brand" />
              </label>
              <PdfPrimaryButton type="button" disabled={!canWrite || busy} onClick={() => void saveCustomPack()}>
                Save custom pack
              </PdfPrimaryButton>
              <div className="flex flex-wrap gap-[8px] border-t border-[#2a3038] pt-[10px]">
                <PdfGhostButton type="button" disabled={!canWrite || busy} onClick={() => void forkPack()}>
                  Fork pack
                </PdfGhostButton>
                <PdfGhostButton type="button" disabled={!forkPreview || busy} onClick={() => void diffFork()}>
                  Diff vs fork
                </PdfGhostButton>
              </div>
              {forkPreview ? (
                <p className="text-[11px] text-[#8b949e]">
                  Fork: {forkPreview.displayName} ({forkPreview.id})
                </p>
              ) : null}
              {packDiff ? (
                <p className="text-[11px] text-emerald-300/90">{packDiff.summary}</p>
              ) : null}
            </div>
          </section>
          ) : null}

          {showBlend && marketplace.length > 0 ? (
            <section className="rounded-[16px] border border-[#2a3038] bg-[#15191e] p-[18px]">
              <h2 className="text-[14px] font-semibold text-[#e8edf2]">BI template marketplace (RS-7)</h2>
              <ul className="mt-[12px] space-y-[8px] text-[12px] text-[#c8cdd3]">
                {marketplace.map((t) => (
                  <li key={t.id} className="flex justify-between rounded-[8px] border border-[#2a3038] px-[10px] py-[8px]">
                    <span>{t.title}</span>
                    <span className="text-[#8b949e]">{t.widgetCount} widgets</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showMaps ? (
          <section className="rounded-[16px] border border-[#2a3038] bg-[#15191e] p-[18px]">
            <h2 className="text-[14px] font-semibold text-[#e8edf2]">Column mapping</h2>
            <p className="mt-[6px] text-[12px] text-[#8b949e]">Map logical columns to physical names (e.g. order_total → revenue_amt).</p>
            <ul className="mt-[12px] space-y-[10px]">
              {mappings.map((m) => (
                <li key={m.entity} className="rounded-[10px] border border-[#2a3038] bg-[#0f1215] p-[10px]">
                  <p className="text-[12px] font-semibold text-[#e8edf2]">{m.entity} → {m.tableName}</p>
                  <input
                    className="mt-[6px] w-full rounded-[8px] border border-[#424850] bg-[#15191e] px-[10px] py-[6px] text-[11px]"
                    placeholder="order_total:revenue_amt, brand_id:brand_key"
                    onChange={(e) => {
                      const pairs = Object.fromEntries(
                        e.target.value.split(',').map((s) => s.trim().split(':')).filter(([a, b]) => a && b),
                      )
                      setColumnDraft((prev) => ({ ...prev, ...pairs }))
                    }}
                  />
                </li>
              ))}
            </ul>
            <PdfGhostButton type="button" className="mt-[12px]" disabled={!canWrite || busy} onClick={() => void saveColumnMaps()}>
              Save column maps
            </PdfGhostButton>
          </section>
          ) : null}

          {(showMaps || showReplication || showExports) ? (
          <>
          <section className="rounded-[16px] border border-[#2a3038] bg-[#15191e] p-[18px]">
            <h2 className="text-[14px] font-semibold text-[#e8edf2]">Orchestration & reverse ETL</h2>
            <div className="mt-[10px] flex flex-wrap gap-[8px]">
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void fetchOrchestratorRecipes()
                    .then((r) => {
                      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'que-orchestrator-recipes.json'
                      a.click()
                      URL.revokeObjectURL(url)
                      setToast('Kestra + n8n recipes downloaded')
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Download orchestrator recipes
              </PdfGhostButton>
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void pushReverseEtlApi({ destination: 'salesforce' })
                    .then((r) => setToast(`Reverse ETL — ${r.pushedRows ?? 0} rows to Salesforce`))
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Push cert segment → Salesforce
              </PdfGhostButton>
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void fetchLookerMergeKit({ reportId: 'sportedge-exec' })
                    .then((k) => {
                      const blob = new Blob([JSON.stringify(k, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'que-looker-merge-kit.json'
                      a.click()
                      URL.revokeObjectURL(url)
                      setToast('Looker merge kit downloaded')
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Looker merge kit
              </PdfGhostButton>
            </div>
          </section>

          <section className="rounded-[16px] border border-[#2a3038] bg-[#15191e] p-[18px]">
            <h2 className="text-[14px] font-semibold text-[#e8edf2]">Golden pairs & replication</h2>
            <div className="mt-[10px] flex flex-wrap gap-[8px]">
              <PdfGhostButton type="button" disabled={busy} onClick={() => void learnGolden()}>
                Learn from joins + SQL history
              </PdfGhostButton>
              <PdfGhostButton type="button" disabled={busy} onClick={() => void downloadLooker()}>
                Export Looker
              </PdfGhostButton>
              <PdfGhostButton type="button" disabled={busy} onClick={() => void downloadMetabase()}>
                Export Metabase JSON
              </PdfGhostButton>
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void fetchPowerBiExport({ reportId: 'sportedge-exec' })
                    .then((p) => {
                      const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'que-powerbi-sportedge.json'
                      a.click()
                      URL.revokeObjectURL(url)
                      setToast('Power BI export downloaded')
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Export Power BI
              </PdfGhostButton>
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void fetchTableauExport({ reportId: 'sportedge-exec' })
                    .then((p) => {
                      const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'que-tableau-sportedge.json'
                      a.click()
                      URL.revokeObjectURL(url)
                      setToast('Tableau export downloaded')
                    })
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Export Tableau
              </PdfGhostButton>
            </div>
            <p className="mt-[12px] text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">Learned pairs ({goldenPairs.length})</p>
            <ul className="mt-[6px] max-h-[120px] overflow-y-auto text-[11px] text-[#9aa3ad]">
              {goldenPairs.slice(0, 12).map((p, i) => (
                <li key={i}>{p.fromTable}.{p.fromColumn} → {p.toTable}.{p.toColumn}</li>
              ))}
            </ul>
            <p className="mt-[12px] text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">Replication pipelines (Fivetran-lite)</p>
            <div className="mt-[6px] flex flex-wrap gap-[8px]">
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void fetchReplicationV2Scope('snowflake')
                    .then((s) =>
                      setToast(
                        s.status === 'ready_to_plan'
                          ? `Snowflake v2 scope: ${s.recommendedTables.length} tables → ${s.plan.targetSchema}`
                          : 'Connect Snowflake first for replication v2 scope',
                      ),
                    )
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Scope Snowflake v2
              </PdfGhostButton>
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void fetchReplicationV2Scope('databricks')
                    .then((s) =>
                      setToast(
                        s.status === 'ready_to_plan'
                          ? `Databricks v2 scope: ${s.recommendedTables.length} tables`
                          : 'Connect Databricks first for replication v2 scope',
                      ),
                    )
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Scope Databricks v2
              </PdfGhostButton>
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void runReplicationV2Api('snowflake')
                    .then((r) =>
                      setToast(`Snowflake v2 E2E — ${r.totalRows ?? 0} rows (simulated)`),
                    )
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Run Snowflake v2 E2E
              </PdfGhostButton>
              <PdfGhostButton
                type="button"
                disabled={busy}
                onClick={() =>
                  void runReplicationV2Api('databricks')
                    .then((r) =>
                      setToast(`Databricks v2 E2E — ${r.totalRows ?? 0} rows (simulated)`),
                    )
                    .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                }
              >
                Run Databricks v2 E2E
              </PdfGhostButton>
            </div>
            <ul className="mt-[6px] space-y-[6px]">
              {pipelines.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-[8px] bg-[#0f1215] px-[10px] py-[8px] text-[11px]">
                  <span>{p.tableNames?.join(', ') || '—'}</span>
                  <button type="button" className="text-sky-300 hover:underline" disabled={busy} onClick={() => void runReplicationPipelineApi(p.id).then(() => setToast('Replication run complete'))}>
                    Run
                  </button>
                </li>
              ))}
              {!pipelines.length ? (
                <li className="text-[11px] text-[#8b949e]">Run Monk Mode to auto-create a pipeline for matched tables.</li>
              ) : null}
            </ul>
          </section>
          </>
          ) : null}
        </div>
      </div>
    </QueAppChrome>
  )
}

export default PackStudioPage
