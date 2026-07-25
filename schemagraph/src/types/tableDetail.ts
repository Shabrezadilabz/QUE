import type { SchemaColumn, SchemaTable } from '@/types/schema'

/**
 * Detail payload for the right inspector.
 * Extends diagram SchemaTable with stats + optional sample grid rows.
 */
export interface TableDetailStats {
  rowCount?: number
  storageLabel?: string
  description?: string
}

/** One preview row keyed by column name */
export type SampleDataRow = Record<string, string | number | boolean | null>

export type RightSidebarStatus = 'idle' | 'loading' | 'ready' | 'error' | 'empty'

/**
 * Props for the table-detail right rail.
 * Pass `table` when a node is selected; omit / null for empty state.
 */
export interface TableDetailProps {
  /** Selected table schema (null → empty state) */
  table: SchemaTable | null
  /** Highlighted column id from canvas selection */
  selectedColumnId?: string | null
  /** Async status — loading spinner / error banner */
  status?: RightSidebarStatus
  /** Error message when status === 'error' */
  errorMessage?: string
  /** Optional stats overlay (row count, storage, blurb) */
  stats?: TableDetailStats
  /**
   * Sample grid rows. When omitted, rows are synthesized from
   * column.sampleValues (dummy API fallback).
   */
  sampleRows?: SampleDataRow[]
  /** Close / dismiss inspector */
  onClose?: () => void
  onAddToJob?: (tableId: string) => void
  onPreviewData?: (tableId: string) => void
  onShowLineage?: (tableId: string) => void
  onSelectColumn?: (columnId: string) => void
  className?: string
}

/** Flatten columns for schema list rendering */
export type TableDetailColumn = SchemaColumn
