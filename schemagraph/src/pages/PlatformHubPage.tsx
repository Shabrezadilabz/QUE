import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfGhostButton } from '@/components/pdf/PdfUi'
import {
  HealthScorecard,
  type AutofillPageStatus,
} from '@/components/autofill/PageAutofill'
import {
  fetchPlatformHub,
  fetchExecutionSummary,
  type PlatformHubModule,
  type ExecutionSummary,
} from '@/services/stitchApi'

const STATUS: Record<
  AutofillPageStatus,
  { border: string; badge: string; dot: string; label: string }
> = {
  ready: {
    border: 'border-[#7aecd0]/35 hover:border-[#7aecd0]/60',
    badge: 'bg-[#7aecd0]/15 text-[#7aecd0]',
    dot: 'bg-[#7aecd0]',
    label: 'Ready',
  },
  review: {
    border: 'border-[#f0a020]/35 hover:border-[#f0a020]/55',
    badge: 'bg-[#f0a020]/15 text-[#f0a020]',
    dot: 'bg-[#f0a020]',
    label: 'Review',
  },
  empty: {
    border: 'border-[#333] hover:border-[#484848]',
    badge: 'bg-[#333] text-[#888]',
    dot: 'bg-[#555]',
    label: 'Setup',
  },
  unavailable: {
    border: 'border-[#ff6b6b]/30 hover:border-[#ff6b6b]/50',
    badge: 'bg-[#ff6b6b]/15 text-[#ff6b6b]',
    dot: 'bg-[#ff6b6b]',
    label: 'Blocked',
  },
}

function StatusBadge({ status }: { status: AutofillPageStatus }) {
  const s = STATUS[status] ?? STATUS.empty
  return (
    <span
      className={[
        'inline-flex items-center gap-[5px] rounded-full px-[8px] py-[3px] text-[10px] font-bold uppercase tracking-wide',
        s.badge,
      ].join(' ')}
    >
      <span className={['size-[6px] rounded-full', s.dot].join(' ')} />
      {s.label}
    </span>
  )
}

function ModuleCard({ module: m }: { module: PlatformHubModule }) {
  const status = (m.status || 'empty') as AutofillPageStatus
  const s = STATUS[status] ?? STATUS.empty
  return (
    <Link
      to={m.route}
      className={[
        'group flex min-h-[168px] flex-col rounded-xl border bg-[#181b1e] p-[18px] no-underline transition-all duration-200',
        'hover:-translate-y-[1px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
        s.border,
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-[8px]">
        <div
          className="flex size-[40px] shrink-0 items-center justify-center rounded-[10px] bg-[#c3f400]/10 font-mono text-[18px] text-[#c3f400]"
          aria-hidden
        >
          {m.icon}
        </div>
        <StatusBadge status={status} />
      </div>
      <h3 className="mt-[14px] text-[15px] font-semibold text-[#f0f2f4]">{m.label}</h3>
      <p className="mt-[2px] text-[11px] leading-snug text-[#7a828a]">{m.tagline}</p>
      <p className="mt-[10px] flex-1 text-[13px] leading-snug text-[#c8cdd2]">{m.headline}</p>
      <span className="mt-[12px] text-[11px] font-semibold text-[#c3f400] transition-transform group-hover:translate-x-[2px]">
        {m.cta} →
      </span>
    </Link>
  )
}

function OpsCard({
  title,
  status,
  statusTone,
  description,
  stats,
  action,
  links,
}: {
  title: string
  status: string
  statusTone: 'ready' | 'review' | 'warn' | 'neutral'
  description: string
  stats: { label: string; value: string; warn?: boolean }[]
  action?: { to: string; label: string }
  links?: { to: string; label: string }[]
}) {
  const toneClass =
    statusTone === 'ready'
      ? 'bg-[#7aecd0]/15 text-[#7aecd0]'
      : statusTone === 'review'
        ? 'bg-[#f0a020]/15 text-[#f0a020]'
        : statusTone === 'warn'
          ? 'bg-[#ff6b6b]/15 text-[#ff6b6b]'
          : 'bg-[#333] text-[#888]'

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#2a3038] bg-[#14171a] p-[16px]">
      <div className="flex items-center justify-between gap-[8px]">
        <h3 className="text-[13px] font-semibold text-[#e8e8e8]">{title}</h3>
        <span
          className={[
            'rounded-full px-[8px] py-[2px] font-mono text-[9px] font-bold uppercase tracking-wide',
            toneClass,
          ].join(' ')}
        >
          {status}
        </span>
      </div>
      <p className="mt-[8px] text-[12px] leading-snug text-[#9aa3ad]">{description}</p>
      <dl className="mt-[12px] grid grid-cols-2 gap-x-[12px] gap-y-[8px]">
        {stats.map((row) => (
          <div key={row.label}>
            <dt className="text-[10px] uppercase tracking-wide text-[#6b7380]">{row.label}</dt>
            <dd
              className={[
                'mt-[1px] text-[13px] font-semibold tabular-nums',
                row.warn ? 'text-[#f0a020]' : 'text-[#e8e8e8]',
              ].join(' ')}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {links?.length ? (
        <div className="mt-[12px] flex flex-wrap gap-[6px]">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md border border-[#333] px-[8px] py-[4px] text-[10px] font-medium text-[#7aecd0] no-underline hover:border-[#7aecd0]/50"
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
      {action ? (
        <Link
          to={action.to}
          className="mt-auto pt-[12px] text-[11px] font-semibold text-[#c3f400] no-underline hover:underline"
        >
          {action.label} →
        </Link>
      ) : null}
    </div>
  )
}

function HubSkeleton() {
  return (
    <div className="animate-pulse space-y-[20px]">
      <div className="h-[88px] rounded-xl bg-[#1a1d1f]" />
      <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[168px] rounded-xl bg-[#1a1d1f]" />
        ))}
      </div>
    </div>
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

  const corePage = hub?.core?.page
  const needsReview = (hub?.summary.reviewCount ?? 0) > 0

  return (
    <QueAppChrome eyebrow="PLATFORM · HUB">
      <div className="mx-auto min-h-0 w-full max-w-[1200px] flex-1 overflow-y-auto px-[20px] py-[24px] md:px-[28px] md:py-[28px]">
        {/* Hero */}
        <header className="flex flex-wrap items-start justify-between gap-[16px]">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#f4f6f8]">Platform</h1>
            <p className="mt-[4px] max-w-[480px] text-[13px] leading-relaxed text-[#8b949e]">
              One warehouse-native workspace — load, model, analyze, and govern from a single login.
            </p>
          </div>
          <PdfGhostButton onClick={() => void reload()} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </PdfGhostButton>
        </header>

        {error ? <p className="mt-[16px] text-[13px] text-error">{error}</p> : null}

        {!hub && busy ? <div className="mt-[24px]"><HubSkeleton /></div> : null}

        {hub ? (
          <>
            {/* Summary strip */}
            <section className="mt-[20px] rounded-xl border border-[#2a3038] bg-[#12151a] p-[16px] md:p-[20px]">
              <div className="flex flex-col gap-[16px] lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-[16px]">
                  {hub.health ? (
                    <HealthScorecard
                      score={hub.health.score}
                      grade={hub.health.grade}
                      compact
                    />
                  ) : null}
                  <div className="flex flex-wrap gap-[8px]">
                    <span className="rounded-full border border-[#7aecd0]/30 bg-[#7aecd0]/10 px-[12px] py-[6px] text-[12px] font-semibold text-[#7aecd0]">
                      {hub.summary.readyCount}/{hub.summary.moduleCount} modules ready
                    </span>
                    {needsReview ? (
                      <span className="rounded-full border border-[#f0a020]/30 bg-[#f0a020]/10 px-[12px] py-[6px] text-[12px] font-semibold text-[#f0a020]">
                        {hub.summary.reviewCount} need review
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-[8px]">
                  <Link
                    to="/workspace"
                    className="rounded-lg border border-[#333] px-[14px] py-[8px] text-[12px] font-semibold text-[#c3f400] no-underline hover:border-[#c3f400]/40"
                  >
                    Workspace graph
                  </Link>
                  {corePage?.status === 'review' && corePage.href ? (
                    <Link
                      to={corePage.href}
                      className="rounded-lg border border-[#f0a020]/40 bg-[#f0a020]/10 px-[14px] py-[8px] text-[12px] font-semibold text-[#f0a020] no-underline hover:bg-[#f0a020]/15"
                    >
                      {corePage.cta || 'Run Monk Mode'}
                    </Link>
                  ) : (
                    <Link
                      to="/monk"
                      className="rounded-lg border border-[#333] px-[14px] py-[8px] text-[12px] font-semibold text-[#e8e8e8] no-underline hover:border-[#555]"
                    >
                      Monk Mode
                    </Link>
                  )}
                </div>
              </div>
              {corePage?.headline && needsReview ? (
                <p className="mt-[14px] border-t border-[#2a3038] pt-[14px] text-[12px] text-[#9aa3ad]">
                  <span className="font-semibold text-[#f0a020]">Attention · </span>
                  {corePage.headline}
                </p>
              ) : null}
            </section>

            {/* Modules — primary content */}
            <section className="mt-[28px]">
              <div className="mb-[14px] flex items-end justify-between gap-[12px]">
                <div>
                  <h2 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#8b949e]">
                    Modules
                  </h2>
                  <p className="mt-[2px] text-[12px] text-[#6b7380]">
                    Click a module to open Load, Model, Studio, and more.
                  </p>
                </div>
              </div>
              <div className="grid gap-[12px] sm:grid-cols-2 xl:grid-cols-3">
                {hub.modules.map((m) => (
                  <ModuleCard key={m.id} module={m} />
                ))}
              </div>
            </section>

            {/* Infrastructure ops — compact row */}
            <section className="mt-[28px]">
              <h2 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#8b949e]">
                Infrastructure
              </h2>
              <p className="mt-[2px] mb-[14px] text-[12px] text-[#6b7380]">
                Warehouse, pipelines, and SQL execution at a glance.
              </p>
              <div className="grid gap-[12px] lg:grid-cols-3">
                {hub.phase1 ? (
                  <OpsCard
                    title="Warehouse"
                    status={hub.phase1.readiness?.status || 'empty'}
                    statusTone={
                      hub.phase1.readiness?.status === 'ready'
                        ? 'ready'
                        : hub.phase1.readiness?.status === 'review'
                          ? 'review'
                          : 'neutral'
                    }
                    description={
                      hub.phase1.readiness?.label ||
                      'Provision Que Warehouse and sync a connector'
                    }
                    stats={[
                      { label: 'Raw tables', value: String(hub.phase1.tableCount) },
                      {
                        label: 'Rows replicated',
                        value: hub.phase1.totalRows.toLocaleString(),
                      },
                      {
                        label: 'Replicate',
                        value:
                          hub.phase1.replicateDefaultOn !== false ? 'Default ON' : 'Off',
                      },
                      {
                        label: 'Schema',
                        value: hub.phase1.schemaName
                          ? hub.phase1.schemaName.slice(0, 12) + '…'
                          : '—',
                      },
                    ]}
                    action={{ to: '/load', label: 'Open Load' }}
                  />
                ) : null}

                {hub.phase5 ? (
                  <OpsCard
                    title="Load ops"
                    status={hub.phase5.readiness.status}
                    statusTone={
                      hub.phase5.readiness.status === 'healthy'
                        ? 'ready'
                        : hub.phase5.readiness.status === 'critical'
                          ? 'warn'
                          : hub.phase5.readiness.status === 'degraded'
                            ? 'review'
                            : 'neutral'
                    }
                    description={hub.phase5.readiness.label}
                    stats={[
                      { label: 'Pipelines', value: String(hub.phase5.pipelineCount) },
                      {
                        label: 'On SLA',
                        value: String(hub.phase5.slaCounts?.healthy ?? 0),
                      },
                      {
                        label: 'Queued',
                        value: String(hub.phase5.workerQueued ?? 0),
                      },
                      {
                        label: 'Worker fails (7d)',
                        value: String(hub.phase5.workerFailed7d ?? 0),
                        warn: (hub.phase5.workerFailed7d ?? 0) > 0,
                      },
                    ]}
                    action={{ to: '/load?tab=runs', label: 'Run history' }}
                  />
                ) : null}

                {execution ? (
                  <OpsCard
                    title="Execution"
                    status={execution.readiness.status}
                    statusTone={
                      execution.readiness.status === 'ready'
                        ? 'ready'
                        : execution.readiness.status === 'review'
                          ? 'review'
                          : 'neutral'
                    }
                    description={execution.readiness.label}
                    stats={[
                      {
                        label: 'WH tables',
                        value: String(execution.readiness.warehouseTableCount),
                      },
                      {
                        label: 'Materialized',
                        value: String(execution.readiness.materializedTableCount),
                      },
                      {
                        label: 'Recent runs',
                        value: String(execution.readiness.recentSuccessfulRuns),
                      },
                      {
                        label: 'Queue failed',
                        value: String(execution.readiness.failedQueueCount),
                        warn: execution.readiness.failedQueueCount > 0,
                      },
                    ]}
                    links={execution.runSurfaces.map((s) => ({
                      to: s.route,
                      label: s.label,
                    }))}
                  />
                ) : null}
              </div>
            </section>

            {/* Quick links */}
            <section className="mt-[28px] pb-[8px]">
              <h2 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#8b949e]">
                Quick links
              </h2>
              <div className="mt-[12px] flex flex-wrap gap-[8px]">
                {[
                  { to: '/sources', label: 'Sources' },
                  { to: '/joins', label: 'Join review' },
                  { to: '/chat', label: 'Chat' },
                  { to: '/jobs', label: 'Jobs' },
                  { to: '/pack-studio', label: 'Pack Studio' },
                  { to: '/metrics', label: 'Metrics' },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="rounded-lg border border-[#2a3038] bg-[#14171a] px-[14px] py-[8px] text-[12px] font-medium text-[#c8cdd2] no-underline transition-colors hover:border-[#c3f400]/35 hover:text-[#c3f400]"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </QueAppChrome>
  )
}
