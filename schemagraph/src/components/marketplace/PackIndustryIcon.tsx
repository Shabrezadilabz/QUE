/** Industry icons for Marketplace starter packs — PDF page-03 style. */
type IndustryKey =
  | 'retail'
  | 'finance'
  | 'saas'
  | 'healthcare'
  | 'logistics'
  | 'marketing'
  | 'platform'
  | 'ops'
  | 'default'

function normalizeIndustry(industry: string): IndustryKey {
  const k = industry.toLowerCase()
  if (k.includes('retail')) return 'retail'
  if (k.includes('finance') || k.includes('bank')) return 'finance'
  if (k.includes('saas') || k.includes('b2b') || k.includes('growth')) return 'saas'
  if (k.includes('health')) return 'healthcare'
  if (k.includes('logistic') || k.includes('supply')) return 'logistics'
  if (k.includes('market')) return 'marketing'
  if (k.includes('platform') || k.includes('data')) return 'platform'
  if (k.includes('ops') || k.includes('operat')) return 'ops'
  return 'default'
}

const STYLES: Record<IndustryKey, { box: string; icon: string }> = {
  retail: {
    box: 'border-[rgba(122,196,220,0.35)] bg-[rgba(122,196,220,0.12)]',
    icon: '#7ac4dc',
  },
  finance: {
    box: 'border-[rgba(107,159,212,0.35)] bg-[rgba(107,159,212,0.12)]',
    icon: '#6b9fd4',
  },
  saas: {
    box: 'border-[rgba(177,152,255,0.35)] bg-[rgba(177,152,255,0.12)]',
    icon: '#b198ff',
  },
  healthcare: {
    box: 'border-[rgba(255,138,128,0.35)] bg-[rgba(255,138,128,0.12)]',
    icon: '#ff8a80',
  },
  logistics: {
    box: 'border-[rgba(208,216,224,0.25)] bg-[rgba(170,181,192,0.1)]',
    icon: '#c8cdd3',
  },
  marketing: {
    box: 'border-[rgba(255,176,107,0.35)] bg-[rgba(255,176,107,0.1)]',
    icon: '#ffb06b',
  },
  platform: {
    box: 'border-[rgba(208,216,224,0.25)] bg-[rgba(170,181,192,0.1)]',
    icon: '#d0d8e0',
  },
  ops: {
    box: 'border-[rgba(240,160,32,0.3)] bg-[rgba(240,160,32,0.08)]',
    icon: '#f0a020',
  },
  default: {
    box: 'border-[rgba(208,216,224,0.22)] bg-[rgba(170,181,192,0.1)]',
    icon: '#d0d8e0',
  },
}

function IconSvg({ kind, color }: { kind: IndustryKey; color: string }) {
  const props = {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const,
  }

  switch (kind) {
    case 'retail':
      return (
        <svg {...props}>
          <path
            d="M4 4h2l1.2 8.4A1.5 1.5 0 0 0 8.7 14h6.6a1.5 1.5 0 0 0 1.5-1.3L18 6H6"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="17" r="1" fill={color} />
          <circle cx="15" cy="17" r="1" fill={color} />
        </svg>
      )
    case 'finance':
      return (
        <svg {...props}>
          <path
            d="M4 17V8l6-4 6 4v9"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M8 17v-5h4v5" stroke={color} strokeWidth="1.4" />
          <path d="M4 8h12" stroke={color} strokeWidth="1.4" />
        </svg>
      )
    case 'saas':
      return (
        <svg {...props}>
          <path
            d="M3 14l4-5 3 3 7-9"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M14 3h3v3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'healthcare':
      return (
        <svg {...props}>
          <rect
            x="4"
            y="6"
            width="12"
            height="10"
            rx="1.5"
            stroke={color}
            strokeWidth="1.4"
          />
          <path d="M10 8v6M7 11h6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
          <path
            d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6"
            stroke={color}
            strokeWidth="1.4"
          />
        </svg>
      )
    case 'logistics':
      return (
        <svg {...props}>
          <path
            d="M3 14h1.5a2 2 0 1 0 4 0H11a2 2 0 1 0 4 0H16V9l-2.5-3H3v8z"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M3 9h10.5L14 6" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <path
            d="M4 6.5 10 3l6 3.5V14l-6 3.5L4 14V6.5z"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M10 6.5v11M4 6.5l6 3.5 6-3.5"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

export function PackIndustryIcon({ industry }: { industry: string }) {
  const kind = normalizeIndustry(industry)
  const { box, icon } = STYLES[kind]
  return (
    <div
      className={[
        'flex size-[40px] shrink-0 items-center justify-center rounded-[4px] border border-solid',
        box,
      ].join(' ')}
    >
      <IconSvg kind={kind} color={icon} />
    </div>
  )
}

export function sourceBadgeLabel(hint: string): string {
  const cleaned = hint.replace(/[^a-zA-Z0-9]/g, '')
  if (cleaned.length >= 2) return cleaned.slice(0, 2)
  return hint.slice(0, 2).toUpperCase() || '·'
}
