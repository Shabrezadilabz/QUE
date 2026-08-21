import type { ReactNode } from 'react'

/** Figma page header — title, subtitle, optional search + CTA. */
export function QuePageHeader({
  title,
  subtitle,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  actions,
}: {
  title: string
  subtitle?: string
  search?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  actions?: ReactNode
}) {
  return (
    <header className="shrink-0 border-b border-border-slate bg-surface-container-lowest px-6 pb-6 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold tracking-tight text-on-background">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 font-body text-xs text-on-surface-variant">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {onSearchChange != null ? (
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-on-surface-muted"
                aria-hidden
              >
                ⌕
              </span>
              <input
                type="search"
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="que-input w-64 pl-9 text-xs"
              />
            </div>
          ) : null}
          {actions}
        </div>
      </div>
    </header>
  )
}

export function QueMintButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center rounded bg-secondary px-4 py-2 font-label text-xs font-bold text-on-secondary transition-colors hover:bg-secondary-fixed-dim disabled:opacity-40',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function QueSlateButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center rounded bg-primary px-4 py-2 font-label text-xs font-semibold tracking-wide text-on-primary transition-colors hover:bg-primary-fixed-dim disabled:opacity-40',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function QueGhostButton({
  children,
  onClick,
  disabled,
  variant = 'default',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'danger'
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center rounded border px-3 py-1.5 font-label text-xs font-semibold transition-colors disabled:opacity-40',
        variant === 'danger'
          ? 'border-error/40 bg-error-container text-error hover:border-error'
          : 'border-outline-variant bg-surface-container-low text-on-surface hover:border-secondary hover:text-secondary',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

type BadgeTone = 'mint' | 'purple' | 'orange' | 'slate' | 'warn'

const BADGE_STYLES: Record<BadgeTone, string> = {
  mint: 'bg-secondary-container text-secondary border-secondary/30',
  purple: 'bg-[rgba(177,152,255,0.13)] text-[#b198ff] border-[#b198ff]/30',
  orange: 'bg-[rgba(255,176,107,0.13)] text-[#ffb06b] border-[#ffb06b]/30',
  slate: 'bg-surface-container-high text-on-surface border-outline-variant',
  warn: 'bg-[rgba(240,160,32,0.13)] text-[#f0a020] border-[#f0a020]/30',
}

export function QueBadge({
  children,
  tone = 'mint',
}: {
  children: ReactNode
  tone?: BadgeTone
}) {
  return (
    <span
      className={[
        'inline-flex items-center rounded border px-1.5 py-0.5 font-label text-[9px] font-bold tracking-wide uppercase',
        BADGE_STYLES[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export function QuePanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={[
        'overflow-hidden rounded-lg border border-border-slate bg-surface-container-lowest shadow-sm',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function QueDiffLine({
  line,
  index,
}: {
  line: string
  index: number
}) {
  const isAdd = line.startsWith('+') && !line.startsWith('+++')
  const isDel = line.startsWith('-') && !line.startsWith('---')
  return (
    <div
      className={[
        'flex gap-4 px-4 py-1 font-mono text-xs',
        isAdd
          ? 'bg-secondary-container text-secondary'
          : isDel
            ? 'bg-error-container text-error'
            : 'text-on-surface',
      ].join(' ')}
    >
      <span className="w-8 shrink-0 text-on-surface-muted">
        {isAdd ? `+ ${index}` : isDel ? `- ${index}` : index}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-all">{line || ' '}</span>
    </div>
  )
}
