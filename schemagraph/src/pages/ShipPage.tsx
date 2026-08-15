import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { SchemaCustodyBanner } from '@/components/SchemaCustodyBanner'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  approveShipApi,
  createShipDraftApi,
  fetchShipEvents,
  linkShipMaterializationApi,
  rollbackShipApi,
  type ShipEvent,
} from '@/services/stitchApi'

/**
 * CEO P0 — One-screen Ship to BI: draft → approve → live / rollback.
 * Jobs/notebook stay on /jobs (Advanced).
 */
export function ShipPage() {
  const { canWrite } = useWorkspaceRole()
  const [params] = useSearchParams()
  const [title, setTitle] = useState('Revenue by region')
  const [ships, setShips] = useState<ShipEvent[]>([])
  const [selected, setSelected] = useState<ShipEvent | null>(null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [certifyError, setCertifyError] = useState<string | null>(null)
  const [jobIdLink, setJobIdLink] = useState('')
  const [matIdLink, setMatIdLink] = useState('')
  const [warehouseNote, setWarehouseNote] = useState<string | null>(null)

  async function reload() {
    const list = await fetchShipEvents()
    setShips(list)
    const focusId = params.get('id')
    if (focusId) {
      const hit = list.find((s) => s.id === focusId)
      if (hit) setSelected(hit)
    }
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [params])

  async function draft() {
    if (!canWrite || !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const ship = await createShipDraftApi({
        title: title.trim(),
        chartType: 'bar',
        outcomeId: params.get('outcomeId'),
      })
      setSelected(ship)
      setToast('Draft ready — Approve to certify / mint embed')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    if (!selected || !canWrite) return
    setBusy(true)
    setCertifyError(null)
    try {
      const out = await approveShipApi(selected.id)
      setSelected(out.ship || selected)
      setEmbedUrl(out.embedUrl || null)
      setCertifyError(out.certifyError || null)
      setToast(
        out.embedUrl
          ? 'Live — embed minted'
          : 'Approved (certify managed dataset for live embed)',
      )
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function rollback() {
    if (!selected || !canWrite) return
    setBusy(true)
    setWarehouseNote(null)
    try {
      const out = await rollbackShipApi(selected.id)
      setSelected(out.ship || selected)
      setEmbedUrl(null)
      const wr = out.warehouseRollback
      if (wr && wr.ok) {
        setWarehouseNote(
          `Warehouse DROP: ${String(wr.qualifiedName || wr.materializationId || 'ok')}`,
        )
      } else if (wr && wr.error) {
        setWarehouseNote(`Warehouse DROP skipped/failed: ${String(wr.error)}`)
      }
      setToast('Rolled back — embed revoked, chart uncertified')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function linkMat() {
    if (!selected || !canWrite) return
    if (!jobIdLink.trim() && !matIdLink.trim()) return
    setBusy(true)
    try {
      const ship = await linkShipMaterializationApi(selected.id, {
        jobId: jobIdLink.trim() || null,
        materializationId: matIdLink.trim() || null,
      })
      setSelected(ship)
      setToast('Linked job/materialization for warehouse rollback')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="SHIP TO BI · CEO MODE">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-3xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Ship to BI</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Draft → Approve → Live dashboard. No notebook required. Rollback is
          always available for auditors.
        </p>
        <SchemaCustodyBanner className="mt-md" />

        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {toast ? (
          <p className="mt-md text-[12px] text-secondary">{toast}</p>
        ) : null}

        <div className="mt-lg space-y-sm rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
          <label className="block text-[11px] uppercase tracking-wide text-on-surface-variant">
            Chart title
          </label>
          <input
            className="w-full rounded-lg border border-outline-variant/40 bg-surface px-sm py-sm text-[13px]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite}
          />
          <div className="flex flex-wrap gap-sm">
            <button
              type="button"
              className="rounded-lg bg-secondary px-md py-sm text-[13px] font-medium text-on-secondary disabled:opacity-50"
              disabled={!canWrite || busy}
              onClick={() => void draft()}
            >
              {busy ? 'Working…' : '1. Create draft'}
            </button>
            <Link
              to="/outcome"
              className="rounded-lg border border-outline-variant/40 px-md py-sm text-[13px]"
            >
              ← Outcome
            </Link>
            <Link
              to="/jobs"
              className="rounded-lg border border-outline-variant/40 px-md py-sm text-[12px] text-on-surface-variant"
            >
              Advanced: Jobs
            </Link>
          </div>
        </div>

        {selected ? (
          <div className="mt-lg rounded-xl border border-outline-variant/30 bg-surface p-md">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <h2 className="font-headline text-base font-semibold">
                {selected.title}
              </h2>
              <span className="rounded-full bg-surface-container-high px-sm py-px text-[10px] uppercase tracking-wide">
                {selected.status}
              </span>
            </div>
            <p className="mt-xs text-[11px] font-mono text-on-surface-variant">
              fp:{' '}
              {String(
                (selected.attestation as { fingerprint?: string })?.fingerprint ||
                  '—',
              ).slice(0, 16)}
              …
            </p>
            {certifyError ? (
              <p className="mt-sm text-[12px] text-amber-300">
                Certify note: {certifyError}. Approve still recorded — certify a
                managed dataset on{' '}
                <Link to="/managed" className="underline">
                  Managed
                </Link>{' '}
                then re-approve, or use{' '}
                <Link to="/bi" className="underline">
                  Certified BI
                </Link>
                .
              </p>
            ) : null}
            {warehouseNote ? (
              <p className="mt-sm text-[12px] text-secondary">{warehouseNote}</p>
            ) : null}
            <div className="mt-md space-y-sm rounded-lg border border-outline-variant/20 p-sm">
              <p className="text-[11px] text-on-surface-variant">
                Optional: link a materialized job object so Rollback also DROP
                VIEW/TABLE in the customer warehouse.
              </p>
              <div className="flex flex-wrap gap-sm">
                <input
                  className="min-w-[140px] flex-1 rounded border border-outline-variant/40 bg-surface px-sm py-1 text-[12px]"
                  placeholder="jobId"
                  value={jobIdLink}
                  onChange={(e) => setJobIdLink(e.target.value)}
                />
                <input
                  className="min-w-[140px] flex-1 rounded border border-outline-variant/40 bg-surface px-sm py-1 text-[12px]"
                  placeholder="materializationId"
                  value={matIdLink}
                  onChange={(e) => setMatIdLink(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded border border-outline-variant/40 px-sm py-1 text-[12px]"
                  disabled={busy || !canWrite}
                  onClick={() => void linkMat()}
                >
                  Link
                </button>
              </div>
            </div>
            <div className="mt-md flex flex-wrap gap-sm">
              <button
                type="button"
                className="rounded-lg bg-primary px-md py-sm text-[13px] font-medium text-on-primary disabled:opacity-50"
                disabled={
                  !canWrite ||
                  busy ||
                  selected.status === 'rolled_back' ||
                  selected.status === 'live'
                }
                onClick={() => void approve()}
              >
                2. Approve
              </button>
              <button
                type="button"
                className="rounded-lg border border-error/40 px-md py-sm text-[13px] text-error disabled:opacity-50"
                disabled={
                  !canWrite || busy || selected.status === 'rolled_back'
                }
                onClick={() => void rollback()}
              >
                Rollback
              </button>
              <Link
                to="/verify"
                className="rounded-lg border border-outline-variant/40 px-md py-sm text-[12px]"
              >
                Verify attestation
              </Link>
            </div>
            {embedUrl ? (
              <p className="mt-md text-[13px]">
                Live:{' '}
                <Link to={embedUrl} className="text-secondary underline">
                  {embedUrl}
                </Link>
              </p>
            ) : null}
            <details className="mt-md">
              <summary className="cursor-pointer text-[11px] text-on-surface-variant">
                Attestation JSON (auditors)
              </summary>
              <pre className="mt-sm max-h-48 overflow-auto rounded-lg bg-surface-container-lowest p-sm text-[10px]">
                {JSON.stringify(selected.attestation, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}

        {ships.length ? (
          <div className="mt-xl">
            <h3 className="text-[11px] uppercase tracking-wide text-on-surface-variant">
              Recent ships
            </h3>
            <ul className="mt-sm space-y-xs">
              {ships.slice(0, 10).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-outline-variant/20 px-sm py-sm text-left text-[12px] hover:bg-surface-container-low"
                    onClick={() => {
                      setSelected(s)
                      setEmbedUrl(null)
                    }}
                  >
                    <span className="text-on-surface-variant">{s.status}</span>
                    {' · '}
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </QueAppChrome>
  )
}
