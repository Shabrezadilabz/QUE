import { useEffect, useId, useRef, useState } from 'react'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import type { DataSourceType } from '@/types/dataSource'
import type {
  DiagramFilters,
  ExportFormat,
  RelationshipFilterType,
  SourceTypeFilter,
  TopBarProps,
} from '@/types/topBar'
import { DEFAULT_DIAGRAM_FILTERS } from '@/types/topBar'

export type { TopBarProps, DiagramFilters, ExportFormat }

const SOURCE_OPTIONS: { value: SourceTypeFilter; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'databricks', label: 'Databricks' },
  { value: 'sql', label: 'SQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'excel', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
  { value: 'kafka', label: 'Kafka' },
]

const REL_OPTIONS: { value: RelationshipFilterType; label: string }[] = [
  { value: 'all', label: 'All relationships' },
  { value: 'explicit', label: 'Explicit' },
  { value: 'ai-inferred', label: 'AI-inferred' },
]

const CONFIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'Any confidence' },
  { value: '0.5', label: 'Conf ≥ 50%' },
  { value: '0.7', label: 'Conf ≥ 70%' },
  { value: '0.85', label: 'Conf ≥ 85%' },
]

/**
 * Workspace top bar — PDF slate chrome with filters + export.
 * Primary navigation lives in PdfSidebar; no search or duplicate nav links.
 */
export function TopBar({
  visibleTableCount,
  visibleRelationshipCount,
  filters: filtersProp,
  onFiltersChange,
  onExport,
  className = '',
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)

  const [internalFilters, setInternalFilters] = useState<DiagramFilters>(
    DEFAULT_DIAGRAM_FILTERS,
  )

  const filters = filtersProp ?? internalFilters

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  function patchFilters(partial: Partial<DiagramFilters>) {
    const next = { ...filters, ...partial }
    if (filtersProp === undefined) setInternalFilters(next)
    onFiltersChange?.(next)
  }

  function handleExport(format: ExportFormat) {
    onExport?.(format)
  }

  return (
    <header
      data-region="top-bar"
      className={`pdf-top-bar z-50 shrink-0 border-b border-solid ${className}`}
    >
      <div className="flex h-12 min-w-0 items-center gap-[12px] px-[16px] sm:h-14 sm:px-[20px]">
        <div className="flex min-w-0 shrink items-center gap-[12px]">
          <WorkspaceSwitcher variant="compact" />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[13px] font-semibold text-[#d4dbe3]">Workspace</p>
            <p className="truncate text-[10px] text-[#8a9099]">Schema graph · ERD canvas</p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-[8px]" ref={toolsRef}>
          <VisibleCounts
            tables={visibleTableCount}
            relationships={visibleRelationshipCount}
            className="hidden lg:flex"
          />

          <div className="hidden items-center gap-[8px] xl:flex">
            <FilterControls filters={filters} onChange={patchFilters} />
            <ExportButtons onExport={handleExport} />
          </div>

          <button
            type="button"
            className="pdf-btn-ghost rounded-[4px] px-[10px] py-[6px] text-[10px] font-semibold tracking-[0.6px] uppercase xl:hidden"
            aria-expanded={menuOpen}
            aria-controls="topbar-collapsed-panel"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Filters'}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="topbar-collapsed-panel"
          className="flex flex-col gap-[12px] border-t border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-elevated)] px-[16px] py-[12px] xl:hidden"
        >
          <VisibleCounts
            tables={visibleTableCount}
            relationships={visibleRelationshipCount}
            className="flex"
          />
          <FilterControls filters={filters} onChange={patchFilters} stacked />
          <ExportButtons onExport={handleExport} />
        </div>
      ) : null}
    </header>
  )
}

function VisibleCounts({
  tables,
  relationships,
  className = '',
}: {
  tables: number
  relationships: number
  className?: string
}) {
  return (
    <div
      className={`items-center gap-[8px] text-[10px] font-semibold tracking-[0.6px] text-[#8a9099] uppercase ${className}`}
      aria-live="polite"
    >
      <span className="pdf-shine whitespace-nowrap rounded-[4px] px-[8px] py-[4px]">
        <span className="text-[#d0d8e0]">{tables}</span> tables
      </span>
      <span className="pdf-shine whitespace-nowrap rounded-[4px] px-[8px] py-[4px]">
        <span className="text-[#7aecd0]">{relationships}</span> rels
      </span>
    </div>
  )
}

function FilterControls({
  filters,
  onChange,
  stacked,
}: {
  filters: DiagramFilters
  onChange: (partial: Partial<DiagramFilters>) => void
  stacked?: boolean
}) {
  return (
    <div
      className={
        stacked
          ? 'flex flex-col gap-[8px]'
          : 'flex shrink-0 flex-nowrap items-center gap-[8px]'
      }
    >
      <SelectControl
        label="Relationship type"
        value={filters.relationshipType}
        options={REL_OPTIONS}
        onChange={(v) =>
          onChange({ relationshipType: v as RelationshipFilterType })
        }
      />
      <SelectControl
        label="Min confidence"
        value={String(filters.minConfidence)}
        options={CONFIDENCE_OPTIONS}
        onChange={(v) => onChange({ minConfidence: Number(v) || 0 })}
      />
      <SelectControl
        label="Source type"
        value={filters.sourceType}
        options={SOURCE_OPTIONS}
        onChange={(v) => onChange({ sourceType: v as DataSourceType | 'all' })}
      />
    </div>
  )
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <label className="pdf-input flex shrink-0 items-center gap-[8px] rounded-[4px] px-[8px] py-[6px]">
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[9.5rem] cursor-pointer border-none bg-transparent text-[12px] text-[var(--pdf-text-primary)] outline-none"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--pdf-bg-panel)]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ExportButtons({
  onExport,
}: {
  onExport: (format: ExportFormat) => void
}) {
  const formats: ExportFormat[] = ['pdf', 'png', 'json']
  return (
    <div className="flex items-center gap-[6px]" role="group" aria-label="Export">
      {formats.map((fmt) => (
        <button
          key={fmt}
          type="button"
          onClick={() => onExport(fmt)}
          className="pdf-btn-ghost rounded-[4px] px-[10px] py-[6px] text-[10px] font-semibold tracking-[0.6px] uppercase"
        >
          {fmt}
        </button>
      ))}
    </div>
  )
}

export default TopBar
