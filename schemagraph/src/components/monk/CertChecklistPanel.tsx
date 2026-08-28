import { Link } from 'react-router-dom'

export type CertChecklistItem = {
  id: string
  label: string
  ok: boolean
  detail: string
  href?: string
}

export type CertChecklist = {
  packId: string
  allGreen: boolean
  canShipToBi: boolean
  goldenRecall: number | null
  minRecall: number
  items: CertChecklistItem[]
}

export function CertChecklistPanel({
  checklist,
  onShip,
  shipBusy,
}: {
  checklist: CertChecklist
  onShip?: () => void
  shipBusy?: boolean
}) {
  return (
    <section className="rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
      <div className="mb-[12px] flex flex-wrap items-center justify-between gap-[8px]">
        <div>
          <h2 className="text-[14px] font-semibold text-[#e8edf2]">
            Steward cert checklist
          </h2>
          <p className="mt-[4px] text-[11px] text-[#8b949e]">
            Ship-to-BI unlocks when every gate is green and pack cert has passed.
          </p>
        </div>
        <span
          className={[
            'rounded-full px-[10px] py-[4px] text-[10px] font-bold uppercase',
            checklist.allGreen
              ? 'bg-emerald-500/20 text-emerald-200'
              : 'bg-amber-500/20 text-amber-200',
          ].join(' ')}
        >
          {checklist.allGreen ? 'All green' : 'Action needed'}
        </span>
      </div>

      <ul className="space-y-[8px]">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className={[
              'flex items-start justify-between gap-[12px] rounded-[10px] border border-solid px-[12px] py-[10px]',
              item.ok
                ? 'border-emerald-500/25 bg-emerald-500/5'
                : 'border-amber-500/30 bg-amber-500/5',
            ].join(' ')}
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#e8edf2]">{item.label}</p>
              <p className="mt-[2px] text-[11px] text-[#8b949e]">{item.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-[8px]">
              <span
                className={[
                  'rounded-full px-[8px] py-[2px] text-[10px] font-semibold uppercase',
                  item.ok
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-300',
                ].join(' ')}
              >
                {item.ok ? 'OK' : 'Open'}
              </span>
              {item.href && !item.ok ? (
                <Link
                  to={item.href}
                  className="rounded-[8px] border border-solid border-[#424850] px-[10px] py-[4px] text-[11px] font-semibold text-[#c8cdd3] hover:bg-[#1a1f24]"
                >
                  Fix
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {onShip ? (
        <div className="mt-[14px] flex flex-wrap items-center gap-[10px]">
          <button
            type="button"
            disabled={!checklist.canShipToBi || shipBusy}
            onClick={onShip}
            className="rounded-[10px] bg-sky-500/20 px-[14px] py-[8px] text-[12px] font-semibold text-sky-200 hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {shipBusy ? 'Shipping…' : 'Ship to BI (Looker + Metabase)'}
          </button>
          {!checklist.canShipToBi ? (
            <span className="text-[11px] text-[#8b949e]">
              Complete checklist + pass cert to enable one-click ship
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
