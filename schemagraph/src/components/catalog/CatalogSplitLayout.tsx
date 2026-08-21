import type { ReactNode } from 'react'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'

export type CatalogBadgeTone = 'approved' | 'draft' | 'review' | 'neutral'

const BADGE_STYLES: Record<CatalogBadgeTone, string> = {
  approved:
    'border-[rgba(122,236,208,0.45)] bg-[rgba(122,236,208,0.12)] text-[#7aecd0]',
  draft: 'border-[#424850] bg-[#1e2328] text-[#8a9099]',
  review:
    'border-[rgba(255,176,107,0.45)] bg-[rgba(255,176,107,0.12)] text-[#ffb06b]',
  neutral: 'border-[#424850] bg-[#1e2328] text-[#c8cdd3]',
}

/** Full-page catalog shell — PDF page-07 split layout. */
export function CatalogSplitPage({
  title,
  subtitle,
  headerActions,
  viewToggle,
  banner,
  children,
}: {
  title: string
  subtitle?: string
  headerActions?: ReactNode
  viewToggle?: ReactNode
  banner?: ReactNode
  children: ReactNode
}) {
  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title={title}
          subtitle={subtitle}
          actions={
            <div className="flex flex-wrap items-center gap-[8px]">
              {viewToggle}
              {headerActions}
            </div>
          }
        />
        {banner}
        <div className="flex min-h-0 flex-1 gap-[16px] p-[24px]">{children}</div>
      </div>
    </QueAppChrome>
  )
}

export function CatalogViewToggle({
  options,
  active,
  onChange,
}: {
  options: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex rounded-[4px] border border-solid border-[#424850] p-[2px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={[
            'rounded-[2px] px-[12px] py-[6px] text-[11px] font-semibold',
            active === o.id
              ? 'bg-[#2e343b] text-[#d4dbe3]'
              : 'text-[#a3afbe] hover:text-[#d4dbe3]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Left directory panel — Terms / Joins / Paths / Controls list. */
export function CatalogDirectory({
  title,
  onAdd,
  search,
  onSearch,
  searchPlaceholder = 'Filter…',
  filters,
  children,
  footer,
}: {
  title: string
  onAdd?: () => void
  search?: string
  onSearch?: (v: string) => void
  searchPlaceholder?: string
  filters?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] lg:w-[340px]">
      <div className="flex shrink-0 items-center justify-between border-b border-solid border-[#424850] px-[16px] py-[14px]">
        <h2 className="text-[14px] font-semibold text-[#d4dbe3]">{title}</h2>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex size-[24px] items-center justify-center rounded-[4px] border border-solid border-[#424850] text-[14px] text-[#c8cdd3] hover:border-[#6b7380] hover:text-[#d4dbe3]"
            aria-label="Add"
          >
            +
          </button>
        ) : null}
      </div>

      {onSearch ? (
        <div className="shrink-0 border-b border-solid border-[#424850] px-[12px] py-[12px]">
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] py-[8px] pl-[32px] pr-[10px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#6b7380]"
            />
            <img
              alt=""
              className="pointer-events-none absolute left-[10px] top-1/2 size-[11px] -translate-y-1/2 opacity-70"
              src={FIGMA_NAV.search}
            />
          </div>
          {filters ? <div className="mt-[10px] flex flex-wrap gap-[6px]">{filters}</div> : null}
        </div>
      ) : filters ? (
        <div className="shrink-0 border-b border-solid border-[#424850] px-[12px] py-[12px]">
          <div className="flex flex-wrap gap-[6px]">{filters}</div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-[8px]">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-solid border-[#424850] px-[12px] py-[10px] text-[11px] text-[#8a9099]">
          {footer}
        </div>
      ) : null}
    </aside>
  )
}

export function CatalogFilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[12px] border border-solid px-[10px] py-[4px] text-[11px] font-semibold',
        active
          ? 'border-[#424850] bg-[#2e343b] text-[#d4dbe3]'
          : 'border-[#424850] bg-[#0f1215] text-[#a3afbe] hover:bg-[#15191e]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export function CatalogDirectoryCard({
  title,
  badge,
  badgeTone = 'neutral',
  description,
  meta,
  active,
  onClick,
}: {
  title: string
  badge?: string
  badgeTone?: CatalogBadgeTone
  description?: string
  meta?: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'mb-[6px] w-full rounded-[4px] border border-solid p-[12px] text-left transition-colors',
        active
          ? 'border-[#d0d8e0]/45 bg-[#1e2328] ring-1 ring-[rgba(208,216,224,0.12)]'
          : 'border-[#424850] bg-[#121619] hover:border-[#6b7380]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-[8px]">
        <p className="min-w-0 text-[13px] font-semibold leading-snug text-[#d4dbe3]">{title}</p>
        {badge ? <CatalogStatusBadge label={badge} tone={badgeTone} /> : null}
      </div>
      {description ? (
        <p className="mt-[6px] line-clamp-2 text-[11px] leading-[16px] text-[#a3afbe]">
          {description}
        </p>
      ) : null}
      {meta ? <div className="mt-[8px] flex flex-wrap items-center gap-[8px] text-[10px] text-[#8a9099]">{meta}</div> : null}
    </button>
  )
}

export function CatalogStatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: CatalogBadgeTone
}) {
  return (
    <span
      className={[
        'shrink-0 rounded-[2px] border border-solid px-[6px] py-[2px] text-[9px] font-bold tracking-[0.6px] uppercase',
        BADGE_STYLES[tone],
      ].join(' ')}
    >
      {label}
    </span>
  )
}

/** Right detail panel. */
export function CatalogDetailPane({
  children,
  empty,
}: {
  children?: ReactNode
  empty?: ReactNode
}) {
  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[4px] border border-solid border-[#424850] bg-[#0f1215]">
      {children ?? (
        <div className="flex h-full min-h-[320px] items-center justify-center p-[32px] text-center text-[13px] text-[#a3afbe]">
          {empty ?? 'Select an item from the directory.'}
        </div>
      )}
    </main>
  )
}

export function CatalogDetailHeader({
  title,
  badge,
  badgeTone,
  actions,
  meta,
  description,
}: {
  title: string
  badge?: string
  badgeTone?: CatalogBadgeTone
  actions?: ReactNode
  meta?: ReactNode
  description?: string
}) {
  return (
    <div className="border-b border-solid border-[#424850] px-[24px] py-[20px]">
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-[10px]">
            <h2 className="text-[22px] font-bold leading-tight text-[#ecf0f4]">{title}</h2>
            {badge ? <CatalogStatusBadge label={badge} tone={badgeTone} /> : null}
          </div>
          {meta ? (
            <div className="mt-[10px] flex flex-wrap items-center gap-[16px] text-[12px] text-[#a3afbe]">
              {meta}
            </div>
          ) : null}
          {description ? (
            <p className="mt-[14px] max-w-[56rem] text-[13px] leading-[20px] text-[#c8cdd3]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-[8px]">{actions}</div> : null}
      </div>
    </div>
  )
}

export function CatalogMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-[#6b7380]">{label}:</span>{' '}
      <span className="text-[#c8cdd3]">{value}</span>
    </span>
  )
}

export function CatalogDetailTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-[20px] border-b border-solid border-[#424850] px-[24px]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={[
            'border-b-2 py-[12px] text-[12px] font-semibold transition-colors',
            active === t.id
              ? 'border-[#d0d8e0] text-[#d4dbe3]'
              : 'border-transparent text-[#8a9099] hover:text-[#c8cdd3]',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function CatalogDetailBody({ children }: { children: ReactNode }) {
  return <div className="px-[24px] py-[20px]">{children}</div>
}

export function CatalogSection({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="mb-[20px]">
      <div className="mb-[10px] flex items-center justify-between gap-[8px]">
        <h3 className="text-[13px] font-semibold text-[#d4dbe3]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function CatalogAssetCard({
  icon,
  title,
  platform,
  description,
  field,
  fieldType,
}: {
  icon?: string
  title: string
  platform: string
  description?: string
  field?: string
  fieldType?: string
}) {
  return (
    <article className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[14px]">
      <div className="flex items-start justify-between gap-[8px]">
        <div className="flex min-w-0 items-start gap-[10px]">
          <span className="flex size-[32px] shrink-0 items-center justify-center rounded-[4px] border border-solid border-[#424850] bg-[#1e2328] text-[14px] text-[#a3afbe]">
            {icon ?? '▦'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#d4dbe3]">{title}</p>
            <span className="mt-[4px] inline-block rounded-[2px] border border-solid border-[#424850] bg-[#2e343b] px-[6px] py-[1px] text-[9px] font-bold tracking-[0.6px] text-[#c8cdd3] uppercase">
              {platform}
            </span>
          </div>
        </div>
        <span className="text-[12px] text-[#6b7380]" aria-hidden>
          ↗
        </span>
      </div>
      {description ? (
        <p className="mt-[10px] text-[11px] text-[#a3afbe]">{description}</p>
      ) : null}
      {field ? (
        <div className="mt-[10px] rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[10px] py-[8px]">
          <div className="flex items-center gap-[6px]">
            <span className="text-[10px] text-[#7aecd0]">●</span>
            <span className="font-mono text-[11px] text-[#d4dbe3]">{field}</span>
            {fieldType ? (
              <span className="ml-auto font-mono text-[10px] text-[#8a9099]">{fieldType}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function CatalogCodeBlock({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[4px] border border-solid border-[#424850] bg-[#0d1117] px-[14px] py-[12px] font-mono text-[12px] leading-[1.5]">
      {children}
    </div>
  )
}

export { PdfGhostButton, PdfPrimaryButton }
