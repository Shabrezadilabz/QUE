import { useEffect, useState } from 'react'
import {
  fetchSyncScheduleStatus,
  runWorkspaceScheduledSync,
  type SyncScheduleStatus,
} from '@/services/stitchApi'
import {
  SETTINGS_PANEL,
  SettingsPanelHeader,
} from '@/components/settings/SettingsPdfUi'
import { PdfGhostButton } from '@/components/pdf/PdfUi'

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
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="Scheduled sync"
        subtitle="Wave 2.5 — hourly/daily schema introspect per source. Not full ETL; Que still does not centralize warehouse rows."
        actions={
          <div className="flex flex-wrap gap-[8px]">
            {canAdmin ? (
              <PdfGhostButton
                type="button"
                disabled={busy || loading}
                onClick={() => void onRunDue()}
              >
                {busy ? 'Running…' : 'Run due now'}
              </PdfGhostButton>
            ) : null}
            <PdfGhostButton
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </PdfGhostButton>
          </div>
        }
      />

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
                className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-outline-variant/15 bg-surface-container px-md py-sm"
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
