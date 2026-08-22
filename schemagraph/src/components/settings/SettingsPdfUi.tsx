import type { ReactNode } from 'react'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import {
  FIGMA_SETTINGS_NAV,
  type SettingsNavId,
} from '@/components/figma/settingsNavAssets'

/** Shared panel shell — PDF page 10 settings cards. */
export const SETTINGS_PANEL =
  'pdf-panel overflow-hidden rounded-[8px] p-[20px]'

export const SETTINGS_PANEL_TITLE =
  'text-[15px] font-semibold text-[var(--pdf-text-primary)]'
export const SETTINGS_PANEL_SUB =
  'mt-[4px] max-w-[36rem] text-[12px] leading-snug text-[var(--pdf-text-muted)]'

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
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--pdf-text-primary)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-[4px] max-w-[42rem] text-[13px] leading-snug text-[var(--pdf-text-muted)]">
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
        className="pdf-input w-full rounded-[4px] py-[10px] pl-[37px] pr-[13px] text-[12px] outline-none"
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
        'pdf-input rounded-[4px] px-[12px] py-[10px] text-[12px] outline-none',
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
      <p className="text-[10px] font-semibold tracking-[0.5px] text-[var(--pdf-text-faint)] uppercase">
        {label}
      </p>
      <p className="mt-[6px] text-[28px] font-semibold leading-none tracking-tight text-[var(--pdf-accent)]">
        {value}
      </p>
    </div>
  )
}

export function SettingsUsageBadge({ pct }: { pct: number }) {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-solid border-[color-mix(in_srgb,var(--pdf-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--pdf-accent)_12%,transparent)] px-[8px] py-[4px] text-[11px] font-semibold text-[var(--pdf-accent)]">
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
    pct >= 90
      ? 'bg-[var(--pdf-danger)]'
      : pct >= 80
        ? 'bg-[var(--pdf-warn)]'
        : 'bg-[var(--pdf-accent)]'

  return (
    <li>
      <div className="mb-[6px] flex items-center justify-between gap-[12px]">
        <span className="text-[12px] font-medium text-[var(--pdf-text-primary)]">{label}</span>
        <span className="text-[12px] text-[var(--pdf-text-muted)]">
          {used} / {max}
        </span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-full bg-[var(--pdf-bg-muted)]">
        <div
          className={['h-full rounded-full transition-all', barColor].join(' ')}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-[6px] text-[11px] text-[var(--pdf-text-faint)]">{hint}</p>
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
    <span className="inline-flex items-center rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-muted)] px-[8px] py-[3px] text-[11px] font-medium text-[var(--pdf-text-secondary)]">
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
      className="inline-flex size-[28px] items-center justify-center rounded-[4px] text-[var(--pdf-text-muted)] transition-colors hover:bg-[var(--pdf-bg-muted)] hover:text-[var(--pdf-text-primary)]"
    >
      <span className="text-[16px] leading-none">⋮</span>
    </button>
  )
}

export function SettingsOrgNavIcon({
  id,
  active = false,
}: {
  id: SettingsNavId
  active?: boolean
}) {
  const icon = FIGMA_SETTINGS_NAV[id]
  return (
    <div
      aria-hidden
      className={[
        'size-[16px] shrink-0',
        active ? 'bg-[var(--pdf-text-primary)]' : 'bg-[var(--pdf-text-faint)]',
      ].join(' ')}
      style={{
        maskImage: `url(${icon})`,
        WebkitMaskImage: `url(${icon})`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  )
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
