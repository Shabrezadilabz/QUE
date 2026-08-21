import { useTheme } from '@/context/ThemeContext'

type ThemeToggleProps = {
  className?: string
  compact?: boolean
}

/** Sun/moon toggle for dark ↔ light mode. */
export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        'inline-flex items-center justify-center rounded border border-outline-variant transition-colors',
        'text-on-surface-variant hover:border-secondary hover:text-secondary',
        compact ? 'h-8 w-8' : 'gap-1.5 px-2.5 py-1.5',
        className,
      ].join(' ')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {!compact ? (
        <span className="font-label text-[10px] font-bold tracking-widest uppercase">
          {isDark ? 'Light' : 'Dark'}
        </span>
      ) : null}
    </button>
  )
}
