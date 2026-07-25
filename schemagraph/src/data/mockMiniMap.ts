import type { SchemaRelationship, SchemaTable } from '@/types/schema'
import { DUMMY_RELATIONSHIPS, DUMMY_TABLES } from '@/data/dummySchema'

/**
 * Visible MainCanvas window in **world** coordinates
 * (pre-transform space where TableNode.position lives).
 */
export interface ViewportRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Mock payload for isolated MiniMap demos / tests.
 * Mirrors live MainCanvas data shape.
 */
export const MOCK_MINIMAP_TABLES: SchemaTable[] = DUMMY_TABLES

export const MOCK_MINIMAP_RELATIONSHIPS: SchemaRelationship[] =
  DUMMY_RELATIONSHIPS

/** Sample viewport covering the upper-left cluster of mock tables. */
export const MOCK_MINIMAP_VIEWPORT: ViewportRect = {
  x: 40,
  y: 20,
  width: 720,
  height: 420,
}

export interface MiniMapMockBundle {
  tables: SchemaTable[]
  relationships: SchemaRelationship[]
  viewportRect: ViewportRect
}

export const MOCK_MINIMAP_DATA: MiniMapMockBundle = {
  tables: MOCK_MINIMAP_TABLES,
  relationships: MOCK_MINIMAP_RELATIONSHIPS,
  viewportRect: MOCK_MINIMAP_VIEWPORT,
}
