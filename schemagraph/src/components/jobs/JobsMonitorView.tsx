import { Link } from 'react-router-dom'
import type { DriftEvent, JobStatus, StitchJob } from '@/services/stitchApi'

export type LiveLogRow = {
  id: string
  ts: string
  level: string
  message: string
  jobTitle?: string
}

type JobsMonitorViewProps = {
  jobs: StitchJob[]
  filtered: StitchJob[]
  filter: string
  onFilterChange: (v: string) => void
  onRefresh: () => void
  onOpenJob: (jobId: string) => void
  onCreate: () => void
  canWrite: boolean
  liveLogs: LiveLogRow[]
  logQuery: string
  onLogQueryChange: (v: string) => void
  openDrift: DriftEvent[]
  streamPaused: boolean
  onToggleStreamPause: () => void
}

function jobUiStatus(job: StitchJob): {
  label: string
  kind: 'running' | 'failed' | 'idle' | 'done'
} {
  if (job.status === 'archived') return { label: 'Idle', kind: 'idle' }
  if (job.status === 'exported') return { label: 'Completed', kind: 'done' }
  if (job.status === 'ready') return { label: 'Ready', kind: 'done' }
  if (job.status === 'draft') return { label: 'Idle', kind: 'idle' }
  return { label: job.status, kind: 'idle' }
}

function progressFor(job: StitchJob): number | null {
  if (job.status === 'exported') return 100
  if (job.status === 'ready') return 92
  if (job.status === 'draft') return null
  return 45
}

function statusPill(kind: 'running' | 'failed' | 'idle' | 'done') {
  if (kind === 'running')
    return 'bg-tertiary/10 text-tertiary'
  if (kind === 'failed') return 'bg-error/10 text-error'
  if (kind === 'done') return 'bg-tertiary/10 text-tertiary'
  return 'bg-secondary-container text-on-secondary-container'
}

/**
 * Sunset Clay Sync Jobs monitor — cards, health strip, live stream.
 */
export function JobsMonitorView({
  jobs,
  filtered,
  filter,
  onFilterChange,
  onRefresh,
  onOpenJob,
  onCreate,
  canWrite,
  liveLogs,
  logQuery,
  onLogQueryChange,
  openDrift,
  streamPaused,
  onToggleStreamPause,
}: JobsMonitorViewProps) {
  const readyCount = jobs.filter(
    (j) => j.status === 'ready' || j.status === 'exported',
  ).length
  const draftCount = jobs.filter((j) => j.status === 'draft').length
  const systemOk = openDrift.length === 0
  const hero = filtered[0] ?? jobs[0] ?? null
  const heroProgress = hero ? progressFor(hero) ?? 68 : 0

  const filteredLogs = liveLogs.filter((l) => {
    const q = logQuery.trim().toLowerCase()
    if (!q) return true
    return (
      l.message.toLowerCase().includes(q) ||
      l.level.toLowerCase().includes(q) ||
      (l.jobTitle?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto p-md md:p-lg">
          {/* Monitor hero (sunset clay) */}
          <div className="mb-lg flex flex-col justify-between gap-md md:flex-row md:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-primary">
                Sync Job Monitor
              </h1>
              <p className="mt-xs font-body text-[13px] text-on-surface-variant">
                {systemOk
                  ? 'Your pipelines are breathing steadily. Everything looks healthy.'
                  : `${openDrift.length} open drift event(s) need attention before export.`}
              </p>
            </div>
            <div
              className={[
                'inline-flex items-center gap-sm rounded-full px-md py-sm',
                systemOk
                  ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant'
                  : 'bg-error/10 text-error',
              ].join(' ')}
            >
              <span
                className={[
                  'h-2 w-2 rounded-full',
                  systemOk ? 'animate-pulse bg-tertiary' : 'bg-error',
                ].join(' ')}
              />
              <span className="font-label text-[12px] font-medium">
                {systemOk ? 'System Optimal' : 'Drift Risk'}
              </span>
            </div>
          </div>

          <div className="mb-xl grid grid-cols-1 gap-md lg:grid-cols-3">
            <div
              className="flex flex-col gap-lg rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-lg lg:col-span-2"
              style={{ boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)' }}
            >
              <div className="flex items-start justify-between gap-md">
                <div className="flex items-center gap-md">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-fixed text-primary">
                    ⇄
                  </div>
                  <div>
                    <h3 className="font-headline text-base font-semibold text-primary">
                      {hero?.title ?? 'No pipelines yet'}
                    </h3>
                    <p className="font-label text-[11px] text-on-surface-variant opacity-70">
                      {hero
                        ? `Tables: ${hero.tables.slice(0, 3).join(', ') || '—'} · ${hero.status}`
                        : 'Create a job to start monitoring'}
                    </p>
                  </div>
                </div>
                {hero ? (
                  <span className="font-label text-[12px] font-semibold text-primary">
                    {heroProgress}%
                  </span>
                ) : null}
              </div>
              <div className="space-y-sm">
                <div className="h-3 w-full overflow-hidden rounded-full bg-secondary-container">
                  <div
                    className="h-full rounded-full bg-primary-container transition-all"
                    style={{ width: `${hero ? heroProgress : 0}%` }}
                  />
                </div>
                <div className="flex justify-between font-label text-[11px] text-on-surface-variant">
                  <span>
                    {hero
                      ? `${hero.notebook?.length || 0} notebook cell(s)`
                      : 'Waiting for first job'}
                  </span>
                  <span>
                    {jobs.length} job{jobs.length === 1 ? '' : 's'} in workspace
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-md border-t border-secondary-container/20 pt-md">
                <div className="text-center">
                  <p className="font-label text-[11px] text-on-surface-variant">
                    Ready / exported
                  </p>
                  <p className="font-headline text-lg font-semibold">
                    {readyCount}
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-label text-[11px] text-on-surface-variant">
                    Drafts
                  </p>
                  <p className="font-headline text-lg font-semibold">
                    {draftCount}
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-label text-[11px] text-on-surface-variant">
                    Drift open
                  </p>
                  <p className="font-headline text-lg font-semibold">
                    {openDrift.length}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="flex flex-col items-center justify-between rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-lg text-center"
              style={{ boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)' }}
            >
              <div className="space-y-xs">
                <span className="text-4xl text-tertiary-container">◈</span>
                <h4 className="font-headline text-base font-semibold">
                  Resource Health
                </h4>
              </div>
              <div className="relative my-md flex h-32 w-32 items-center justify-center">
                <svg className="h-full w-full -rotate-90 transform">
                  <circle
                    className="text-secondary-container"
                    cx="64"
                    cy="64"
                    fill="transparent"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                  />
                  <circle
                    className="text-tertiary"
                    cx="64"
                    cy="64"
                    fill="transparent"
                    r="56"
                    stroke="currentColor"
                    strokeDasharray="351.8"
                    strokeDashoffset={351.8 * (1 - (systemOk ? 0.75 : 0.4))}
                    strokeWidth="8"
                  />
                </svg>
                <span className="absolute font-headline text-xl font-semibold text-tertiary">
                  {systemOk ? '75%' : '40%'}
                </span>
              </div>
              <p className="font-body text-[13px] text-on-surface-variant">
                {systemOk
                  ? 'CPU and Memory are well within limits.'
                  : 'Resolve drift before promoting pipelines.'}
              </p>
            </div>
          </div>

          {/* Sync Jobs list (dark sunset clay cards) */}
          <div className="mb-lg flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h2 className="font-headline text-base font-semibold text-on-surface">
                Sync Jobs
              </h2>
              <p className="mt-1 font-body text-[13px] text-on-surface-variant">
                Real-time monitoring of your production synchronization
                pipelines.
              </p>
            </div>
            <div className="flex flex-wrap gap-sm">
              <input
                type="search"
                value={filter}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder="Filter…"
                className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-md py-2 font-body text-[13px] text-on-surface outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 font-label text-[12px] text-on-surface transition-colors hover:opacity-80"
              >
                ↻ Refresh
              </button>
              {canWrite ? (
                <button
                  type="button"
                  onClick={onCreate}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label text-[12px] font-semibold text-on-primary"
                >
                  + New Job
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-md @2xl:grid-cols-2 xl:grid-cols-3">
            {filtered.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-outline-variant/40 p-xl text-center">
                <p className="font-body text-[13px] text-on-surface-variant">
                  No jobs yet.
                </p>
                <div className="mt-md flex flex-wrap justify-center gap-sm">
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={onCreate}
                      className="rounded-lg bg-primary-container px-md py-sm font-label text-[12px] font-semibold text-on-primary"
                    >
                      Create one manually
                    </button>
                  ) : null}
                  <Link
                    to="/chat"
                    className="rounded-lg border border-outline-variant px-md py-sm font-label text-[12px] text-on-surface-variant"
                  >
                    Draft in AI Chat
                  </Link>
                </div>
              </div>
            ) : (
              filtered.map((job) => {
                const ui = jobUiStatus(job)
                const progress = progressFor(job)
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => onOpenJob(job.id)}
                    className="flex flex-col gap-md rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-md text-left transition-all hover:scale-[1.01]"
                    style={{
                      boxShadow: '0px 4px 16px rgba(61, 64, 91, 0.06)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-sm">
                      <div className="flex min-w-0 items-center gap-sm">
                        <div
                          className={[
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                            ui.kind === 'failed'
                              ? 'bg-error/10 text-error'
                              : ui.kind === 'idle'
                                ? 'bg-on-secondary-container/10 text-on-secondary-container'
                                : 'bg-tertiary/10 text-tertiary',
                          ].join(' ')}
                        >
                          {ui.kind === 'failed'
                            ? '!'
                            : ui.kind === 'idle'
                              ? '◷'
                              : '↻'}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-label text-[12px] font-semibold text-on-surface">
                            {job.title}
                          </h3>
                          <p className="truncate font-label text-[11px] text-on-surface-variant/60">
                            {job.sources[0] ||
                              job.tables[0] ||
                              'Que notebook'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-label text-[11px] ${statusPill(ui.kind)}`}
                      >
                        {ui.kind === 'running' || ui.kind === 'done' ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        ) : null}
                        {ui.label}
                      </span>
                    </div>

                    {progress != null ? (
                      <div>
                        <div className="mb-xs flex items-center justify-between">
                          <span className="font-label text-[11px] text-on-surface-variant">
                            Progress
                          </span>
                          <span className="font-label text-[11px] font-bold text-on-surface">
                            {progress}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                          <div
                            className={[
                              'h-full rounded-full',
                              ui.kind === 'done'
                                ? 'bg-tertiary'
                                : 'bg-primary',
                            ].join(' ')}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant/20 py-4 text-on-surface-variant/50">
                        <p className="font-label text-[11px]">
                          Edit notebook · dry-run when ready
                        </p>
                      </div>
                    )}

                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-3 font-label text-[11px] text-on-surface-variant/70">
                        <span>{job.notebook?.length || 0} cells</span>
                        <span>
                          {new Date(job.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="font-label text-[12px] text-primary">→</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="mt-xl grid grid-cols-1 gap-md md:grid-cols-4">
            <StatCard
              label="Total jobs"
              value={String(jobs.length)}
              hint={
                readyCount
                  ? `${readyCount} ready/exported`
                  : 'Create your first pipeline'
              }
              hintClass="text-tertiary"
            />
            <StatCard
              label="Notebook cells"
              value={String(
                jobs.reduce((n, j) => n + (j.notebook?.length || 0), 0),
              )}
              hint="Across workspace jobs"
              hintClass="text-tertiary"
            />
            <StatCard
              label="Failure / drift"
              value={openDrift.length ? String(openDrift.length) : '0'}
              hint={
                openDrift.length
                  ? 'Open high-severity drift'
                  : 'Stable across workspace'
              }
              hintClass={
                openDrift.length ? 'text-error' : 'text-on-surface-variant'
              }
              valueClass={openDrift.length ? 'text-error' : undefined}
            />
            <StatCard
              label="Draft capacity"
              value={`${draftCount} / ${Math.max(jobs.length, 1)}`}
              hint={
                jobs.length
                  ? `${Math.round((draftCount / jobs.length) * 100)}% still drafting`
                  : '—'
              }
            />
          </div>

          {/* Recent activity */}
          <div
            className="mt-xl rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-lg"
            style={{ boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)' }}
          >
            <div className="mb-md flex items-center justify-between">
              <h3 className="font-headline text-base font-semibold text-on-surface">
                Recent Activity
              </h3>
              <button
                type="button"
                onClick={onRefresh}
                className="font-label text-[12px] font-semibold text-primary hover:underline"
              >
                View History
              </button>
            </div>
            <ul className="space-y-md">
              {jobs.slice(0, 4).map((j) => (
                <li key={j.id} className="flex gap-md">
                  <span
                    className={[
                      'mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      j.status === 'exported' || j.status === 'ready'
                        ? 'bg-tertiary/15 text-tertiary'
                        : 'bg-primary/10 text-primary',
                    ].join(' ')}
                  >
                    {j.status === 'exported' || j.status === 'ready'
                      ? '✓'
                      : '↻'}
                  </span>
                  <div className="min-w-0 flex-1 border-b border-outline-variant/15 pb-md">
                    <p className="font-body text-[13px] text-on-surface">
                      <button
                        type="button"
                        className="font-semibold text-primary hover:underline"
                        onClick={() => onOpenJob(j.id)}
                      >
                        {j.title}
                      </button>{' '}
                      · status {j.status}
                    </p>
                    <p className="font-label text-[11px] text-on-surface-variant">
                      Updated {new Date(j.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
              {openDrift.slice(0, 2).map((d) => (
                <li key={d.id} className="flex gap-md">
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
                    !
                  </span>
                  <div className="min-w-0 flex-1 pb-md">
                    <p className="font-body text-[13px] text-on-surface">
                      Drift [{d.code}] {d.summary}
                    </p>
                  </div>
                </li>
              ))}
              {jobs.length === 0 && openDrift.length === 0 ? (
                <li className="font-body text-[13px] text-on-surface-variant">
                  Activity will appear as you create and run jobs.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      {/* Live Stream rail */}
      <aside className="hidden w-[300px] shrink-0 flex-col border-l border-outline-variant/20 bg-surface-container-low lg:flex xl:w-[320px]">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-md py-sm">
          <h3 className="flex items-center gap-2 font-label text-[12px] font-semibold tracking-wide text-on-surface">
            <span className="text-primary">▣</span> Live Stream
          </h3>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onToggleStreamPause}
              className="rounded-lg px-2 py-1 font-label text-[11px] text-on-surface-variant hover:bg-surface-container-high"
              title={streamPaused ? 'Resume' : 'Pause'}
            >
              {streamPaused ? '▶' : '⏸'}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-md font-mono text-[11px] leading-relaxed">
          {filteredLogs.length === 0 ? (
            <p className="font-body text-[12px] text-on-surface-variant">
              {streamPaused
                ? 'Stream paused.'
                : 'Run a job dry-run or validate to populate logs.'}
            </p>
          ) : (
            filteredLogs.map((l) => (
              <div key={l.id} className="break-words">
                <span className="text-on-surface-variant/60">
                  [{new Date(l.ts).toLocaleTimeString()}]
                </span>{' '}
                <span
                  className={
                    l.level === 'error'
                      ? 'font-bold text-error'
                      : l.level === 'warn' || l.level === 'warning'
                        ? 'text-primary'
                        : l.level === 'debug'
                          ? 'text-on-surface-variant/50'
                          : 'text-on-surface-variant'
                  }
                >
                  {l.level.toUpperCase()}
                </span>{' '}
                {l.jobTitle ? (
                  <span className="text-primary">{l.jobTitle}: </span>
                ) : null}
                <span className="text-on-surface">{l.message}</span>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-outline-variant/20 p-md">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
              ⌕
            </span>
            <input
              type="search"
              value={logQuery}
              onChange={(e) => onLogQueryChange(e.target.value)}
              placeholder="Search logs..."
              className="w-full rounded-lg border-none bg-surface-container-lowest py-2 pl-9 pr-3 font-body text-[13px] text-on-surface outline-none ring-1 ring-outline-variant/20 focus:ring-primary"
            />
          </div>
        </div>
      </aside>

      {canWrite ? (
        <button
          type="button"
          onClick={onCreate}
          className="fixed right-lg bottom-lg z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-on-primary shadow-lg transition-transform hover:scale-110 active:scale-95 lg:hidden"
          aria-label="New job"
        >
          +
        </button>
      ) : null}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  hintClass = 'text-on-surface-variant',
  valueClass,
}: {
  label: string
  value: string
  hint: string
  hintClass?: string
  valueClass?: string
}) {
  return (
    <div className="flex flex-col gap-xs rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-md">
      <span className="font-label text-[11px] tracking-wider text-on-surface-variant uppercase">
        {label}
      </span>
      <span
        className={`font-headline text-lg font-semibold text-on-surface ${valueClass || ''}`}
      >
        {value}
      </span>
      <div className={`mt-1 font-label text-[11px] ${hintClass}`}>{hint}</div>
    </div>
  )
}

export function jobStatusLabel(status: JobStatus): string {
  return status
}
