import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import {
  fetchReplicationPipelines,
  fetchQueWarehouseStatus,
  provisionQueWarehouseApi,
  fetchLoadSummary,
  runReplicationPipelineApi,
  runWorkspaceScheduledSync,
  syncConnection,
  type WarehouseQueueItem,
  type WarehouseWorkerStatus,
  type LoadPipeline,
} from '@/services/stitchApi'

type Tab = 'pipelines' | 'runs'

function SlaBadge({ tone, label }: { tone: string; label: string }) {
  const cls =
    tone === 'green'
      ? 'border-[#7aecd0]/40 bg-[#7aecd0]/10 text-[#7aecd0]'
      : tone === 'amber'
        ? 'border-[#f0a020]/40 bg-[#f0a020]/10 text-[#f0a020]'
        : tone === 'red'
          ? 'border-[#ff6b6b]/40 bg-[#ff6b6b]/10 text-[#ff6b6b]'
          : 'border-[#424850] bg-[#121619] text-[#a3afbe]'
  return (
    <span className={`rounded-full border px-[8px] py-[2px] text-[9px] font-bold tracking-wide uppercase ${cls}`}>
      {label}
    </span>
  )
}

function fmtTime(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/** Phase 5.1 — Que Load: pipelines, runs, SLA badges (Fivetran-class UX shell). */
export function LoadPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as Tab) || 'pipelines'
  const navigate = useNavigate()
  const { page: autofillPage } = usePageAutofill('load')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<{
    connections: LoadPipeline[]
    summary?: { total: number; scheduled: number; due: number }
    enabled?: boolean
  } | null>(null)
  const [loadReadiness, setLoadReadiness] = useState<{
    status: string
    label: string
  } | null>(null)
  const [pipelines, setPipelines] = useState<
    Awaited<ReturnType<typeof fetchReplicationPipelines>>
  >([])
  const [warehouse, setWarehouse] = useState<Awaited<
    ReturnType<typeof fetchQueWarehouseStatus>
  > | null>(null)
  const [worker, setWorker] = useState<WarehouseWorkerStatus | null>(null)
  const [queueItems, setQueueItems] = useState<WarehouseQueueItem[]>([])
  const [runLog, setRunLog] = useState<
    { id: string; name: string; ok: boolean; at: string; detail?: string }[]
  >([])

  const reload = useCallback(async () => {
    const [load, pipes] = await Promise.all([
      fetchLoadSummary().catch(() => null),
      fetchReplicationPipelines(),
    ])
    setPipelines(pipes)
    if (load) {
      setSchedule({
        connections: load.pipelines,
        summary: load.schedule,
        enabled: load.scheduledSyncEnabled,
      })
      setWarehouse(load.warehouse)
      setWorker(load.worker)
      setQueueItems(load.queueRecent)
      setLoadReadiness(load.readiness)
      setRunLog(
        load.recentRuns.map((r) => ({
          id: r.id,
          name: r.name,
          ok: r.ok,
          at: r.at,
          detail: r.detail,
        })),
      )
    } else {
      const wh = await fetchQueWarehouseStatus().catch(() => null)
      setWarehouse(wh)
    }
  }, [])

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [reload])

  const connectionPipelines = useMemo(() => {
    return (schedule?.connections || []).map((c) => ({
      id: c.id,
      kind: 'connection' as const,
      name: c.name,
      schedule: c.syncSchedule,
      sla: {
        tone: c.sla.tone,
        label: c.sla.label,
      },
      replicateToWarehouse: c.replicateToWarehouse !== false,
      lastSyncAt: c.lastSyncAt,
      nextAt: c.syncNextAt,
      errorKind: c.lastSyncErrorKind,
      syncable: c.syncable,
    }))
  }, [schedule])

  async function runConnectionSync(connectionId: string, name: string) {
    setBusy(true)
    setError(null)
    try {
      const result = await syncConnection(connectionId)
      setRunLog((prev) => [
        {
          id: connectionId,
          name,
          ok: true,
          at: new Date().toISOString(),
          detail: result.warehouse?.replicated
            ? `Replicated ${result.warehouse.totalRows ?? 0} row(s)`
            : 'Sync completed',
        },
        ...prev,
      ].slice(0, 40))
      setToast(`Synced ${name}`)
      await reload()
      if (result.showMonkPrompt !== false) {
        navigate(
          `/workspace?synced=${encodeURIComponent(connectionId)}&tables=${result.tablesSynced ?? 0}`,
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setRunLog((prev) => [
        {
          id: connectionId,
          name,
          ok: false,
          at: new Date().toISOString(),
          detail: msg,
        },
        ...prev,
      ].slice(0, 40))
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function runPipeline(pipelineId: string) {
    setBusy(true)
    try {
      await runReplicationPipelineApi(pipelineId)
      setToast('Replication pipeline run started')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runDueSyncs() {
    setBusy(true)
    try {
      const out = await runWorkspaceScheduledSync({ limit: 8 })
      setRunLog((prev) => [
        ...(out.results || []).map((r) => ({
          id: r.connectionId,
          name: r.name,
          ok: r.ok,
          at: new Date().toISOString(),
          detail: r.error,
        })),
        ...prev,
      ].slice(0, 40))
      setToast(`Ran ${out.ran} scheduled sync(s)`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function setTab(t: Tab) {
    const p = new URLSearchParams(searchParams)
    p.set('tab', t)
    setSearchParams(p, { replace: true })
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Que Load"
          subtitle="Connectors · raw replicate into Que Warehouse · pipeline runs & SLA"
          actions={
            <div className="flex flex-wrap items-center gap-[8px]">
              {loadReadiness ? (
                <SlaBadge
                  tone={
                    loadReadiness.status === 'healthy'
                      ? 'green'
                      : loadReadiness.status === 'critical'
                        ? 'red'
                        : loadReadiness.status === 'degraded'
                          ? 'amber'
                          : 'gray'
                  }
                  label={loadReadiness.status}
                />
              ) : null}
              <PdfGhostButton type="button" disabled={busy} onClick={() => void runDueSyncs()}>
                Run due syncs
              </PdfGhostButton>
              <PdfPrimaryButton type="button" onClick={() => navigate('/sources/new')}>
                + Add connector
              </PdfPrimaryButton>
            </div>
          }
        />

        {autofillPage ? (
          <div className="shrink-0 px-[16px] pt-[8px]">
            <PageAutofillBanner page={autofillPage} compact />
          </div>
        ) : null}

        <div className="flex shrink-0 gap-[8px] border-b border-solid border-[#424850] px-[16px]">
          {(['pipelines', 'runs'] as Tab[]).map((t) => (
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

        <div className="min-h-0 flex-1 overflow-y-auto p-[16px]">
          {!warehouse?.provisioned ? (
            <div className="mb-[16px] rounded-[4px] border border-[#f0a020]/30 bg-[#f0a020]/10 px-[14px] py-[12px]">
              <p className="text-[12px] font-semibold text-[#f0a020]">
                Que Warehouse not provisioned
              </p>
              <p className="mt-[4px] text-[11px] text-[#a3afbe]">
                Production workspaces auto-provision on create — click to ensure{' '}
                <code className="text-[#c8cdd3]">wh_&#123;workspace&#125;</code> exists.
              </p>
              <PdfPrimaryButton
                type="button"
                disabled={busy}
                className="mt-[10px] px-[12px] py-[6px] text-[11px]"
                onClick={() => {
                  setBusy(true)
                  void provisionQueWarehouseApi()
                    .then(() => {
                      setToast('Que Warehouse provisioned')
                      return reload()
                    })
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : String(e)),
                    )
                    .finally(() => setBusy(false))
                }}
              >
                Provision warehouse
              </PdfPrimaryButton>
            </div>
          ) : (
            <div className="mb-[16px] space-y-[8px]">
              <div className="rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[14px] py-[10px] text-[11px] text-[#a3afbe]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span>
                    Que Warehouse · {warehouse.tableCount ?? 0} raw table(s) ·{' '}
                    {(warehouse.totalRows ?? 0).toLocaleString()} rows replicated
                  </span>
                  {warehouse.readiness?.status ? (
                    <SlaBadge
                      tone={
                        warehouse.readiness.status === 'ready'
                          ? 'green'
                          : warehouse.readiness.status === 'review'
                            ? 'amber'
                            : 'gray'
                      }
                      label={warehouse.readiness.status}
                    />
                  ) : null}
                </div>
                {warehouse.replicateDefaultOn !== false ? (
                  <span className="ml-[8px] rounded border border-[#7aecd0]/30 px-[6px] py-[1px] text-[9px] font-bold text-[#7aecd0] uppercase">
                    Full raw replicate · default ON
                  </span>
                ) : null}
                {worker?.schemaName || warehouse.registry?.schemaName ? (
                  <span className="ml-[8px] text-[#6b7380]">
                    ({worker?.schemaName || warehouse.registry?.schemaName})
                  </span>
                ) : null}
                {warehouse.readiness?.label ? (
                  <p className="mt-[6px] text-[10px] text-[#8a9099]">
                    {warehouse.readiness.label}
                  </p>
                ) : null}
                {loadReadiness?.label ? (
                  <p className="mt-[4px] text-[10px] text-[#a3afbe]">
                    Load SLA · {loadReadiness.label}
                  </p>
                ) : null}
              </div>
              {worker ? (
                <div className="flex flex-wrap items-center gap-[8px] rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[14px] py-[10px] text-[11px]">
                  <span className="font-semibold text-[#d4dbe3]">Worker pool</span>
                  <SlaBadge
                    tone={worker.enabled ? 'green' : 'gray'}
                    label={worker.enabled ? 'Active' : 'Off'}
                  />
                  <span className="text-[#8a9099]">
                    queued {worker.queued} · running {worker.running} · ok {worker.succeeded7d} ·
                    fail {worker.failed7d} (7d)
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {tab === 'pipelines' ? (
            <div className="space-y-[16px]">
              <section>
                <h2 className="mb-[8px] text-[11px] font-bold tracking-widest text-[#8a9099] uppercase">
                  Source connectors
                </h2>
                <div className="overflow-hidden rounded-[4px] border border-solid border-[#424850]">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="bg-[#121619] text-[#8a9099]">
                      <tr>
                        <th className="px-[12px] py-[8px]">Pipeline</th>
                        <th className="px-[12px] py-[8px]">Schedule</th>
                        <th className="px-[12px] py-[8px]">SLA</th>
                        <th className="px-[12px] py-[8px]">Last sync</th>
                        <th className="px-[12px] py-[8px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {connectionPipelines.map((p) => (
                        <tr key={p.id} className="border-t border-solid border-[#424850]/60">
                          <td className="px-[12px] py-[10px] font-medium text-[#d4dbe3]">
                            {p.name}
                            <span className="ml-[6px] text-[9px] text-[#6b7380]">
                              {p.replicateToWarehouse !== false ? '→ Que WH' : '· schema only'}
                            </span>
                          </td>
                          <td className="px-[12px] py-[10px] text-[#a3afbe]">
                            {p.schedule || 'manual'}
                          </td>
                          <td className="px-[12px] py-[10px]">
                            <SlaBadge tone={p.sla.tone} label={p.sla.label} />
                          </td>
                          <td className="px-[12px] py-[10px] text-[#a3afbe]">
                            {fmtTime(p.lastSyncAt)}
                          </td>
                          <td className="px-[12px] py-[10px] text-right">
                            <button
                              type="button"
                              disabled={busy || !p.syncable}
                              className="pdf-btn-ghost px-[8px] py-[4px] text-[10px] disabled:opacity-40"
                              onClick={() => void runConnectionSync(p.id, p.name)}
                            >
                              ▶ Sync now
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!connectionPipelines.length ? (
                        <tr>
                          <td colSpan={5} className="px-[12px] py-[24px] text-center text-[#a3afbe]">
                            No connectors yet —{' '}
                            <Link to="/sources/new" className="text-[#7aecd0] underline">
                              add a source
                            </Link>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              {pipelines.length ? (
                <section>
                  <h2 className="mb-[8px] text-[11px] font-bold tracking-widest text-[#8a9099] uppercase">
                    Replication pipelines
                  </h2>
                  <ul className="space-y-[8px]">
                    {pipelines.map((pipe) => (
                      <li
                        key={pipe.id}
                        className="flex flex-wrap items-center justify-between gap-[8px] rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[10px]"
                      >
                        <div>
                          <p className="text-[12px] font-medium text-[#d4dbe3]">
                            {pipe.tableNames?.length ?? 0} table(s)
                          </p>
                          <p className="text-[10px] text-[#8a9099]">
                            Status: {pipe.lastStatus || 'never run'}
                            {pipe.lastRowCount != null
                              ? ` · ${pipe.lastRowCount} rows`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          className="pdf-btn-ghost px-[10px] py-[4px] text-[10px]"
                          onClick={() => void runPipeline(pipe.id)}
                        >
                          ▶ Run pipeline
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <section className="space-y-[16px]">
              {queueItems.length ? (
                <div>
                  <h2 className="mb-[8px] text-[11px] font-bold tracking-widest text-[#8a9099] uppercase">
                    Warehouse job queue
                  </h2>
                  <ul className="space-y-[8px]">
                    {queueItems.map((q) => (
                      <li
                        key={q.id}
                        className="rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[10px]"
                      >
                        <div className="flex items-center justify-between gap-[8px]">
                          <p className="text-[12px] font-medium text-[#d4dbe3]">
                            {q.kind}
                            {q.jobId ? ` · job ${q.jobId.slice(0, 8)}…` : ''}
                          </p>
                          <SlaBadge
                            tone={
                              q.status === 'succeeded'
                                ? 'green'
                                : q.status === 'failed'
                                  ? 'red'
                                  : q.status === 'running'
                                    ? 'amber'
                                    : 'gray'
                            }
                            label={q.status}
                          />
                        </div>
                        <p className="mt-[4px] text-[10px] text-[#8a9099]">
                          {fmtTime(q.createdAt)} · {q.trigger}
                          {q.error ? ` · ${q.error}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
              <h2 className="mb-[8px] text-[11px] font-bold tracking-widest text-[#8a9099] uppercase">
                Recent runs
              </h2>
              <ul className="space-y-[8px]">
                {runLog.map((r, i) => (
                  <li
                    key={`${r.id}-${i}`}
                    className="rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[10px]"
                  >
                    <div className="flex items-center justify-between gap-[8px]">
                      <p className="text-[12px] font-medium text-[#d4dbe3]">{r.name}</p>
                      <SlaBadge
                        tone={r.ok ? 'green' : 'red'}
                        label={r.ok ? 'OK' : 'Failed'}
                      />
                    </div>
                    <p className="mt-[4px] text-[10px] text-[#8a9099]">{fmtTime(r.at)}</p>
                    {r.detail ? (
                      <p className="mt-[4px] text-[10px] text-[#a3afbe]">{r.detail}</p>
                    ) : null}
                  </li>
                ))}
                {!runLog.length ? (
                  <p className="py-[24px] text-center text-[12px] text-[#a3afbe]">
                    No runs yet — sync a connector or run due syncs.
                  </p>
                ) : null}
              </ul>
              </div>
            </section>
          )}
        </div>
      </div>
    </QueAppChrome>
  )
}

export default LoadPage
