type IconProps = { className?: string; size?: number }

export function IconMail({ className = '', size = 15 }: IconProps) {
  return (
    <svg
      width={size}
      height={size * 0.8}
      viewBox="0 0 15 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M1 2h13v8H1V2zm0 0 6.5 5L14 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconLock({ className = '', size = 12 }: IconProps) {
  return (
    <svg
      width={size}
      height={size * 1.3}
      viewBox="0 0 12 16"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="2"
        y="7"
        width="8"
        height="7"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M4 7V5a2 2 0 0 1 4 0v2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconArrowRight({ className = '', size = 11 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 11 11"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M2 5.5h7M6 3l3 2.5L6 8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconSso({ className = '', size = 17 }: IconProps) {
  return (
    <svg
      width={size}
      height={size * 0.55}
      viewBox="0 0 17 9"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="3" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1" />
      <circle cx="14" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1" />
      <path d="M5.5 4.5h6" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function IconCheck({ className = '', size = 30 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconLiveDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={[
        'inline-block size-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(122,236,208,0.6)]',
        className,
      ].join(' ')}
      aria-hidden
    />
  )
}
