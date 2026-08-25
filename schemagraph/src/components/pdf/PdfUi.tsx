import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Page title block — PDF style (no top nav bar). */
export function PdfPageHeader({
  title,
  subtitle,
  actions,
  compact,
}: {
  title: ReactNode
  subtitle?: string
  actions?: ReactNode
  compact?: boolean
}) {
  return (
    <header
      className={[
        'pdf-page-header shrink-0 border-b border-solid',
        compact ? 'pdf-page-header--compact px-0 pb-[10px] pt-0' : 'px-[24px] pb-[32px] pt-[32px]',
      ].join(' ')}
    >
      <div
        className={[
          'flex flex-wrap items-start justify-between',
          compact ? 'gap-[10px]' : 'gap-[16px]',
        ].join(' ')}
      >
        <div
          className={[
            'flex min-w-0 flex-col',
            compact ? 'gap-[2px]' : 'gap-[4px]',
          ].join(' ')}
        >
          <h1
            className={
              compact
                ? 'text-[13px] font-semibold leading-[18px] tracking-[-0.2px] text-[var(--pdf-text-primary)]'
                : 'text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[var(--pdf-text-primary)]'
            }
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={
                compact
                  ? 'text-[10px] leading-[14px] text-[var(--pdf-text-secondary)]'
                  : 'text-[12px] leading-[18px] text-[var(--pdf-text-secondary)] md:text-[14px] md:leading-[20px]'
              }
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            className={[
              'flex shrink-0 flex-wrap items-center',
              compact ? 'gap-[6px]' : 'gap-[12px]',
            ].join(' ')}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  )
}

export function PdfPrimaryButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={['pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[12px] font-semibold tracking-[0.6px] disabled:opacity-40', className].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

export function PdfGhostButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={['pdf-btn-ghost rounded-[4px] px-[13px] py-[7px] text-[12px] font-semibold tracking-[0.6px] disabled:opacity-40', className].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

export function PdfPanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={['pdf-panel overflow-hidden rounded-[8px]', className].join(' ')}>
      {children}
    </div>
  )
}

export function PdfBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'purple' | 'orange'
}) {
  const tones = {
    neutral: 'pdf-badge-neutral',
    success: 'pdf-badge-success',
    warn: 'pdf-badge-warn',
    danger: 'pdf-badge-danger',
    purple: 'pdf-badge-purple',
    orange: 'pdf-badge-orange',
  }
  return (
    <span
      className={['pdf-badge', tones[tone]].join(' ')}
    >
      {children}
    </span>
  )
}
