import type { ReactNode } from 'react'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'

/** Shared panel shell — PDF page 10 settings cards. */
export const SETTINGS_PANEL =
  'overflow-hidden rounded-[8px] border border-solid border-[#424850] bg-[#0f1215] p-[20px]'

export const SETTINGS_PANEL_TITLE = 'text-[15px] font-semibold text-[#d4dbe3]'
export const SETTINGS_PANEL_SUB =
  'mt-[4px] max-w-[36rem] text-[12px] leading-snug text-[#a3afbe]'

export function SettingsSectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-[24px] flex flex-col justify-between gap-[16px] sm:flex-row sm:items-end">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-tight text-[#d4dbe3]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-[4px] max-w-[42rem] text-[13px] leading-snug text-[#a3afbe]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function SettingsPanelHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-[16px] flex flex-wrap items-start justify-between gap-[12px]">
      <div className="min-w-0">
        <h2 className={SETTINGS_PANEL_TITLE}>{title}</h2>
        {subtitle ? <p className={SETTINGS_PANEL_SUB}>{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-[8px]">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function SettingsSearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={['relative min-w-0', className].join(' ')}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] py-[10px] pl-[37px] pr-[13px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#8a9099] focus:border-[#6b7380]"
      />
      <img
        alt=""
        className="pointer-events-none absolute left-[12px] top-1/2 size-[13.5px] -translate-y-1/2 opacity-70"
        src={FIGMA_NAV.search}
      />
    </div>
  )
}

export function SettingsSelect({
  value,
  onChange,
  children,
  className = '',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  className?: string
  'aria-label'?: string
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[10px] text-[12px] text-[#d4dbe3] outline-none focus:border-[#6b7380]',
        className,
      ].join(' ')}
    >
      {children}
    </select>
  )
}

export function SettingsMetric({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold tracking-[0.5px] text-[#8a9099] uppercase">
        {label}
      </p>
      <p className="mt-[6px] text-[28px] font-semibold leading-none tracking-tight text-[#7aecd0]">
        {value}
      </p>
    </div>
  )
}

export function SettingsUsageBadge({ pct }: { pct: number }) {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-solid border-[rgba(122,236,208,0.35)] bg-[rgba(122,236,208,0.12)] px-[8px] py-[4px] text-[11px] font-semibold text-[#7aecd0]">
      {pct}% of soft cap
    </span>
  )
}

export function SettingsProgressRow({
  label,
  used,
  max,
  pct,
  hint,
}: {
  label: string
  used: number
  max: number
  pct: number
  hint: string
}) {
  const width = Math.min(100, pct)
  const barColor =
    pct >= 90 ? 'bg-[#ff6b6b]' : pct >= 80 ? 'bg-[#f0a020]' : 'bg-[#7aecd0]'

  return (
    <li>
      <div className="mb-[6px] flex items-center justify-between gap-[12px]">
        <span className="text-[12px] font-medium text-[#d4dbe3]">{label}</span>
        <span className="text-[12px] text-[#a3afbe]">
          {used} / {max}
        </span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-[#252a30]">
        <div
          className={['h-full rounded-full transition-all', barColor].join(' ')}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-[6px] text-[11px] text-[#8a9099]">{hint}</p>
    </li>
  )
}

export function SettingsRoleBadge({ role }: { role: string }) {
  const label =
    role === 'owner'
      ? 'Owner'
      : role === 'admin'
        ? 'Admin'
        : role === 'viewer'
          ? 'Viewer'
          : 'Editor'

  return (
    <span className="inline-flex items-center rounded-[4px] border border-solid border-[#424850] bg-[#252a30] px-[8px] py-[3px] text-[11px] font-medium text-[#c8cdd3]">
      {label}
    </span>
  )
}

export function SettingsKebabButton({
  onClick,
  label,
}: {
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-[28px] items-center justify-center rounded-[4px] text-[#a3afbe] transition-colors hover:bg-[#252a30] hover:text-[#d4dbe3]"
    >
      <span className="text-[16px] leading-none">⋮</span>
    </button>
  )
}

export function SettingsOrgNavIcon({ id }: { id: string }) {
  const common = 'size-[14px] shrink-0 stroke-current'
  switch (id) {
    case 'members':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={common} aria-hidden>
          <circle cx="6" cy="5" r="2.25" strokeWidth="1.2" />
          <path d="M2.5 13.5c0-2.2 1.6-3.5 3.5-3.5s3.5 1.3 3.5 3.5" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="11.5" cy="5.5" r="1.75" strokeWidth="1.2" />
          <path d="M9 13.5c.3-1.6 1.2-2.5 2.5-2.5 1 0 1.8.6 2.2 2.5" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'security':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={common} aria-hidden>
          <path d="M8 1.75 3 4v4c0 3 2.2 5.4 5 6.25 2.8-.85 5-3.25 5-6.25V4L8 1.75Z" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )
    case 'ai-policy':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={common} aria-hidden>
          <rect x="2.5" y="2.5" width="11" height="11" rx="2" strokeWidth="1.2" />
          <path d="M5.5 8h5M8 5.5v5" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'automation':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={common} aria-hidden>
          <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.4 4.4l1.4 1.4M10.2 10.2l1.4 1.4M4.4 11.6l1.4-1.4M10.2 5.8l1.4-1.4" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="8" cy="8" r="2.25" strokeWidth="1.2" />
        </svg>
      )
    case 'billing':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={common} aria-hidden>
          <rect x="2" y="4" width="12" height="8.5" rx="1.5" strokeWidth="1.2" />
          <path d="M2 7h12" strokeWidth="1.2" />
        </svg>
      )
    default:
      return null
  }
}

export function relativeActiveLabel(isYou: boolean, joinedAt?: string) {
  if (isYou) return 'Just now'
  if (!joinedAt) return '—'
  const diff = Date.now() - new Date(joinedAt).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) {
    const m = Math.max(1, Math.floor(diff / 60_000))
    return `${m} minute${m === 1 ? '' : 's'} ago`
  }
  if (diff < 86_400_000) {
    const h = Math.max(1, Math.floor(diff / 3_600_000))
    return `${h} hour${h === 1 ? '' : 's'} ago`
  }
  if (diff < 172_800_000) return 'Yesterday'
  return new Date(joinedAt).toLocaleDateString()
}
