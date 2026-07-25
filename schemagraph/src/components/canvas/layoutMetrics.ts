/**
 * Shared layout metrics for TableNode + RelationshipLayer.
 * Keep in sync so SVG anchors align with styled card geometry.
 */
export const TABLE_NODE_WIDTH = 256
export const SOURCE_HEADER_HEIGHT = 28
export const TABLE_TITLE_HEIGHT = 40
export const COLUMN_ROW_HEIGHT = 28
export const COLUMN_LIST_PADDING_Y = 12

/**
 * Snap grid size in world pixels.
 * Matches `.grid-bg` background-size (24px) for visual alignment.
 */
export const SNAP_GRID_SIZE = 24

/** Y offset from node top to the center of a column row (expanded only). */
export function columnAnchorY(columnIndex: number): number {
  return (
    SOURCE_HEADER_HEIGHT +
    TABLE_TITLE_HEIGHT +
    COLUMN_LIST_PADDING_Y +
    columnIndex * COLUMN_ROW_HEIGHT +
    COLUMN_ROW_HEIGHT / 2
  )
}

/** Y offset when collapsed — mid title bar (edges attach to card body). */
export function collapsedAnchorY(): number {
  return SOURCE_HEADER_HEIGHT + TABLE_TITLE_HEIGHT / 2
}

/** Snap a world-space point to the diagram grid. */
export function snapToGrid(
  x: number,
  y: number,
  gridSize: number = SNAP_GRID_SIZE,
): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  }
}
