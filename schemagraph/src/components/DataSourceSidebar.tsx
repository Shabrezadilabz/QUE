import { useMemo, useState } from 'react'
import type { DataSource, DataSourceStatus } from '@/types/dataSource'
import { DUMMY_DATA_SOURCES } from '@/data/dummySources'
import { SourceTypeIcon, sourceTypeLabel } from '@/components/sidebar/SourceTypeIcon'

/* ─────────────────────────────────────────────────────────────────────────────
 * DataSourceSidebar
 * Left rail: filterable list of connected data sources.
 * Swap `sources` prop for live API data later — keep DataSource shape.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface DataSourceSidebarProps {
  /**
   * Connected sources to render.
   * Defaults to DUMMY_DATA_SOURCES for local UI work.
   */
  sources?: DataSource[]
  /** Controlled selected source id (omit for uncontrolled internal state). */
  selectedSourceId?: string | null
  /** Initial selection when uncontrolled. */
  defaultSelectedSourceId?: string | null
  /** Fired when the user clicks a source row. */
  onSelect?: (sourceId: string) => void
  /** Optional: open “add connection” flow. */
  onAddSource?: () => void
  /**
   * Sync selected Postgres connection (introspect → metadata).
   * When set, footer becomes Sync Schema for postgresql sources.
   */
  onSyncSource?: (sourceId: string) => void | Promise<void>
  /** True while a sync request is in flight */
  syncing?: boolean
  /** When true, sync is unavailable due to role (not missing selection) */
  readOnlySync?: boolean
  className?: string
}

/** Status LED colors — Sunset Clay (sage = healthy) */
const STATUS_DOT: Record<
  DataSourceStatus,
  { className: string; label: string }
> = {
  active: {
    className: 'bg-tertiary',
    label: 'Active',
  },
  warning: {
    className: 'bg-sand',
    label: 'Warning',
  },
  error: {
    className: 'bg-error',
    label: 'Error',
  },
}

/**
 * Filters by display name or connector type (case-insensitive substring).
 */
function matchesFilter(source: DataSource, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    source.name.toLowerCase().includes(q) ||
    source.type.toLowerCase().includes(q) ||
    sourceTypeLabel(source.type).toLowerCase().includes(q) ||
    (source.description?.toLowerCase().includes(q) ?? false)
  )
}

/**
 * Fixed 220px left sidebar listing data connections.
 * Click a row → highlight + `onSelect(sourceId)`.
 */
export function DataSourceSidebar({
  sources = DUMMY_DATA_SOURCES,
  selectedSourceId,
  defaultSelectedSourceId = null,
  onSelect,
  onAddSource,
  onSyncSource,
  syncing = false,
  readOnlySync = false,
  className = '',
}: DataSourceSidebarProps) {
  const [filter, setFilter] = useState('')
  /** Uncontrolled selection fallback when parent does not pass selectedSourceId */
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    defaultSelectedSourceId,
  )

  const isControlled = selectedSourceId !== undefined
  const activeId = isControlled ? selectedSourceId : internalSelectedId

  const filteredSources = useMemo(
    () => sources.filter((s) => matchesFilter(s, filter)),
    [sources, filter],
  )

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === activeId) ?? null,
    [sources, activeId],
  )

  const SYNCABLE = new Set([
    'postgresql',
    'excel',
    'csv',
    'mongodb',
    'databricks',
  ])
  const canSync =
    Boolean(onSyncSource) &&
    selectedSource != null &&
    SYNCABLE.has(selectedSource.type) &&
    !syncing

  function handleSelect(sourceId: string) {
    if (!isControlled) {
      setInternalSelectedId(sourceId)
    }
    onSelect?.(sourceId)
  }

  return (
    <aside
      data-region="data-source-sidebar"
      className={`flex h-full w-[220px] shrink-0 flex-col border-r border-outline-variant/30 bg-surface-container-low ${className}`}
      aria-label="Data sources"
    >
      {/* ── Header: title + quick filter ─────────────────────────────── */}
      <div className="shrink-0 border-b border-outline-variant/30 p-md">
        <div className="mb-sm flex items-center gap-sm">
          <span className="font-label text-[11px] font-bold tracking-widest text-on-surface-variant">
            SOURCES
          </span>
        </div>

        {/* Search / filter by name or type */}
        <label className="sr-only" htmlFor="source-filter">
          Filter data sources
        </label>
        <div className="flex items-center gap-sm rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-sm py-xs focus-within:border-primary-fixed">
          <span className="text-xs text-on-surface-variant" aria-hidden>
            ⌕
          </span>
          <input
            id="source-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter name / type…"
            className="min-w-0 flex-1 border-none bg-transparent font-body text-xs text-on-surface outline-none placeholder:text-on-surface-variant/60"
            autoComplete="off"
          />
        </div>
      </div>

      {/* ── Connection list ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between px-md pt-md pb-sm">
          <span className="font-label text-[11px] font-bold tracking-widest text-on-surface-variant">
            CONNECTIONS
          </span>
          <button
            type="button"
            onClick={onAddSource}
            className="font-label text-sm leading-none text-primary-fixed transition-opacity hover:opacity-80 disabled:cursor-default disabled:opacity-40"
            aria-label="Add data source"
            disabled={!onAddSource}
            title={onAddSource ? 'Add source' : 'Add source (wire later)'}
          >
            +
          </button>
        </div>

        <ul
          className="min-h-0 flex-1 space-y-sm overflow-y-auto px-md pb-md"
          role="listbox"
          aria-label="Connected data sources"
        >
          {filteredSources.length === 0 ? (
            <li className="rounded-xl border border-dashed border-sand/50 px-sm py-md text-center">
              <p className="font-body text-xs text-on-surface-variant">
                No sources match “{filter.trim()}”
              </p>
            </li>
          ) : (
            filteredSources.map((source) => (
              <DataSourceRow
                key={source.id}
                source={source}
                selected={source.id === activeId}
                onSelect={handleSelect}
              />
            ))
          )}
        </ul>
      </div>

      {/* ── Footer: Sync Schema for Postgres connections ─────────────── */}
      <div className="shrink-0 border-t border-outline-variant p-md">
        <button
          type="button"
          disabled={!canSync}
          onClick={() => {
            if (activeId && onSyncSource) void onSyncSource(activeId)
          }}
          className="flex w-full items-center justify-center gap-sm rounded-lg bg-primary-container py-md font-label text-[11px] font-bold tracking-widest text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            readOnlySync
              ? 'Read-only — sync requires member+'
              : selectedSource && SYNCABLE.has(selectedSource.type)
                ? 'Introspect schema into Que (Postgres / Excel / CSV / Mongo / Databricks)'
                : 'Select a syncable source to introspect'
          }
        >
          {syncing ? 'SYNCING…' : 'SYNC SCHEMA'}
        </button>
      </div>
    </aside>
  )
}

/* ─── Row subcomponent ─────────────────────────────────────────────────────── */

interface DataSourceRowProps {
  source: DataSource
  selected: boolean
  onSelect: (sourceId: string) => void
}

/**
 * Single connection row: status LED, type icon, name, type caption.
 * Selected = terracotta border + soft cream fill (Sunset Clay).
 */
function DataSourceRow({ source, selected, onSelect }: DataSourceRowProps) {
  const status = STATUS_DOT[source.status]

  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={() => onSelect(source.id)}
        className={[
          'group flex w-full items-start gap-sm rounded-xl border p-sm text-left transition-colors',
          selected
            ? 'border-primary bg-secondary-container border-l-4'
            : 'border-sand/40 bg-surface-container-lowest hover:border-primary-fixed',
          source.status === 'error' && !selected ? 'opacity-60' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Status color dot */}
        <span
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${status.className}`}
          title={status.label}
          aria-label={`Status: ${status.label}`}
        />

        {/* Type icon */}
        <span className="mt-0.5 shrink-0 text-on-surface-variant group-hover:text-primary-fixed">
          <SourceTypeIcon type={source.type} />
        </span>

        {/* Name + type */}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-body text-xs ${
              selected ? 'text-primary-fixed' : 'text-on-surface'
            }`}
          >
            {source.name}
          </span>
          <span className="mt-0.5 block truncate font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
            {sourceTypeLabel(source.type)}
          </span>
        </span>
      </button>
    </li>
  )
}

export default DataSourceSidebar
