/** Colored icons for job template kinds — Marketplace-style accents. */

type TemplateKindKey =
  | 'enrich'
  | 'stitch'
  | 'scd2'
  | 'aggregate'
  | 'validate'
  | 'export'
  | 'default'

function normalizeKind(kind: string): TemplateKindKey {
  const k = kind.toLowerCase()
  if (k.includes('enrich') || k.includes('crm')) return 'enrich'
  if (k.includes('stitch') || k.includes('join') || k.includes('fact')) return 'stitch'
  if (k.includes('scd') || k.includes('dimension') || k.includes('history')) return 'scd2'
  if (k.includes('agg') || k.includes('rollup') || k.includes('metric')) return 'aggregate'
  if (k.includes('valid') || k.includes('test') || k.includes('drift')) return 'validate'
  if (k.includes('export') || k.includes('ship') || k.includes('deploy')) return 'export'
  return 'default'
}

const STYLES: Record<TemplateKindKey, { box: string; icon: string; label: string }> = {
  enrich: {
    box: 'border-[rgba(177,152,255,0.35)] bg-[rgba(177,152,255,0.12)]',
    icon: '#b198ff',
    label: 'Enrich',
  },
  stitch: {
    box: 'border-[rgba(122,236,208,0.35)] bg-[rgba(122,236,208,0.12)]',
    icon: '#7aecd0',
    label: 'Stitch',
  },
  scd2: {
    box: 'border-[rgba(255,176,107,0.35)] bg-[rgba(255,176,107,0.12)]',
    icon: '#ffb06b',
    label: 'SCD2',
  },
  aggregate: {
    box: 'border-[rgba(107,159,212,0.35)] bg-[rgba(107,159,212,0.12)]',
    icon: '#6b9fd4',
    label: 'Aggregate',
  },
  validate: {
    box: 'border-[rgba(240,160,32,0.35)] bg-[rgba(240,160,32,0.1)]',
    icon: '#f0a020',
    label: 'Validate',
  },
  export: {
    box: 'border-[rgba(208,216,224,0.28)] bg-[rgba(170,181,192,0.12)]',
    icon: '#d0d8e0',
    label: 'Export',
  },
  default: {
    box: 'border-[rgba(208,216,224,0.22)] bg-[rgba(170,181,192,0.1)]',
    icon: '#c8cdd3',
    label: 'Template',
  },
}

function KindSvg({ kind, color }: { kind: TemplateKindKey; color: string }) {
  const props = {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const,
  }

  switch (kind) {
    case 'enrich':
      return (
        <svg {...props}>
          <circle cx="7" cy="7" r="3" stroke={color} strokeWidth="1.4" />
          <circle cx="13" cy="13" r="3" stroke={color} strokeWidth="1.4" />
          <path d="M9.5 9.5l1 1" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M4 16l2.5-2.5M16 4l-2.5 2.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'stitch':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="6" height="10" rx="1" stroke={color} strokeWidth="1.4" />
          <rect x="11" y="5" width="6" height="10" rx="1" stroke={color} strokeWidth="1.4" />
          <path d="M9 10h2" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M8.5 8.5 10 10l-1.5 1.5M11.5 8.5 10 10l1.5 1.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'scd2':
      return (
        <svg {...props}>
          <path d="M4 14V6l6-3 6 3v8l-6 3-6-3z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M10 3v14M4 6l6 3 6-3M4 10l6 3 6-3" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )
    case 'aggregate':
      return (
        <svg {...props}>
          <path d="M4 15V9M8 15V5M12 15V7M16 15V3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'validate':
      return (
        <svg {...props}>
          <path d="M10 3l7 4v6l-7 4-7-4V7l7-4z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7 10l2 2 4-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'export':
      return (
        <svg {...props}>
          <path d="M10 3v10M6 9l4 4 4-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16h12" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
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
        </svg>
      )
  }
}

export function TemplateKindIcon({ kind }: { kind: string }) {
  const key = normalizeKind(kind)
  const { box, icon } = STYLES[key]
  return (
    <div
      className={[
        'flex size-[40px] shrink-0 items-center justify-center rounded-[4px] border border-solid',
        box,
      ].join(' ')}
    >
      <KindSvg kind={key} color={icon} />
    </div>
  )
}

export function templateKindLabel(kind: string): string {
  return STYLES[normalizeKind(kind)].label
}

export function templateTableBadge(table: string): string {
  const cleaned = table.replace(/[^a-zA-Z0-9]/g, '')
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase()
  return table.slice(0, 2).toUpperCase() || '·'
}
