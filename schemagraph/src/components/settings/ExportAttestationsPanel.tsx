import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  downloadAttestationVerifyPack,
  fetchExportAttestation,
  fetchExportAttestations,
  type ExportAttestationSummary,
} from '@/services/stitchApi'

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Wave 2.4 — list recent attested exports; download attestation or verify pack.
 */
export function ExportAttestationsPanel({
  workspaceId,
}: {
  workspaceId: string | null
}) {
  const [events, setEvents] = useState<ExportAttestationSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setErr(null)
    try {
      const list = await fetchExportAttestations({ limit: 30 }, workspaceId)
      setEvents(list)
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

  async function onDownloadAttestation(id: string) {
    if (!workspaceId) return
    setBusyId(id)
    setErr(null)
    try {
      const event = await fetchExportAttestation(id, workspaceId)
      const fp = (event.fingerprint || id).slice(0, 16)
      downloadJson(`que-attestation-${fp}.json`, event.attestation ?? event)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function onDownloadPack(id: string) {
    if (!workspaceId) return
    setBusyId(id)
    setErr(null)
    try {
      const { filename, pack } = await downloadAttestationVerifyPack(
        id,
        workspaceId,
      )
      downloadJson(filename, pack)
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
            Export attestations
          </h2>
          <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
            Wave 2.4 — download schema-only attestation JSON or a diligence
            verify pack, then re-check on the public verify page.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Link
            to="/verify"
            className="rounded-lg border border-primary/30 bg-primary/5 px-md py-1.5 font-label text-[12px] text-primary hover:bg-primary/10"
          >
            Open verify page
          </Link>
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
      {events.length === 0 && !loading ? (
        <p className="font-body text-[13px] text-on-surface-variant">
          No attested exports yet. From Jobs → Deploy, download JSON / open a
          dbt PR to create the first audit row.
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
                  Fingerprint
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Pack
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
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-[10rem] truncate px-sm py-sm">
                    {e.jobTitle || e.jobId?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-sm py-sm font-label text-[11px] text-primary">
                    {e.format}
                    {e.signed ? '' : ' · unsigned'}
                  </td>
                  <td className="max-w-[8rem] truncate px-sm py-sm font-mono text-[11px] text-on-surface-variant">
                    {e.fingerprint?.slice(0, 12) || '—'}
                  </td>
                  <td className="whitespace-nowrap px-sm py-sm">
                    <button
                      type="button"
                      disabled={busyId === e.id}
                      onClick={() => void onDownloadAttestation(e.id)}
                      className="mr-sm font-label text-[11px] text-primary underline disabled:opacity-40"
                    >
                      Attestation
                    </button>
                    <button
                      type="button"
                      disabled={busyId === e.id}
                      onClick={() => void onDownloadPack(e.id)}
                      className="font-label text-[11px] text-primary underline disabled:opacity-40"
                    >
                      Verify pack
                    </button>
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
