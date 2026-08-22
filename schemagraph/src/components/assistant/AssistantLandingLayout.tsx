import type { ReactNode } from 'react'

export type LandingSuggestion = {
  category: string
  title: string
  onClick: () => void
  disabled?: boolean
}

/**
 * Centered assistant landing — greeting, suggestion cards, prompt box.
 */
export function AssistantLandingLayout({
  greeting,
  headline,
  suggestions,
  composer,
  footer,
}: {
  greeting: string
  headline: string
  suggestions: LandingSuggestion[]
  composer: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-[40px] px-[16px] py-[32px] md:px-[24px] md:py-[48px]">
      <header className="space-y-[8px]">
        <p className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--pdf-text-heading)] md:text-[40px]">
          {greeting}
        </p>
        <p className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--pdf-text-heading)] md:text-[40px]">
          {headline}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((s) => (
          <button
            key={`${s.category}-${s.title}`}
            type="button"
            disabled={s.disabled}
            onClick={s.onClick}
            className="pdf-panel group flex min-h-[120px] flex-col items-start gap-[16px] rounded-[16px] p-[20px] text-left transition-colors hover:border-[var(--pdf-btn-ghost-hover-border)] hover:bg-[var(--pdf-bg-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="pdf-shine rounded-full px-[12px] py-[4px] text-[11px] font-semibold text-[var(--pdf-text-secondary)]">
              {s.category}
            </span>
            <span className="text-[15px] font-medium leading-snug text-[var(--pdf-text-primary)] group-hover:text-[var(--pdf-text-heading)]">
              {s.title}
            </span>
          </button>
        ))}
      </div>

      <div className="w-full">{composer}</div>

      {footer ? (
        <p className="text-center text-[11px] text-[var(--pdf-text-faint)]">{footer}</p>
      ) : null}
    </div>
  )
}

export function LandingSparkleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className="mt-[2px] shrink-0 text-[var(--pdf-text-faint)]"
      aria-hidden
    >
      <path
        d="M12 2l1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2zM5 16l.8 2.6L8.4 19.4l-2.6.8L5 22.8l-.8-2.6L1.6 19.4l2.6-.8L5 16zM19 14l.8 2.6L22.4 17.4l-2.6.8L19 20.8l-.8-2.6L15.6 17.4l2.6-.8L19 14z"
        fill="currentColor"
      />
    </svg>
  )
}
