import { useState } from 'react'
import { updateJob, type StitchJob } from '@/services/stitchApi'

/**
 * Wave 4.2 — per-job schedule + retry controls.
 */
export function JobScheduleControls({
  job,
  canWrite,
  onUpdated,
}: {
  job: StitchJob
  canWrite: boolean
  onUpdated: (job: StitchJob) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [schedule, setSchedule] = useState(job.runSchedule || 'off')
  const [runMode, setRunMode] = useState<'dry_run' | 'live'>(
    job.runMode === 'live' ? 'live' : 'dry_run',
  )
  const [maxRetries, setMaxRetries] = useState(job.maxRetries ?? 2)
  const [retryDelaySec, setRetryDelaySec] = useState(job.retryDelaySec ?? 60)
  const [executionTarget, setExecutionTarget] = useState<
    'que' | 'private_runner'
  >(job.executionTarget === 'private_runner' ? 'private_runner' : 'que')

  async function save() {
    if (!canWrite) return
    setBusy(true)
    setErr(null)
    try {
      const updated = await updateJob(job.id, {
        runSchedule: schedule,
        runMode,
        maxRetries,
        retryDelaySec,
        executionTarget,
      })
      onUpdated(updated)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-md">
      <h3 className="font-headline text-sm font-semibold text-on-surface">
        Schedule & retries
      </h3>
      <p className="mt-xs font-body text-[11px] text-on-surface-variant">
        Wave 4.2 — Que ticker runs this notebook. Failures retry up to max
        retries. Private runner = Wave 4.5 callback.
      </p>
      <div className="mt-md grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
          Schedule
          <select
            disabled={!canWrite || busy}
            value={schedule}
            onChange={(e) =>
              setSchedule(e.target.value as 'off' | 'hourly' | 'daily')
            }
            className="rounded-lg border border-outline-variant/40 bg-white px-sm py-1.5 text-[12px] text-on-surface"
          >
            <option value="off">Off</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
          Run mode
          <select
            disabled={!canWrite || busy}
            value={runMode}
            onChange={(e) =>
              setRunMode(e.target.value as 'dry_run' | 'live')
            }
            className="rounded-lg border border-outline-variant/40 bg-white px-sm py-1.5 text-[12px] text-on-surface"
          >
            <option value="dry_run">Dry run</option>
            <option value="live">Live (read-only)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
          Execution
          <select
            disabled={!canWrite || busy}
            value={executionTarget}
            onChange={(e) =>
              setExecutionTarget(
                e.target.value as 'que' | 'private_runner',
              )
            }
            className="rounded-lg border border-outline-variant/40 bg-white px-sm py-1.5 text-[12px] text-on-surface"
          >
            <option value="que">Que (in-process)</option>
            <option value="private_runner">Private runner</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
          Max retries
          <input
            type="number"
            min={0}
            max={10}
            disabled={!canWrite || busy}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className="rounded-lg border border-outline-variant/40 bg-white px-sm py-1.5 text-[12px] text-on-surface"
          />
        </label>
        <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
          Retry delay (sec)
          <input
            type="number"
            min={5}
            max={3600}
            disabled={!canWrite || busy}
            value={retryDelaySec}
            onChange={(e) => setRetryDelaySec(Number(e.target.value))}
            className="rounded-lg border border-outline-variant/40 bg-white px-sm py-1.5 text-[12px] text-on-surface"
          />
        </label>
      </div>
      {job.runNextAt ? (
        <p className="mt-sm font-body text-[11px] text-on-surface-variant">
          Next run: {new Date(job.runNextAt).toLocaleString()}
          {job.lastScheduledRunAt
            ? ` · last ${new Date(job.lastScheduledRunAt).toLocaleString()}`
            : ''}
        </p>
      ) : null}
      {err ? (
        <p className="mt-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      {canWrite ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mt-md rounded-lg border border-primary/30 bg-primary/5 px-md py-1.5 font-label text-[12px] text-primary hover:bg-primary/10 disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save schedule'}
        </button>
      ) : null}
    </div>
  )
}
