import {
  CONNECTOR_CATEGORIES,
  type CatalogItem,
  type ConnectorCategoryId,
} from '@/connectors/connectorCatalog'
import { SourceTypeIcon } from '@/components/sidebar/SourceTypeIcon'

type Props = {
  items: CatalogItem[]
  selectedKey: string | null
  query: string
  categoryId: ConnectorCategoryId
  onQueryChange: (q: string) => void
  onCategoryChange: (id: ConnectorCategoryId) => void
  onPick: (item: CatalogItem) => void
  onRequest: () => void
  onUseCsv: () => void
  /** When true, show Continue after selection */
  onContinue?: () => void
  continueLabel?: string
  continueDisabled?: boolean
}

/**
 * Connector catalog — Databox-style tile grid (icon squares + selection ring).
 */
export function ConnectorCatalogGrid({
  items,
  selectedKey,
  query,
  categoryId,
  onQueryChange,
  onCategoryChange,
  onPick,
  onRequest,
  onUseCsv,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-[56rem]">
      <div className="mb-lg flex flex-col items-center text-center">
        <SourcesBranchMark className="mb-md h-14 w-14 text-primary" />
        <h2 className="font-headline text-xl font-semibold text-on-surface">
          Choose a connector
        </h2>
        <p className="mt-xs max-w-[32rem] font-body text-[13px] text-on-surface-variant">
          Pick a tile to open a clean setup form. Prefer fixtures for demos —
          credentials only when you go live.
        </p>
      </div>

      <div className="mb-md flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
          {CONNECTOR_CATEGORIES.map((c) => {
            const active = categoryId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onCategoryChange(c.id)}
                className={[
                  'rounded-full px-3 py-1 font-label text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-white text-on-surface-variant ring-1 ring-outline-variant/40 hover:ring-primary/40',
                ].join(' ')}
              >
                {c.label}
              </button>
            )
          })}
        </div>
        <div className="relative mx-auto w-full max-w-[18rem] sm:mx-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search connectors…"
            className="w-full rounded-lg border border-outline-variant/30 bg-white py-1.5 pl-9 pr-3 font-body text-[13px] text-on-surface outline-none focus:border-primary"
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-white p-xl text-center">
          <p className="font-headline text-base font-semibold text-on-surface">
            No connector matched “{query}”
          </p>
          <p className="mx-auto mt-sm max-w-[28rem] font-body text-[13px] text-on-surface-variant">
            Request a connector, or bridge with CSV / Excel today.
          </p>
          <div className="mt-lg flex flex-wrap justify-center gap-sm">
            <button
              type="button"
              onClick={onRequest}
              className="rounded-lg bg-primary px-md py-2 font-label text-[12px] font-semibold text-on-primary"
            >
              Request connector
            </button>
            <button
              type="button"
              onClick={onUseCsv}
              className="rounded-lg border border-primary px-md py-2 font-label text-[12px] font-semibold text-primary"
            >
              Use CSV / Excel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-md sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => {
            const selected = selectedKey === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onPick(item)}
                className={[
                  'group flex flex-col items-center gap-sm rounded-2xl border bg-white p-md text-center transition-all active:scale-[0.98]',
                  selected
                    ? 'border-primary shadow-[0_0_0_2px_rgba(154,68,45,0.25)]'
                    : 'border-outline-variant/25 hover:border-primary/40 hover:shadow-md',
                ].join(' ')}
              >
                <div
                  className={[
                    'flex h-16 w-16 items-center justify-center rounded-xl border transition-colors sm:h-[4.5rem] sm:w-[4.5rem]',
                    selected
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-outline-variant/30 bg-[#FBF8F4] text-on-surface-variant group-hover:border-primary/40 group-hover:text-primary',
                  ].join(' ')}
                >
                  {item.type ? (
                    <SourceTypeIcon type={item.type} className="h-8 w-8" />
                  ) : (
                    <span className="font-headline text-2xl leading-none">+</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-label text-[13px] font-semibold text-on-surface">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate font-label text-[10px] tracking-wide text-on-surface-variant uppercase">
                    {item.categoryLabel}
                  </p>
                </div>
                {!item.creatable ? (
                  <span className="rounded-full bg-secondary-container px-2 py-0.5 font-label text-[10px] text-on-secondary-container">
                    Request
                  </span>
                ) : item.preferredAuth === 'fixture' ? (
                  <span className="rounded-full bg-tertiary/10 px-2 py-0.5 font-label text-[10px] text-tertiary">
                    Fixture
                  </span>
                ) : null}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onRequest}
            className="flex flex-col items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant/50 bg-transparent p-md text-center transition-colors hover:border-primary/40 hover:bg-white/60"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-outline-variant/40 text-on-surface-variant sm:h-[4.5rem] sm:w-[4.5rem]">
              <span className="text-2xl">⊕</span>
            </div>
            <p className="font-label text-[13px] font-semibold text-on-surface">
              Request
            </p>
            <p className="font-label text-[10px] text-on-surface-variant uppercase">
              Custom
            </p>
          </button>
        </div>
      )}

      {onContinue ? (
        <div className="mt-xl flex flex-wrap items-center justify-between gap-md border-t border-outline-variant/20 pt-lg">
          <p className="font-body text-[12px] text-on-surface-variant">
            {selectedKey
              ? `Selected · ${items.find((i) => i.key === selectedKey)?.title ?? selectedKey}`
              : 'Select a tile to continue'}
          </p>
          <button
            type="button"
            disabled={continueDisabled}
            onClick={onContinue}
            className="rounded-lg bg-primary px-lg py-2 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
          >
            {continueLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Branching “sources hub” mark — inspired by connector fan-out iconography. */
export function SourcesBranchMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
    >
      <path
        d="M24 40V28M24 28V18M24 28l-10-8M24 28l10-8M14 20V12M34 20V12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="3" stroke="currentColor" strokeWidth="2" fill="white" />
      <circle cx="14" cy="10" r="3" stroke="currentColor" strokeWidth="2" fill="white" />
      <circle cx="34" cy="10" r="3" stroke="currentColor" strokeWidth="2" fill="white" />
      <circle cx="24" cy="40" r="3" stroke="currentColor" strokeWidth="2" fill="white" />
    </svg>
  )
}
