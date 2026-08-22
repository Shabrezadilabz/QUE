import { useEffect, useState } from 'react'
import {
  fetchBillingStatus,
  createBillingCheckout,
  createBillingPortal,
  type BillingStatus,
} from '@/services/stitchApi'
import {
  SETTINGS_PANEL,
  SettingsPanelHeader,
} from '@/components/settings/SettingsPdfUi'
import { PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'

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
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="Billing"
        subtitle="Wave 4.6 — Stripe Checkout for seat packs (test mode). Soft-enforced against member count."
      />
      {err ? (
        <p className="mt-[12px] text-[12px] text-[#ff6b6b]">{err}</p>
      ) : null}
      <div className="mt-[16px] flex flex-wrap gap-[16px] text-[13px] text-[#a3afbe]">
        <span>
          Status{' '}
          <strong className="text-[#d4dbe3]">
            {billing?.billingStatus ?? '—'}
          </strong>
        </span>
        <span>
          Seats{' '}
          <strong className="text-[#d4dbe3]">
            {billing?.seatCount ?? 0}
          </strong>
        </span>
        <span>
          Members{' '}
          <strong className="text-[#d4dbe3]">{billing?.members ?? '—'}</strong>
          {' / '}
          {billing?.effectiveMaxMembers ?? '—'}
        </span>
        <span>
          Stripe{' '}
          <strong className="text-[#d4dbe3]">
            {billing?.configured ? 'configured' : 'unset'}
          </strong>
        </span>
      </div>
      {billing?.overSeatSoft ? (
        <p className="mt-[12px] text-[12px] text-[#ff6b6b]">
          Soft warning: members exceed paid seats.
        </p>
      ) : null}
      {canAdmin ? (
        <div className="mt-[16px] flex flex-wrap items-end gap-[8px]">
          <label className="flex flex-col gap-[4px] text-[11px] text-[#8a9099]">
            Seats to buy
            <input
              type="number"
              min={1}
              max={200}
              value={seats}
              disabled={busy}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="w-[96px] rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[10px] py-[8px] text-[12px] text-[#d4dbe3]"
            />
          </label>
          <PdfPrimaryButton
            type="button"
            disabled={busy || !billing?.configured}
            onClick={() => void checkout()}
          >
            Upgrade (Checkout)
          </PdfPrimaryButton>
          <PdfGhostButton
            type="button"
            disabled={busy || !billing?.stripeCustomerId}
            onClick={() => void portal()}
          >
            Manage (Portal)
          </PdfGhostButton>
          <PdfGhostButton type="button" disabled={busy} onClick={() => void load()}>
            Refresh
          </PdfGhostButton>
        </div>
      ) : null}
    </section>
  )
}
