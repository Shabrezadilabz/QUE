import { useEffect, useId, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { MobileNav } from '@/components/MobileNav'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { primaryNavLinkClass } from '@/components/primaryNavStyles'
import { QueLogo } from '@/components/QueLogo'
import type { DataSourceType } from '@/types/dataSource'
import type {
  DiagramFilters,
  ExportFormat,
  RelationshipFilterType,
  SourceTypeFilter,
  TopBarProps,
} from '@/types/topBar'
import { DEFAULT_DIAGRAM_FILTERS } from '@/types/topBar'

/* ─────────────────────────────────────────────────────────────────────────────
 * TopBar — workspace chrome
 * Layout: [Brand · Nav] [Search] ····· [Counts] [Tools ▾ / Filters] [Auth]
 * Tools (filters + export) stay in a disclosure until 2xl so the bar never wraps.
 * ─────────────────────────────────────────────────────────────────────────── */

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
 * Workspace top bar — search, filters, counts, export, session.
 */
export function TopBar({
  visibleTableCount,
  visibleRelationshipCount,
  searchQuery: searchQueryProp,
  filters: filtersProp,
  onSearchChange,
  onFiltersChange,
  onExport,
  className = '',
}: TopBarProps) {
  const searchId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform)

  const [internalSearch, setInternalSearch] = useState('')
  const [internalFilters, setInternalFilters] = useState<DiagramFilters>(
    DEFAULT_DIAGRAM_FILTERS,
  )

  const searchQuery = searchQueryProp ?? internalSearch
  const filters = filtersProp ?? internalFilters

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById(searchId)?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchId])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  function setSearch(next: string) {
    if (searchQueryProp === undefined) setInternalSearch(next)
    onSearchChange?.(next)
    patchFilters({ searchQuery: next })
  }

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
      className={`z-50 shrink-0 border-b border-secondary-container/30 bg-background ${className}`}
    >
      <div className="flex h-14 items-center gap-sm px-lg sm:h-16 sm:gap-md lg:px-lg">
        {/* Brand + nav */}
        <div className="flex shrink-0 items-center gap-md sm:gap-lg lg:gap-xl">
          <MobileNav showBelow="lg" />
          <QueLogo
            size={30}
            withWordmark
            wordmarkClassName="font-headline text-[1.2rem] font-bold leading-none tracking-tight text-on-surface sm:text-[1.35rem]"
          />
          <nav
            className="hidden items-center gap-5 lg:flex lg:gap-7"
            aria-label="Primary"
          >
            <WorkspaceSwitcher variant="nav" />
            <NavLink to="/workspace" className={primaryNavLinkClass}>
              Workspace
            </NavLink>
            <NavLink to="/chat" className={primaryNavLinkClass}>
              AI Chat
            </NavLink>
            <NavLink to="/sources" className={primaryNavLinkClass}>
              Sources
            </NavLink>
            <NavLink to="/joins" className={primaryNavLinkClass}>
              Joins
            </NavLink>
            <NavLink to="/domains" className={primaryNavLinkClass}>
              Domains
            </NavLink>
            <NavLink to="/catalog" className={primaryNavLinkClass}>
              Catalog
            </NavLink>
            <NavLink to="/jobs" className={primaryNavLinkClass}>
              Jobs
            </NavLink>
            <NavLink to="/lineage" className={primaryNavLinkClass}>
              Lineage
            </NavLink>
            <NavLink to="/steward" className={primaryNavLinkClass}>
              Steward
            </NavLink>
            <NavLink to="/agent" className={primaryNavLinkClass}>
              Agent
            </NavLink>
            <NavLink to="/settings" className={primaryNavLinkClass}>
              Settings
            </NavLink>
          </nav>
        </div>

        {/* Search — mono filter field (DESIGN.md code-sm) */}
        <div className="relative mx-sm min-h-9 min-w-[9rem] flex-1 sm:min-h-9 sm:min-w-[14rem] sm:max-w-[16rem] lg:mx-md lg:max-w-[18rem]">
          <span
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-[12px] text-on-surface-variant"
            aria-hidden
          >
            ⌕
          </span>
          <label htmlFor={searchId} className="sr-only">
            Filter tables and columns
          </label>
          <input
            id={searchId}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tables…"
            className="que-search-input h-9 w-full rounded border border-outline-variant bg-surface-container py-1 pr-14 pl-8 font-mono text-[12px] text-on-surface outline-none transition-all placeholder:text-on-surface-variant/50 focus:border-secondary focus:ring-1 focus:ring-secondary"
            autoComplete="off"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 font-label text-[10px] font-bold tracking-widest text-on-surface-variant/50 md:inline">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-sm" ref={toolsRef}>
          {/* Wide desktop: inline tools, never wrap */}
          <div className="hidden items-center gap-sm 2xl:flex">
            <FilterControls filters={filters} onChange={patchFilters} />
            <ExportButtons onExport={handleExport} />
          </div>

          <button
            type="button"
            className="rounded-lg border border-outline-variant/50 px-sm py-xs font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant uppercase hover:border-secondary-fixed hover:text-secondary-fixed 2xl:hidden"
            aria-expanded={menuOpen}
            aria-controls="topbar-collapsed-panel"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Tools'}
          </button>

          <AuthSessionControls />
        </div>
      </div>

      {menuOpen ? (
        <div
          id="topbar-collapsed-panel"
          className="flex flex-col gap-md border-t border-secondary-container/30 bg-surface-container-low px-md py-md 2xl:hidden"
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
      className={`items-center gap-sm font-label text-[10px] tracking-[0.14em] text-on-surface-variant ${className}`}
      aria-live="polite"
    >
      <span className="que-pill whitespace-nowrap border border-outline-variant bg-surface-container-lowest px-sm py-xs">
        <span className="text-secondary">{tables}</span> TABLES
      </span>
      <span className="que-pill whitespace-nowrap border border-outline-variant bg-surface-container-lowest px-sm py-xs">
        <span className="text-secondary">{relationships}</span> RELS
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
          ? 'flex flex-col gap-sm'
          : 'flex shrink-0 flex-nowrap items-center gap-sm'
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
    <label className="flex shrink-0 items-center gap-sm rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-sm py-xs">
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[9.5rem] cursor-pointer border-none bg-transparent font-body text-[12px] text-on-surface outline-none sm:text-xs"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-container-lowest">
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
    <div className="flex items-center gap-xs" role="group" aria-label="Export">
      {formats.map((fmt) => (
        <button
          key={fmt}
          type="button"
          onClick={() => onExport(fmt)}
          className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-sm py-xs font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant uppercase transition-colors hover:border-secondary-fixed hover:text-secondary-fixed"
        >
          {fmt}
        </button>
      ))}
    </div>
  )
}

export default TopBar
