import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfGhostButton, PdfPageHeader } from '@/components/pdf/PdfUi'
import {
  HealthScorecard,
  PageAutofillBanner,
  type AutofillPageStatus,
} from '@/components/autofill/PageAutofill'
import { fetchPlatformHub, fetchExecutionSummary, type PlatformHubModule, type ExecutionSummary } from '@/services/stitchApi'

const STATUS_BORDER: Record<AutofillPageStatus, string> = {
  ready: 'border-[#7aecd0]/40 hover:border-[#7aecd0]/70',
  review: 'border-[#f0a020]/40 hover:border-[#f0a020]/70',
  empty: 'border-[#333] hover:border-[#555]',
  unavailable: 'border-[#ff6b6b]/30 hover:border-[#ff6b6b]/50',
}

const STATUS_DOT: Record<AutofillPageStatus, string> = {
  ready: 'bg-[#7aecd0]',
  review: 'bg-[#f0a020]',
  empty: 'bg-[#555]',
  unavailable: 'bg-[#ff6b6b]',
}

function ModuleCard({ module: m }: { module: PlatformHubModule }) {
  const status = (m.status || 'empty') as AutofillPageStatus
  return (
    <Link
      to={m.route}
      className={[
        'block rounded-lg border bg-[#1a1d1f] p-[16px] no-underline transition-colors',
        STATUS_BORDER[status],
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-[8px]">
        <span className="font-mono text-[22px] leading-none text-[#c3f400]" aria-hidden>
          {m.icon}
        </span>
        <span
          className={['mt-[4px] h-[8px] w-[8px] shrink-0 rounded-full', STATUS_DOT[status]].join(
            ' ',
          )}
          title={status}
        />
      </div>
      <h3 className="mt-[10px] text-[15px] font-semibold text-[#e8e8e8]">{m.label}</h3>
      <p className="mt-[2px] text-[11px] text-[#888]">{m.tagline}</p>
      <p className="mt-[10px] text-[13px] font-medium text-[#e8e8e8]">{m.headline}</p>
      {m.hints?.length ? (
        <p className="mt-[4px] text-[11px] text-[#888]">{m.hints.slice(0, 2).join(' · ')}</p>
      ) : null}
      <span className="mt-[12px] inline-block text-[11px] font-semibold text-[#c3f400]">
        {m.cta} →
      </span>
    </Link>
  )
}

/** Que Platform Hub — one login, six modules, live readiness. */
export function PlatformHubPage() {
  const [hub, setHub] = useState<Awaited<ReturnType<typeof fetchPlatformHub>> | null>(null)
  const [execution, setExecution] = useState<ExecutionSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [h, ex] = await Promise.all([
        fetchPlatformHub(),
        fetchExecutionSummary().catch(() => null),
      ])
      setHub(h)
      setExecution(ex)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <QueAppChrome eyebrow="PLATFORM · HUB">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-5xl md:px-lg">
        <PdfPageHeader
          title="Platform"
          subtitle="Load · Model · Studio · Catalog · Pipes · Observe — one warehouse-native workspace under a single login."
          actions={
            <PdfGhostButton onClick={() => void reload()} disabled={busy}>
              {busy ? 'Refreshing…' : 'Refresh'}
            </PdfGhostButton>
          }
        />

        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}

        {hub ? (
          <>
            <div className="mt-lg flex flex-wrap items-center gap-[16px]">
              {hub.health ? (
                <HealthScorecard
                  score={hub.health.score}
                  grade={hub.health.grade}
                  compact
                />
              ) : null}
              <div className="text-[12px] text-[#888]">
                {hub.summary.readyCount}/{hub.summary.moduleCount} modules ready
                {hub.summary.reviewCount > 0
                  ? ` · ${hub.summary.reviewCount} need review`
                  : ''}
              </div>
            </div>

            {hub.core.page ? (
              <div className="mt-md">
                <PageAutofillBanner page={hub.core.page} compact />
                <Link
                  to={hub.core.route}
                  className="mt-[8px] inline-block text-[12px] text-[#c3f400] hover:underline"
                >
                  Open workspace graph →
                </Link>
              </div>
            ) : null}

            {execution ? (
              <section className="mt-lg rounded-lg border border-[#424850] bg-[#1a1d1f] p-[16px]">
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <h2 className="font-headline text-[14px] font-semibold text-[#e8e8e8]">
                    Execution (Phase 3)
                  </h2>
                  <span
                    className={[
                      'rounded px-[8px] py-[2px] font-mono text-[10px] uppercase',
                      execution.readiness.status === 'ready'
                        ? 'bg-[#7aecd0]/15 text-[#7aecd0]'
                        : execution.readiness.status === 'review'
                          ? 'bg-[#f0a020]/15 text-[#f0a020]'
                          : 'bg-[#333] text-[#888]',
                    ].join(' ')}
                  >
                    {execution.readiness.status}
                  </span>
                </div>
                <p className="mt-[8px] text-[12px] text-[#aaa]">
                  {execution.readiness.label}
                </p>
                <div className="mt-[10px] flex flex-wrap gap-[12px] text-[11px] text-[#888]">
                  <span>{execution.readiness.warehouseTableCount} WH tables</span>
                  <span>{execution.readiness.materializedTableCount} materialized</span>
                  <span>{execution.readiness.recentSuccessfulRuns} recent runs</span>
                  {execution.readiness.failedQueueCount > 0 ? (
                    <span className="text-[#f0a020]">
                      {execution.readiness.failedQueueCount} queue failed
                    </span>
                  ) : null}
                </div>
                <div className="mt-[10px] flex flex-wrap gap-[6px]">
                  {execution.runSurfaces.map((s) => (
                    <Link
                      key={s.id}
                      to={s.route}
                      className="rounded border border-[#424850] px-[8px] py-[4px] text-[10px] text-[#7aecd0] no-underline hover:border-[#7aecd0]"
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {hub.phase1 ? (
              <section className="mt-lg rounded-lg border border-[#424850] bg-[#1a1d1f] p-[16px]">
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <h2 className="font-headline text-[14px] font-semibold text-[#e8e8e8]">
                    Warehouse (Phase 1)
                  </h2>
                  <span
                    className={[
                      'rounded px-[8px] py-[2px] font-mono text-[10px] uppercase',
                      hub.phase1.readiness?.status === 'ready'
                        ? 'bg-[#7aecd0]/15 text-[#7aecd0]'
                        : hub.phase1.readiness?.status === 'review'
                          ? 'bg-[#f0a020]/15 text-[#f0a020]'
                          : 'bg-[#333] text-[#888]',
                    ].join(' ')}
                  >
                    {hub.phase1.readiness?.status || 'empty'}
                  </span>
                </div>
                <p className="mt-[8px] text-[12px] text-[#aaa]">
                  {hub.phase1.readiness?.label || 'Provision Que Warehouse and sync a connector'}
                </p>
                <div className="mt-[10px] flex flex-wrap gap-[12px] text-[11px] text-[#888]">
                  <span>{hub.phase1.tableCount} raw table(s)</span>
                  <span>{hub.phase1.totalRows.toLocaleString()} rows replicated</span>
                  {hub.phase1.schemaName ? (
                    <span className="font-mono text-[#6b7380]">{hub.phase1.schemaName}</span>
                  ) : null}
                  {hub.phase1.replicateDefaultOn !== false ? (
                    <span className="text-[#7aecd0]">Full replicate default ON</span>
                  ) : null}
                </div>
                <Link
                  to="/load"
                  className="mt-[10px] inline-block text-[11px] font-semibold text-[#c3f400] hover:underline"
                >
                  Open Que Load →
                </Link>
              </section>
            ) : null}

            {hub.phase5 ? (
              <section className="mt-lg rounded-lg border border-[#424850] bg-[#1a1d1f] p-[16px]">
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <h2 className="font-headline text-[14px] font-semibold text-[#e8e8e8]">
                    Load ops (Phase 5)
                  </h2>
                  <span
                    className={[
                      'rounded px-[8px] py-[2px] font-mono text-[10px] uppercase',
                      hub.phase5.readiness.status === 'healthy'
                        ? 'bg-[#7aecd0]/15 text-[#7aecd0]'
                        : hub.phase5.readiness.status === 'critical'
                          ? 'bg-[#ff6b6b]/15 text-[#ff6b6b]'
                          : hub.phase5.readiness.status === 'degraded'
                            ? 'bg-[#f0a020]/15 text-[#f0a020]'
                            : 'bg-[#333] text-[#888]',
                    ].join(' ')}
                  >
                    {hub.phase5.readiness.status}
                  </span>
                </div>
                <p className="mt-[8px] text-[12px] text-[#aaa]">
                  {hub.phase5.readiness.label}
                </p>
                <div className="mt-[10px] flex flex-wrap gap-[12px] text-[11px] text-[#888]">
                  <span>{hub.phase5.pipelineCount} pipeline(s)</span>
                  <span>{hub.phase5.slaCounts?.healthy ?? 0} on SLA</span>
                  {hub.phase5.workerQueued > 0 ? (
                    <span>{hub.phase5.workerQueued} queued</span>
                  ) : null}
                  {hub.phase5.workerFailed7d > 0 ? (
                    <span className="text-[#f0a020]">
                      {hub.phase5.workerFailed7d} worker fail(s) · 7d
                    </span>
                  ) : null}
                  {hub.phase5.scheduledSyncEnabled ? (
                    <span className="text-[#7aecd0]">Scheduled sync ON</span>
                  ) : null}
                </div>
                <Link
                  to="/load?tab=runs"
                  className="mt-[10px] inline-block text-[11px] font-semibold text-[#c3f400] hover:underline"
                >
                  View run history →
                </Link>
              </section>
            ) : null}

            <div className="mt-xl grid gap-[12px] sm:grid-cols-2 lg:grid-cols-3">
              {hub.modules.map((m) => (
                <ModuleCard key={m.id} module={m} />
              ))}
            </div>

            <section className="mt-xl pb-lg">
              <h2 className="font-headline text-[15px] font-semibold text-[#e8e8e8]">
                Core surfaces
              </h2>
              <div className="mt-[10px] flex flex-wrap gap-[8px]">
                {[
                  { to: '/workspace', label: 'Schema graph' },
                  { to: '/chat', label: 'Chat & Agent' },
                  { to: '/pack-studio', label: 'Pack Studio' },
                  { to: '/joins', label: 'Join review' },
                  { to: '/jobs', label: 'Jobs' },
                  { to: '/monk', label: 'Monk Mode' },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="rounded border border-[#424850] px-[12px] py-[6px] text-[12px] text-[#c3f400] no-underline hover:border-[#c3f400]"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
              <p className="mt-[12px] text-[11px] text-[#666]">
                Production deploy: see{' '}
                <code className="text-[#888]">docs/ops/production-deploy-checklist.md</code>{' '}
                — run <code className="text-[#888]">npm run test:deploy-gate</code> before release.
              </p>
            </section>
          </>
        ) : busy ? (
          <p className="mt-lg text-[13px] text-[#888]">Loading platform hub…</p>
        ) : null}
      </div>
    </QueAppChrome>
  )
}
