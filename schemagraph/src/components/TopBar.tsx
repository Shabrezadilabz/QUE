import { useEffect, useId, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { MobileNav } from '@/components/MobileNav'
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

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'border-b-2 border-primary-fixed pb-1 font-label text-[11px] font-bold tracking-[0.12em] text-primary-fixed uppercase sm:text-xs'
    : 'font-label text-[11px] font-bold tracking-[0.12em] text-on-surface-variant uppercase transition-colors hover:text-primary-fixed sm:text-xs'

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
      className={`z-50 shrink-0 border-b border-outline-variant bg-background ${className}`}
    >
      <div className="flex h-14 items-center gap-sm px-md sm:h-16 sm:gap-md lg:px-margin-desktop">
        {/* Brand + nav */}
        <div className="flex shrink-0 items-center gap-sm sm:gap-md lg:gap-lg">
          <MobileNav showBelow="lg" />
          <span className="font-headline text-xl font-bold leading-none tracking-tight text-on-surface sm:text-2xl">
            Que
          </span>
          <nav
            className="hidden items-center gap-md lg:flex lg:gap-lg"
            aria-label="Primary"
          >
            <WorkspaceSwitcher variant="nav" />
            <NavLink to="/chat" className={navLinkClass}>
              AI Chat
            </NavLink>
            <NavLink to="/sources" className={navLinkClass}>
              Sources
            </NavLink>
            <NavLink to="/jobs" className={navLinkClass}>
              Jobs
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
          </nav>
        </div>

        {/* Search — keep a real minimum width so it never collapses to an icon */}
        <div className="mx-sm flex min-h-9 min-w-[9rem] flex-1 items-center gap-sm border border-outline-variant bg-surface-container-high px-sm focus-within:border-primary-fixed sm:min-h-10 sm:min-w-[14rem] sm:max-w-[22rem] sm:px-md lg:mx-md">
          <span
            className="shrink-0 font-label text-xs text-on-surface-variant"
            aria-hidden
          >
            ⌕
          </span>
          <label htmlFor={searchId} className="sr-only">
            Search tables and columns
          </label>
          <input
            id={searchId}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="min-w-0 flex-1 border-none bg-transparent font-body text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant/50 sm:text-sm"
            autoComplete="off"
          />
          <span className="hidden shrink-0 font-label text-[10px] font-bold tracking-widest text-on-surface-variant/50 md:inline">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-sm" ref={toolsRef}>
          <VisibleCounts
            tables={visibleTableCount}
            relationships={visibleRelationshipCount}
            className="hidden xl:flex"
          />

          {/* Wide desktop: inline tools, never wrap */}
          <div className="hidden items-center gap-sm 2xl:flex">
            <FilterControls filters={filters} onChange={patchFilters} />
            <ExportButtons onExport={handleExport} />
          </div>

          <button
            type="button"
            className="border border-outline-variant px-sm py-xs font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant uppercase hover:border-primary-fixed hover:text-primary-fixed 2xl:hidden"
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
          className="flex flex-col gap-md border-t border-outline-variant bg-surface-container px-md py-md 2xl:hidden"
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
      <span className="whitespace-nowrap border border-outline-variant bg-surface-container px-sm py-xs">
        <span className="text-primary-fixed">{tables}</span> TABLES
      </span>
      <span className="whitespace-nowrap border border-outline-variant bg-surface-container px-sm py-xs">
        <span className="text-primary-fixed">{relationships}</span> RELS
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
    <label className="flex shrink-0 items-center gap-sm border border-outline-variant bg-surface-container-high px-sm py-xs">
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[9.5rem] cursor-pointer border-none bg-transparent font-body text-[12px] text-on-surface outline-none sm:text-xs"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-container">
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
          className="border border-outline-variant bg-surface-container px-sm py-xs font-label text-[10px] font-bold tracking-[0.14em] text-on-surface-variant uppercase transition-colors hover:border-primary-fixed hover:text-primary-fixed"
        >
          {fmt}
        </button>
      ))}
    </div>
  )
}

export default TopBar
