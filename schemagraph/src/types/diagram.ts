/**
 * Shared diagram domain types.
 */

import type { ReactNode } from 'react'
import type { DataSource, DataSourceStatus } from '@/types/dataSource'
import type { SchemaRelationship, SchemaTable } from '@/types/schema'

/** @deprecated Prefer DataSourceStatus from types/dataSource */
export type ConnectionStatus = DataSourceStatus | 'idle' | 'disconnected'

export interface DataConnection {
  id: string
  name: string
  status: ConnectionStatus
  sourceType?: string
}

export interface DiagramSelection {
  tableId: string | null
  columnId: string | null
  connectionId: string | null
}

export interface DiagramViewport {
  x: number
  y: number
  zoom: number
}

/** Extensible layout props for MainDiagramLayout slots */
export interface MainDiagramLayoutSlots {
  topBar?: ReactNode
  leftSidebar?: ReactNode
  mainCanvas?: ReactNode
  rightSidebar?: ReactNode
  miniMap?: ReactNode
}

export interface MainDiagramLayoutProps extends MainDiagramLayoutSlots {
  className?: string
  /** When false, right detail panel is collapsed */
  showRightSidebar?: boolean
  /** Workspace graph (from API or dummy fallback) */
  tables?: SchemaTable[]
  relationships?: SchemaRelationship[]
  sources?: DataSource[]
  /** True when data came from stitch-api */
  fromApi?: boolean
  /** When true, disable drag / auto-layout / layout save */
  readOnly?: boolean
  onPromoteRelationship?: (relationshipId: string) => void | Promise<void>
  onRejectRelationship?: (relationshipId: string) => void | Promise<void>
  onSyncSource?: (sourceId: string) => void | Promise<void>
  /** Canvas → stitch job one-click */
  onCreateStitchJob?: (tableNames: string[]) => void | Promise<void>
  /** Open two-source stitch session from canvas top-right */
  onOpenStitchSession?: () => void
  stitchSessionLabel?: string
  syncing?: boolean
  /** Offline / demo banner */
  statusBanner?: string | null
  onDismissBanner?: () => void
}
