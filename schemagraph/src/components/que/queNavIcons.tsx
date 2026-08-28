/** Distinct inline SVG icons for the condensed Que sidebar (14×14 viewBox). */
import type { ReactNode } from 'react'
import type { QueNavId } from '@/components/que/queNavConfig'

type IconProps = { className?: string }

function Svg({ children, className }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className ?? 'size-[14px] shrink-0'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function QueNavIcon({ id, className }: { id: QueNavId; className?: string }) {
  switch (id) {
    case 'platform':
      return (
        <Svg className={className}>
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="8" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
          <rect x="13" y="13" width="8" height="8" rx="1" />
        </Svg>
      )
    case 'workspace':
      return (
        <Svg className={className}>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="12" cy="18" r="2.5" />
          <path d="M8.2 7.5 10 14M15.8 7.5 14 14M8.5 7.8h7" />
        </Svg>
      )
    case 'sources':
      return (
        <Svg className={className}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </Svg>
      )
    case 'joins':
      return (
        <Svg className={className}>
          <path d="M8 12h8" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="12" r="3" />
        </Svg>
      )
    case 'chat':
      return (
        <Svg className={className}>
          <path d="M4 5h16v10H8l-4 4V5z" />
          <path d="M8 10h8M8 13h5" />
        </Svg>
      )
    case 'build':
      return (
        <Svg className={className}>
          <path d="M8 3 3 8l9 9 5-5-9-9z" />
          <path d="M14 14l7 7" />
        </Svg>
      )
    case 'analytics':
      return (
        <Svg className={className}>
          <path d="M4 20V10M10 20V4M16 20v-6M22 20H2" />
        </Svg>
      )
    case 'govern':
      return (
        <Svg className={className}>
          <path d="M12 3 4 7v6c0 4.4 3.5 7.2 8 8 4.5-.8 8-3.6 8-8V7l-8-4z" />
          <path d="M9 12l2 2 4-4" />
        </Svg>
      )
    case 'settings':
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </Svg>
      )
    default:
      return (
        <Svg className={className}>
          <circle cx="12" cy="12" r="8" />
        </Svg>
      )
  }
}
