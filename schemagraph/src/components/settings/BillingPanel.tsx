import { useEffect, useState } from 'react'
import {
  fetchBillingStatus,
  createBillingCheckout,
  createBillingPortal,
  type BillingStatus,
} from '@/services/stitchApi'

/** Wave 4.6 — Stripe seats (test-mode). */
export function BillingPanel({
  workspaceId,
  canAdmin,
}: {
  workspaceId: string | null
  canAdmin: boolean
}) {
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [seats, setSeats] = useState(5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setErr(null)
    try {
      setBilling(await fetchBillingStatus(workspaceId))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function checkout() {
    if (!workspaceId || !canAdmin) return
    setBusy(true)
    setErr(null)
    try {
      const s = await createBillingCheckout({ seats }, workspaceId)
      if (s.url) window.location.href = s.url
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function portal() {
    if (!workspaceId || !canAdmin) return
    setBusy(true)
    setErr(null)
    try {
      const s = await createBillingPortal(workspaceId)
      if (s.url) window.location.href = s.url
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
      <h2 className="font-headline text-base font-semibold text-on-surface-variant">
        Billing
      </h2>
      <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
        Wave 4.6 — Stripe Checkout for seat packs (test mode). Soft-enforced
        against member count.
      </p>
      {err ? (
        <p className="mt-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      <div className="mt-md flex flex-wrap gap-md font-body text-[13px] text-on-surface-variant">
        <span>
          Status{' '}
          <strong className="text-on-surface">
            {billing?.billingStatus ?? '—'}
          </strong>
        </span>
        <span>
          Seats{' '}
          <strong className="text-on-surface">
            {billing?.seatCount ?? 0}
          </strong>
        </span>
        <span>
          Members{' '}
          <strong className="text-on-surface">{billing?.members ?? '—'}</strong>
          {' / '}
          {billing?.effectiveMaxMembers ?? '—'}
        </span>
        <span>
          Stripe{' '}
          <strong className="text-on-surface">
            {billing?.configured ? 'configured' : 'unset'}
          </strong>
        </span>
      </div>
      {billing?.overSeatSoft ? (
        <p className="mt-sm font-body text-[12px] text-error">
          Soft warning: members exceed paid seats.
        </p>
      ) : null}
      {canAdmin ? (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
            Seats to buy
            <input
              type="number"
              min={1}
              max={200}
              value={seats}
              disabled={busy}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="w-24 rounded-lg border border-outline-variant/40 px-sm py-1.5 text-[12px]"
            />
          </label>
          <button
            type="button"
            disabled={busy || !billing?.configured}
            onClick={() => void checkout()}
            className="rounded-lg border border-secondary/40 bg-secondary/5 px-md py-1.5 font-label text-[12px] text-secondary disabled:opacity-40"
          >
            Upgrade (Checkout)
          </button>
          <button
            type="button"
            disabled={busy || !billing?.stripeCustomerId}
            onClick={() => void portal()}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] disabled:opacity-40"
          >
            Manage (Portal)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      ) : null}
    </section>
  )
}
