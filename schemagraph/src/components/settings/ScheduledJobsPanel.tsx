import { useEffect, useState } from 'react'
import {
  fetchJobScheduleStatus,
  runWorkspaceScheduledJobs,
  type JobScheduleStatus,
} from '@/services/stitchApi'

/**
 * Wave 4.2 — workspace scheduled job runs overview.
 */
export function ScheduledJobsPanel({
  workspaceId,
  canAdmin,
}: {
  workspaceId: string | null
  canAdmin: boolean
}) {
  const [status, setStatus] = useState<JobScheduleStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setErr(null)
    try {
      setStatus(await fetchJobScheduleStatus(workspaceId))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function onRunDue() {
    if (!workspaceId || !canAdmin) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const out = await runWorkspaceScheduledJobs({}, workspaceId)
      const failed = out.results.filter((r) => !r.ok).length
      setMsg(
        out.ran === 0
          ? 'No due jobs to run.'
          : `Ran ${out.ran} scheduled job(s)${failed ? ` · ${failed} failed` : ''}.`,
      )
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const summary = status?.summary

  return (
    <section className="mt-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            Scheduled jobs
          </h2>
          <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
            Wave 4.2 — hourly/daily notebook runs with retries. Not Airflow;
            use External orchestrator to trigger customer DAGs.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          {canAdmin ? (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void onRunDue()}
              className="rounded-lg border border-secondary/40 bg-secondary/5 px-md py-1.5 font-label text-[12px] text-secondary hover:bg-secondary/10 disabled:opacity-40"
            >
              {busy ? 'Running…' : 'Run due now'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] text-on-surface-variant hover:border-secondary hover:text-secondary disabled:opacity-40"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {err ? (
        <p className="mb-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      {msg ? (
        <p className="mb-sm font-body text-[12px] text-tertiary">{msg}</p>
      ) : null}

      <div className="mb-md flex flex-wrap gap-md font-body text-[13px] text-on-surface-variant">
        <span>
          Scheduler{' '}
          <strong className="text-on-surface">
            {status?.enabled ? 'ON' : 'OFF'}
          </strong>
        </span>
        <span>
          Scheduled{' '}
          <strong className="text-on-surface">{summary?.scheduled ?? '—'}</strong>
        </span>
        <span>
          Due <strong className="text-on-surface">{summary?.due ?? '—'}</strong>
        </span>
      </div>

      <ul className="divide-y divide-outline-variant/20 rounded-lg border border-outline-variant/25">
        {(status?.jobs || []).slice(0, 12).map((j) => (
          <li
            key={j.id}
            className="flex flex-wrap items-center justify-between gap-sm px-md py-sm font-body text-[12px]"
          >
            <span className="font-medium text-on-surface">{j.title}</span>
            <span className="text-on-surface-variant">
              {j.runSchedule}
              {j.runSchedule !== 'off' ? ` · ${j.runMode}` : ''}
              {j.runNextAt
                ? ` · next ${new Date(j.runNextAt).toLocaleString()}`
                : ''}
            </span>
          </li>
        ))}
        {!status?.jobs?.length && !loading ? (
          <li className="px-md py-sm text-on-surface-variant">No jobs yet.</li>
        ) : null}
      </ul>
    </section>
  )
}
