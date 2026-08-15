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
 * TopBar — workspace chrome (aligned with QueAppChrome primary IA)
 * Layout: [Menu · Brand · Primary] [Search] ····· [Tools ▾] [Auth]
 * Extra routes live in MobileNav — not a 12-link strip that overflows laptops.
 * ─────────────────────────────────────────────────────────────────────────── */

export type { TopBarProps, DiagramFilters, ExportFormat }

/** Same primary set as QueAppChrome */
const PRIMARY_LINKS = [
  { to: '/outcome', label: 'Outcome' },
  { to: '/workspace', label: 'Workspace' },
  { to: '/chat', label: 'Chat' },
  { to: '/sources', label: 'Sources' },
  { to: '/joins', label: 'Joins' },
  { to: '/ship', label: 'Ship' },
] as const

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
      <div className="flex h-14 min-w-0 items-center gap-sm px-md sm:h-16 sm:gap-md sm:px-lg">
        <div className="flex min-w-0 shrink items-center gap-sm sm:gap-md">
          <MobileNav showBelow="md" />
          <QueLogo
            size={28}
            withWordmark
            wordmarkClassName="hidden font-headline text-[1.2rem] font-bold leading-none tracking-tight text-on-surface min-[420px]:inline sm:text-[1.35rem]"
          />
          <nav
            className="hidden h-14 min-w-0 items-stretch md:flex"
            aria-label="Primary"
          >
            <div className="mr-sm flex items-center lg:mr-md">
              <WorkspaceSwitcher variant="nav" />
            </div>
            {PRIMARY_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={primaryNavLinkClass}
                end={l.to === '/workspace' ? false : undefined}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="relative mx-xs min-h-9 min-w-0 max-w-[9rem] flex-1 sm:mx-sm sm:max-w-[14rem] lg:max-w-[18rem]">
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
            placeholder="Filter…"
            className="que-search-input h-9 w-full rounded border border-outline-variant bg-surface-container py-1 pr-3 pl-8 font-mono text-[12px] text-on-surface outline-none transition-all placeholder:text-on-surface-variant/50 focus:border-secondary focus:ring-1 focus:ring-secondary sm:pr-14"
            autoComplete="off"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 font-label text-[10px] font-bold tracking-widest text-on-surface-variant/50 lg:inline">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-sm" ref={toolsRef}>
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
