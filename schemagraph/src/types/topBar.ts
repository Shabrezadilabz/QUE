import type { DataSourceType } from '@/types/dataSource'
import type { RelationshipLineType } from '@/types/schema'

/** Relationship filter dropdown values */
export type RelationshipFilterType = 'all' | RelationshipLineType

/** Source type filter — 'all' or a concrete connector */
export type SourceTypeFilter = 'all' | DataSourceType

/** Export button formats */
export type ExportFormat = 'pdf' | 'png' | 'json'

/**
 * Active diagram filters driven by the TopBar.
 * Applied by MainCanvas / layout to compute visible counts + highlights.
 */
export interface DiagramFilters {
  /** Case-insensitive match against table / column names */
  searchQuery: string
  relationshipType: RelationshipFilterType
  /** Minimum relationship confidence (0–1). 0 = no filter. */
  minConfidence: number
  sourceType: SourceTypeFilter
}

export const DEFAULT_DIAGRAM_FILTERS: DiagramFilters = {
  searchQuery: '',
  relationshipType: 'all',
  minConfidence: 0,
  sourceType: 'all',
}

/**
 * Props for the workspace TopBar.
 * Action handlers are optional — omit to keep buttons inert / console stub.
 */
export interface TopBarProps {
  /** Count of tables currently visible after filters */
  visibleTableCount: number
  /** Count of relationships currently visible after filters */
  visibleRelationshipCount: number
  /** Controlled search string (table / column name) */
  searchQuery?: string
  /** Controlled filter bag */
  filters?: DiagramFilters
  /** Real-time search — parent highlights matching nodes */
  onSearchChange?: (query: string) => void
  /** Fired when any filter control changes */
  onFiltersChange?: (next: DiagramFilters) => void
  /** Export diagram as PDF / PNG / JSON */
  onExport?: (format: ExportFormat) => void
  className?: string
}
