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
        'pdf-page-header shrink-0 border-b border-solid border-[#424850] bg-[#0f1215]',
        compact ? 'px-0 pb-[16px] pt-0' : 'px-[24px] pb-[32px] pt-[32px]',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[#d4dbe3]">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-[12px] leading-[18px] text-[#c8cdd3] md:text-[14px] md:leading-[20px]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-[12px]">{actions}</div> : null}
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
    neutral: 'bg-[#2e343b] text-[#c8cdd3] border-[#424850]',
    success: 'bg-[rgba(122,236,208,0.15)] text-[#7aecd0] border-[rgba(122,236,208,0.35)]',
    warn: 'bg-[rgba(240,160,32,0.12)] text-[#f0a020] border-[rgba(240,160,32,0.35)]',
    danger: 'bg-[rgba(255,107,107,0.12)] text-[#ff6b6b] border-[rgba(255,107,107,0.35)]',
    purple: 'bg-[rgba(177,152,255,0.13)] text-[#b198ff] border-[rgba(177,152,255,0.3)]',
    orange: 'bg-[rgba(255,176,107,0.13)] text-[#ffb06b] border-[rgba(255,176,107,0.3)]',
  }
  return (
    <span
      className={[
        'inline-flex items-center rounded-[4px] border border-solid px-[6px] py-[2px] text-[9px] font-bold tracking-[0.5px] uppercase',
        tones[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}
