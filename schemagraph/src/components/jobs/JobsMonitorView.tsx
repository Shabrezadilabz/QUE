import { Link } from 'react-router-dom'
import { PdfPageHeader, PdfPrimaryButton, PdfGhostButton } from '@/components/pdf/PdfUi'
import {
  PDF_TABLE_CELL,
  PDF_TABLE_HEAD,
  PDF_TABLE_ROW,
  PdfTableFooter,
  PdfTableShell,
} from '@/components/pdf/PdfTable'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import type { DriftEvent, JobRun, StitchJob } from '@/services/stitchApi'

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
  recentRuns?: JobRun[]
}

function jobStatus(job: StitchJob): { label: string; tone: 'neutral' | 'ok' | 'warn' | 'error' } {
  if (job.status === 'exported') return { label: 'Exported', tone: 'ok' }
  if (job.status === 'ready') return { label: 'Ready', tone: 'ok' }
  if (job.status === 'archived') return { label: 'Archived', tone: 'neutral' }
  if (job.runSchedule && job.runSchedule !== 'off') {
    return { label: `Scheduled · ${job.runSchedule}`, tone: 'ok' }
  }
  return { label: 'Draft', tone: 'neutral' }
}

const STATUS_PILL = {
  neutral: 'pdf-shine pdf-status-neutral',
  ok: 'pdf-status-ok rounded-[4px] px-[8px] py-[4px]',
  warn: 'pdf-status-warn rounded-[4px] px-[8px] py-[4px]',
  error: 'pdf-status-error rounded-[4px] px-[8px] py-[4px]',
}

/** Jobs list — PDF slate layout: KPI strip, table, run history, slim live rail. */
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
  recentRuns = [],
}: JobsMonitorViewProps) {
  const readyCount = jobs.filter(
    (j) => j.status === 'ready' || j.status === 'exported',
  ).length
  const draftCount = jobs.filter((j) => j.status === 'draft').length

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#111416]">
      <PdfPageHeader
        title="Jobs"
        subtitle="Monitor sync pipelines, dry-runs, and validation before ship."
        actions={
          <div className="flex flex-wrap items-center gap-[8px]">
            <div className="relative w-[200px] max-w-full">
              <input
                type="search"
                value={filter}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder="Filter jobs..."
                aria-label="Filter jobs"
                className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] py-[8px] pl-[33px] pr-[13px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#6b7380]"
              />
              <img
                alt=""
                className="pointer-events-none absolute left-[10px] top-1/2 size-[11px] -translate-y-1/2 opacity-70"
                src={FIGMA_NAV.search}
              />
            </div>
            <PdfGhostButton type="button" onClick={onRefresh}>
              Refresh
            </PdfGhostButton>
            <Link
              to="/templates"
              className="pdf-btn-ghost rounded-[4px] px-[14px] py-[8px] text-[12px] font-semibold"
            >
              Templates
            </Link>
            {canWrite ? (
              <PdfPrimaryButton type="button" onClick={onCreate}>
                + New Job
              </PdfPrimaryButton>
            ) : null}
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 gap-[16px] px-[24px] pb-[24px] pt-[8px]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[16px]">
          {/* KPI strip */}
          <div className="grid shrink-0 grid-cols-2 gap-[12px] sm:grid-cols-4">
            <KpiCard
              label="Total jobs"
              value={String(jobs.length)}
              hint={`${readyCount} ready to ship`}
              tone="blue"
              icon="jobs"
            />
            <KpiCard
              label="Ready"
              value={String(readyCount)}
              hint="Exported or ship-ready"
              tone="teal"
              icon="ready"
            />
            <KpiCard
              label="Drafts"
              value={String(draftCount)}
              hint="Need notebook + dry-run"
              tone="amber"
              icon="draft"
            />
            <KpiCard
              label="Drift open"
              value={String(openDrift.length)}
              hint={openDrift.length ? 'Review before export' : 'All clear'}
              tone={openDrift.length > 0 ? 'alert' : 'neutral'}
              icon="drift"
            />
          </div>

          {/* Jobs table */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PdfTableShell
              footer={
                <PdfTableFooter
                  left={`Showing ${filtered.length} of ${jobs.length} jobs`}
                />
              }
            >
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-solid border-[#424850] bg-[#1e2328]">
                    {['JOB', 'STATUS', 'CELLS', 'UPDATED', ''].map((h, i) => (
                      <th
                        key={h || 'actions'}
                        className={[PDF_TABLE_HEAD, i === 4 ? 'text-right' : ''].join(' ')}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr className={PDF_TABLE_ROW}>
                      <td
                        colSpan={5}
                        className={`${PDF_TABLE_CELL} py-[32px] text-center text-[13px] text-[#a3afbe]`}
                      >
                        No jobs yet.{' '}
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={onCreate}
                            className="text-[#d0d8e0] underline"
                          >
                            Create a job
                          </button>
                        ) : (
                          <Link to="/chat" className="text-[#d0d8e0] underline">
                            Draft in Chat
                          </Link>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((job) => {
                      const st = jobStatus(job)
                      return (
                        <tr key={job.id} className={PDF_TABLE_ROW}>
                          <td className={PDF_TABLE_CELL}>
                            <button
                              type="button"
                              onClick={() => onOpenJob(job.id)}
                              className="text-left"
                            >
                              <p className="text-[14px] font-medium text-[#d4dbe3]">
                                {job.title}
                              </p>
                              <p className="mt-[2px] font-mono text-[11px] text-[#8a9099]">
                                {job.sources[0] || job.tables[0] || 'Que notebook'}
                              </p>
                            </button>
                          </td>
                          <td className={PDF_TABLE_CELL}>
                            <span
                              className={[
                                'inline-flex rounded-[4px] px-[8px] py-[3px] text-[10px] font-bold uppercase tracking-[0.5px]',
                                STATUS_PILL[st.tone],
                              ].join(' ')}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className={`${PDF_TABLE_CELL} text-[13px] text-[#c8cdd3]`}>
                            {job.notebook?.length || 0}
                          </td>
                          <td className={`${PDF_TABLE_CELL} text-[12px] text-[#a3afbe]`}>
                            {new Date(job.updatedAt).toLocaleDateString()}
                          </td>
                          <td className={`${PDF_TABLE_CELL} text-right`}>
                            <button
                              type="button"
                              onClick={() => onOpenJob(job.id)}
                              className="text-[12px] text-[#a3afbe] hover:text-[#d0d8e0]"
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </PdfTableShell>

            {/* Run history */}
            <section className="mt-[16px]">
              <div className="mb-[8px] flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-[#d4dbe3]">Run history</h2>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="text-[11px] text-[#a3afbe] hover:text-[#d0d8e0]"
                >
                  Refresh
                </button>
              </div>
              <PdfTableShell>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-solid border-[#424850] bg-[#1e2328]">
                      {['RUN', 'STATUS', 'MODE', 'WHEN', ''].map((h, i) => (
                        <th
                          key={h || 'go'}
                          className={[PDF_TABLE_HEAD, i === 4 ? 'text-right' : ''].join(' ')}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.length === 0 ? (
                      <tr className={PDF_TABLE_ROW}>
                        <td
                          colSpan={5}
                          className={`${PDF_TABLE_CELL} py-[20px] text-center text-[12px] text-[#a3afbe]`}
                        >
                          No runs yet — open a job and run a dry-run.
                        </td>
                      </tr>
                    ) : (
                      recentRuns.slice(0, 8).map((r) => (
                        <tr key={r.id} className={PDF_TABLE_ROW}>
                          <td className={PDF_TABLE_CELL}>
                            <button
                              type="button"
                              onClick={() => onOpenJob(r.jobId)}
                              className="max-w-[220px] truncate text-left text-[13px] font-medium text-[#d4dbe3] hover:text-[#ecf0f4]"
                            >
                              {r.jobTitle || r.jobId.slice(0, 12)}
                            </button>
                          </td>
                          <td className={PDF_TABLE_CELL}>
                            <RunStatusBadge status={r.status} />
                          </td>
                          <td className={`${PDF_TABLE_CELL} text-[12px] text-[#a3afbe]`}>
                            {r.mode || '—'}
                          </td>
                          <td className={`${PDF_TABLE_CELL} text-[12px] text-[#a3afbe]`}>
                            {r.finishedAt
                              ? new Date(r.finishedAt).toLocaleString()
                              : '—'}
                          </td>
                          <td className={`${PDF_TABLE_CELL} text-right`}>
                            <button
                              type="button"
                              onClick={() => onOpenJob(r.jobId)}
                              className="text-[11px] text-[#a3afbe] hover:text-[#d0d8e0]"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </PdfTableShell>
            </section>
          </div>
        </div>

        {/* Right rail — drift + live stream */}
        <aside className="hidden w-[280px] shrink-0 flex-col self-stretch overflow-hidden rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] lg:flex">
          {openDrift.length > 0 ? (
            <div className="shrink-0 border-b border-solid border-[#424850] p-[14px]">
              <div className="mb-[10px] flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-[#d4dbe3]">Drift alerts</h3>
                <Link
                  to="/validation"
                  className="text-[10px] text-[#a3afbe] hover:text-[#d0d8e0]"
                >
                  View all
                </Link>
              </div>
              <ul className="space-y-[8px]">
                {openDrift.slice(0, 3).map((d) => (
                  <li
                    key={d.id}
                    className={[
                      'rounded-[4px] border-l-[3px] border-solid bg-[#121619] px-[10px] py-[8px]',
                      d.severity === 'high' || d.severity === 'warn'
                        ? 'border-l-[#ff6b6b]'
                        : 'border-l-[#f0a020]',
                    ].join(' ')}
                  >
                    <p className="text-[11px] font-medium text-[#d4dbe3]">{d.summary}</p>
                    <p className="mt-[2px] text-[10px] uppercase text-[#a3afbe]">
                      {d.severity} · {d.code}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex shrink-0 items-center justify-between border-b border-solid border-[#424850] px-[14px] py-[12px]">
            <h3 className="text-[13px] font-semibold text-[#d4dbe3]">Live stream</h3>
            <button
              type="button"
              onClick={onToggleStreamPause}
              className="text-[11px] text-[#a3afbe] hover:text-[#d0d8e0]"
              aria-label={streamPaused ? 'Resume stream' : 'Pause stream'}
            >
              {streamPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-[14px] font-mono text-[11px] leading-relaxed text-[#c8cdd3]">
            {filteredLogs.length === 0 ? (
              <p className="text-[12px] text-[#a3afbe]">
                {streamPaused
                  ? 'Stream paused.'
                  : 'Run a dry-run or validate to populate logs.'}
              </p>
            ) : (
              filteredLogs.map((l) => (
                <div key={l.id} className="mb-[6px] break-words">
                  <span className="text-[#6b7380]">
                    [{new Date(l.ts).toLocaleTimeString()}]{' '}
                  </span>
                  <span
                    className={
                      l.level === 'error'
                        ? 'text-[#ff6b6b]'
                        : l.level === 'warn' || l.level === 'warning'
                          ? 'text-[#f0a020]'
                          : 'text-[#a3afbe]'
                    }
                  >
                    {l.level.toUpperCase()}
                  </span>{' '}
                  {l.jobTitle ? (
                    <span className="text-[#d0d8e0]">{l.jobTitle}: </span>
                  ) : null}
                  <span>{l.message}</span>
                </div>
              ))
            )}
          </div>
          <div className="shrink-0 border-t border-solid border-[#424850] p-[14px]">
            <input
              type="search"
              value={logQuery}
              onChange={(e) => onLogQueryChange(e.target.value)}
              placeholder="Search logs..."
              aria-label="Search logs"
              className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[10px] py-[8px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#6b7380]"
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: string
  hint: string
  tone: 'blue' | 'teal' | 'amber' | 'alert' | 'neutral'
  icon: 'jobs' | 'ready' | 'draft' | 'drift'
}) {
  const cardClass = {
    blue: 'pdf-kpi-card pdf-kpi-card--blue',
    teal: 'pdf-kpi-card pdf-kpi-card--teal',
    amber: 'pdf-kpi-card pdf-kpi-card--amber',
    alert: 'pdf-kpi-card pdf-kpi-card--alert',
    neutral: 'pdf-kpi-card pdf-kpi-card--neutral',
  }[tone]

  const iconColor = {
    blue: 'var(--pdf-kpi-blue, #006fe8)',
    teal: 'var(--pdf-kpi-teal, #059669)',
    amber: 'var(--pdf-kpi-amber, #d97706)',
    alert: 'var(--pdf-kpi-alert, #dc2626)',
    neutral: 'var(--pdf-text-muted)',
  }[tone]

  return (
    <div className={['relative overflow-hidden rounded-[6px] px-[16px] py-[14px]', cardClass].join(' ')}>
      <div className="flex items-start justify-between gap-[10px]">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.8px] text-[var(--pdf-text-muted)] uppercase">
            {label}
          </p>
          <p
            className={[
              'mt-[6px] text-[28px] font-bold leading-none tabular-nums',
              tone === 'alert' ? 'text-[var(--pdf-danger)]' : 'text-[var(--pdf-text-heading)]',
            ].join(' ')}
          >
            {value}
          </p>
          <p className="mt-[6px] text-[11px] text-[var(--pdf-text-faint)]">{hint}</p>
        </div>
        <KpiIcon kind={icon} color={iconColor} />
      </div>
    </div>
  )
}

function KpiIcon({
  kind,
  color,
}: {
  kind: 'jobs' | 'ready' | 'draft' | 'drift'
  color: string
}) {
  const props = {
    width: 18,
    height: 18,
    viewBox: '0 0 20 20',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const,
  }

  let svg = (
    <svg {...props}>
      <rect x="4" y="4" width="12" height="12" rx="2" stroke={color} strokeWidth="1.4" />
    </svg>
  )

  if (kind === 'ready') {
    svg = (
      <svg {...props}>
        <path d="M10 3l7 4v6l-7 4-7-4V7l7-4z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M7 10l2 2 4-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  } else if (kind === 'draft') {
    svg = (
      <svg {...props}>
        <path d="M6 4h8l2 2v12H4V4h2z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 10h6M8 13h4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  } else if (kind === 'drift') {
    svg = (
      <svg {...props}>
        <path d="M10 4v8M10 14h.01" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.4" />
      </svg>
    )
  } else if (kind === 'jobs') {
    svg = (
      <svg {...props}>
        <path d="M4 6h12v10H4V6z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6" stroke={color} strokeWidth="1.4" />
        <path d="M4 10h12" stroke={color} strokeWidth="1.4" />
      </svg>
    )
  }

  return (
    <div className="pdf-kpi-icon-box shrink-0">
      {svg}
    </div>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  if (s === 'succeeded' || s === 'success') {
    return (
      <span className="inline-flex rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold uppercase pdf-shine text-[#d0d8e0]">
        OK
      </span>
    )
  }
  if (s === 'failed' || s === 'error') {
    return (
      <span className="inline-flex rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold uppercase text-[#ff6b6b] border border-solid border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)]">
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-[4px] px-[6px] py-[2px] text-[10px] font-bold uppercase text-[#a3afbe] pdf-shine">
      {status}
    </span>
  )
}
