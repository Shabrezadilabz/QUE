import { useEffect, useState } from 'react'
import {
  fetchSyncScheduleStatus,
  runWorkspaceScheduledSync,
  type SyncScheduleStatus,
} from '@/services/stitchApi'

/**
 * Wave 2.5 — workspace scheduled schema sync overview (introspect only).
 */
export function ScheduledSyncPanel({
  workspaceId,
  canAdmin,
}: {
  workspaceId: string | null
  canAdmin: boolean
}) {
  const [status, setStatus] = useState<SyncScheduleStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setErr(null)
    try {
      setStatus(await fetchSyncScheduleStatus(workspaceId))
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
      const out = await runWorkspaceScheduledSync({}, workspaceId)
      const failed = out.results.filter((r) => !r.ok).length
      setMsg(
        out.ran === 0
          ? 'No due connections to sync.'
          : `Ran ${out.ran} scheduled sync(s)${failed ? ` · ${failed} failed` : ''}.`,
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
    <section className="mt-lg rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm">
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            Scheduled sync
          </h2>
          <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
            Wave 2.5 — hourly/daily schema introspect per source. Not full ETL;
            Que still does not centralize warehouse rows.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          {canAdmin ? (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void onRunDue()}
              className="rounded-lg border border-primary/30 bg-primary/5 px-md py-1.5 font-label text-[12px] text-primary hover:bg-primary/10 disabled:opacity-40"
            >
              {busy ? 'Running…' : 'Run due now'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-40"
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
        <span>
          Hourly{' '}
          <strong className="text-on-surface">{summary?.hourly ?? '—'}</strong> ·
          Daily{' '}
          <strong className="text-on-surface">{summary?.daily ?? '—'}</strong>
        </span>
      </div>

      {!summary?.scheduled ? (
        <p className="font-body text-[13px] text-on-surface-variant">
          No sources scheduled yet. Open a source on Sources and set Sync
          schedule to Hourly or Daily.
        </p>
      ) : (
        <ul className="max-h-56 space-y-xs overflow-y-auto">
          {(status?.connections || [])
            .filter((c) => c.syncSchedule !== 'off')
            .map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-outline-variant/15 bg-[#FBF8F4] px-md py-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-label text-[12px] font-semibold text-on-surface">
                    {c.name}
                  </p>
                  <p className="font-body text-[11px] text-on-surface-variant">
                    {c.syncSchedule}
                    {c.syncNextAt
                      ? ` · next ${new Date(c.syncNextAt).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <span className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
                  {c.lastSyncErrorKind === 'auth' ? 'Paused (auth)' : c.status}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
