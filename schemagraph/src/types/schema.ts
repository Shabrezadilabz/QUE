/**
 * Schema diagram domain types (tables, columns, relationships).
 * Keep stable for API integration later.
 */

import type { DataSourceType } from '@/types/dataSource'

export interface TablePosition {
  x: number
  y: number
}

export type ColumnKeyKind = 'pk' | 'fk' | 'unique' | 'index' | 'none'

/**
 * Column definition shown inside an expandable TableNode.
 * `sampleValues` / `description` power the hover tooltip.
 */
export interface SchemaColumn {
  id: string
  name: string
  /** SQL / document type label (UUID, VARCHAR, OBJECTID, …) */
  dataType: string
  keyKind?: ColumnKeyKind
  nullable?: boolean
  /** Short description for tooltip */
  description?: string
  /** Placeholder sample values for tooltip (replace with live profiling later) */
  sampleValues?: string[]
  /** Referenced table.column when keyKind is fk */
  references?: string
}

export interface SchemaTable {
  id: string
  /** Display table / collection name */
  name: string
  /** Owning connection id (links to DataSourceSidebar) */
  sourceId: string
  /** Connector type — drives source icon on the card */
  sourceType: DataSourceType
  /** Source system label shown on card header (POSTGRESQL, MONGODB, …) */
  sourceLabel: string
  /** Entity kind badge */
  entityKind?: 'TABLE' | 'COLLECTION' | 'VIEW'
  position: TablePosition
  columns: SchemaColumn[]
  /** Start expanded when first rendered (user can still toggle) */
  defaultExpanded?: boolean
}

export type RelationshipKind = 'fk' | 'ref' | 'inferred'

/**
 * Visual / semantic relationship line types for RelationshipLine styling.
 * - explicit: declared FK / join (solid lime)
 * - ai-inferred: model-suggested link (dashed amber)
 */
export type RelationshipLineType = 'explicit' | 'ai-inferred'

export interface SchemaRelationship {
  id: string
  fromTableId: string
  fromColumnId: string
  toTableId: string
  toColumnId: string
  /**
   * Legacy kind — mapped to RelationshipLineType when `type` is omitted:
   * fk/ref → explicit, inferred → ai-inferred
   */
  kind?: RelationshipKind
  /** Preferred line classification for styling */
  type?: RelationshipLineType
  /** Review workflow — suggested AI edges can be promoted/rejected */
  status?: 'suggested' | 'accepted' | 'rejected'
  /** Model confidence 0–1 (tooltip + stroke emphasis) */
  confidence?: number
  /** Endpoint ids (typically column ids) — aliases for fromColumnId / toColumnId */
  fromId?: string
  toId?: string
  /** Human-readable join predicate for tooltip */
  joinCriteria?: string
  /** Optional short label */
  label?: string
  /** Extra note for AI-inferred edges */
  aiNotes?: string
  /** Explainable confidence signals from Que scoring */
  evidence?: {
    summary?: string
    signals?: { code: string; label: string; weight: number }[]
    scoredAt?: string
  }
}

/** Actions bubbled from MainCanvas for parent / sidebar orchestration */
export type DiagramActionType =
  | 'pan'
  | 'zoom'
  | 'node-move'
  | 'expand'
  | 'collapse'
  | 'auto-layout'
  | 'background-click'

export interface DiagramAction {
  type: DiagramActionType
  tableId?: string
  columnId?: string
  position?: TablePosition
  viewport?: { x: number; y: number; zoom: number }
}
