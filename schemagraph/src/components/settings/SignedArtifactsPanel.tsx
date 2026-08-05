import { useEffect, useState } from 'react'
import {
  fetchWorkspaceArtifacts,
  revokeWorkspaceArtifact,
  type SignedArtifactSummary,
} from '@/services/stitchApi'

/**
 * Wave 3.3 — list / revoke tokenized export artifact downloads.
 */
export function SignedArtifactsPanel({
  workspaceId,
  canAdmin,
}: {
  workspaceId: string | null
  canAdmin: boolean
}) {
  const [events, setEvents] = useState<SignedArtifactSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setErr(null)
    try {
      setEvents(await fetchWorkspaceArtifacts({ limit: 30 }, workspaceId))
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

  async function onRevoke(id: string) {
    if (!canAdmin || !workspaceId) return
    if (!window.confirm('Revoke this download link? External tools will get 410.')) {
      return
    }
    setBusyId(id)
    setErr(null)
    setMsg(null)
    try {
      await revokeWorkspaceArtifact(id, workspaceId)
      setMsg('Download link revoked.')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mt-lg rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm">
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            Signed artifacts
          </h2>
          <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
            Wave 3.3 — tokenized download URLs for attested export packs
            (schema/SQL/dbt only). Mint from Jobs → Deploy → File / PR, or on
            export.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {err ? (
        <p className="mb-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      {msg ? (
        <p className="mb-sm font-body text-[12px] text-tertiary">{msg}</p>
      ) : null}
      {events.length === 0 && !loading ? (
        <p className="font-body text-[13px] text-on-surface-variant">
          No signed artifacts yet. Export a job or mint a link from Deploy.
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/15">
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  When
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Job
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Format
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Status
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Downloads
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="font-body text-[12px] text-on-surface">
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-outline-variant/5 hover:bg-surface-container-low"
                >
                  <td className="whitespace-nowrap px-sm py-sm text-on-surface-variant">
                    {e.createdAt
                      ? new Date(e.createdAt).toLocaleString()
                      : '—'}
                  </td>
                  <td className="max-w-[10rem] truncate px-sm py-sm">
                    {e.jobTitle || e.jobId?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-sm py-sm font-label text-[11px] text-primary">
                    {e.format}
                  </td>
                  <td className="px-sm py-sm">
                    {e.revokedAt
                      ? 'Revoked'
                      : e.active
                        ? 'Active'
                        : 'Expired'}
                  </td>
                  <td className="px-sm py-sm text-on-surface-variant">
                    {e.downloadCount}
                  </td>
                  <td className="px-sm py-sm">
                    {canAdmin && e.active ? (
                      <button
                        type="button"
                        disabled={busyId === e.id}
                        onClick={() => void onRevoke(e.id)}
                        className="font-label text-[11px] text-error underline disabled:opacity-40"
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="font-mono text-[10px] text-on-surface-variant">
                        {e.contentSha256.slice(0, 10)}…
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
