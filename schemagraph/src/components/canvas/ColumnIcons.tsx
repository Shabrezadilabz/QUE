/**
 * Small SVG glyphs for column data types + key constraints.
 * Used inside TableNode rows and tooltips.
 */

import type { ColumnKeyKind } from '@/types/schema'

const svgProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  'aria-hidden': true as const,
}

/** Icon hint for a SQL / document data type string. */
export function ColumnTypeIcon({ dataType }: { dataType: string }) {
  const t = dataType.toUpperCase()

  if (t.includes('UUID') || t.includes('OBJECTID') || t.includes('GUID')) {
    return (
      <svg {...svgProps}>
        <rect x="4" y="4" width="16" height="16" />
        <path d="M8 12h8M12 8v8" />
      </svg>
    )
  }
  if (t.includes('TIME') || t.includes('DATE')) {
    return (
      <svg {...svgProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    )
  }
  if (t.includes('INT') || t.includes('NUM') || t.includes('FLOAT') || t.includes('DEC')) {
    return (
      <svg {...svgProps}>
        <path d="M8 6v12M16 6v12M6 10h12M6 14h12" />
      </svg>
    )
  }
  if (t.includes('JSON') || t.includes('JSONB') || t.includes('MAP') || t.includes('OBJ')) {
    return (
      <svg {...svgProps}>
        <path d="M8 5c-2 0-3 1-3 3v2c0 1-.5 2-2 2 1.5 0 2 1 2 2v2c0 2 1 3 3 3" />
        <path d="M16 5c2 0 3 1 3 3v2c0 1 .5 2 2 2-1.5 0-2 1-2 2v2c0 2-1 3-3 3" />
      </svg>
    )
  }
  if (t.includes('BOOL')) {
    return (
      <svg {...svgProps}>
        <rect x="5" y="7" width="14" height="10" />
        <path d="M9 12h6" />
      </svg>
    )
  }
  // Default: text / varchar
  return (
    <svg {...svgProps}>
      <path d="M5 7h14M12 7v10M8 17h8" />
    </svg>
  )
}

export function keyKindLabel(kind?: ColumnKeyKind): string | null {
  if (!kind || kind === 'none') return null
  if (kind === 'pk') return 'PRIMARY KEY'
  if (kind === 'fk') return 'FOREIGN KEY'
  if (kind === 'unique') return 'UNIQUE'
  if (kind === 'index') return 'INDEX'
  return null
}

/** Constraint glyph (PK key / FK link / unique diamond). */
export function ColumnKeyIcon({ kind }: { kind?: ColumnKeyKind }) {
  if (!kind || kind === 'none') return null
  const title = keyKindLabel(kind) ?? ''

  if (kind === 'pk') {
    return (
      <svg {...svgProps} aria-label={title}>
        <circle cx="8" cy="12" r="3" />
        <path d="M11 12h9M17 12v3M20 12v2" />
      </svg>
    )
  }
  if (kind === 'fk') {
    return (
      <svg {...svgProps} aria-label={title}>
        <path d="M10 13a4 4 0 1 1 0-2h4a4 4 0 1 1 0 2" />
      </svg>
    )
  }
  return (
    <svg {...svgProps} aria-label={title}>
      <path d="M12 4l4 8-4 8-4-8 4-8z" />
    </svg>
  )
}
