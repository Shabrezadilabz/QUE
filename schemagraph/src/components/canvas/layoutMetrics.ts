/**
 * Shared layout metrics for TableNode + RelationshipLayer.
 * Keep in sync so SVG anchors align with styled card geometry.
 *
 * Sunset Clay nodes: single rounded header + column list (no dual chrome bars).
 */
export const TABLE_NODE_WIDTH = 256
/** Combined header (icon + table name) — matches mock ~48px */
export const TABLE_NODE_HEADER_HEIGHT = 48
/** @deprecated use TABLE_NODE_HEADER_HEIGHT — kept for anchor math compatibility */
export const SOURCE_HEADER_HEIGHT = TABLE_NODE_HEADER_HEIGHT
export const TABLE_TITLE_HEIGHT = 0
export const COLUMN_ROW_HEIGHT = 32
export const COLUMN_LIST_PADDING_Y = 8

/**
 * Snap grid size in world pixels.
 * Matches `.grid-bg` background-size (24px) for visual alignment.
 */
export const SNAP_GRID_SIZE = 24

/** Y offset from node top to the center of a column row (expanded only). */
export function columnAnchorY(columnIndex: number): number {
  return (
    TABLE_NODE_HEADER_HEIGHT +
    COLUMN_LIST_PADDING_Y +
    columnIndex * COLUMN_ROW_HEIGHT +
    COLUMN_ROW_HEIGHT / 2
  )
}

/** Y offset when collapsed — mid header. */
export function collapsedAnchorY(): number {
  return TABLE_NODE_HEADER_HEIGHT / 2
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
