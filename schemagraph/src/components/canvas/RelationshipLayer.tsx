import type { SchemaRelationship, SchemaTable } from '@/types/schema'
import {
  TABLE_NODE_WIDTH,
  collapsedAnchorY,
  columnAnchorY,
} from '@/components/canvas/layoutMetrics'
import {
  RelationshipLine,
  toRelationshipLineModel,
  type RelationshipHoverEvent,
} from '@/components/canvas/RelationshipLine'

/* ─────────────────────────────────────────────────────────────────────────────
 * RelationshipLayer
 * Computes column anchors from table layout metrics, then renders one
 * RelationshipLine per edge. Styling rules live in RelationshipLine.
 * ─────────────────────────────────────────────────────────────────────────── */

interface AnchorPoint {
  x: number
  y: number
}

interface RelationshipLayerProps {
  tables: SchemaTable[]
  relationships: SchemaRelationship[]
  /** tableId → expanded */
  expandedMap: Record<string, boolean>
  selectedTableId: string | null
  onSelectRelationship?: (relationshipId: string) => void
  /** Bubbled analytics for relationship tooltip hover / keyboard */
  onRelationshipHover?: (event: RelationshipHoverEvent) => void
  onPromoteRelationship?: (relationshipId: string) => void | Promise<void>
  onRejectRelationship?: (relationshipId: string) => void | Promise<void>
  editMode?: boolean
  onEndpointPointerDown?: (
    e: React.MouseEvent,
    relationshipId: string,
    end: 'from' | 'to',
  ) => void
}

function findColumnIndex(table: SchemaTable, columnId: string): number {
  return table.columns.findIndex((c) => c.id === columnId)
}

function resolveAnchor(
  table: SchemaTable,
  columnId: string,
  expanded: boolean,
  preferSide: 'left' | 'right',
): AnchorPoint {
  const colIndex = findColumnIndex(table, columnId)
  const y =
    expanded && colIndex >= 0 ? columnAnchorY(colIndex) : collapsedAnchorY()

  if (preferSide === 'right') {
    return { x: table.position.x + TABLE_NODE_WIDTH, y: table.position.y + y }
  }
  return { x: table.position.x, y: table.position.y + y }
}

export function RelationshipLayer({
  tables,
  relationships,
  expandedMap,
  selectedTableId,
  onSelectRelationship,
  onRelationshipHover,
  onPromoteRelationship,
  onRejectRelationship,
  editMode = false,
  onEndpointPointerDown,
}: RelationshipLayerProps) {
  const byId = new Map(tables.map((t) => [t.id, t]))

  return (
    <svg
      data-region="relationship-layer"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        // Layer itself does not capture; individual lines use pointer-events: stroke
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* Re-enable events on the edge group children */}
      <g style={{ pointerEvents: 'auto' }}>
        {relationships.map((rel) => {
          const fromTable = byId.get(rel.fromTableId)
          const toTable = byId.get(rel.toTableId)
          if (!fromTable || !toTable) return null

          const fromOnRight = fromTable.position.x <= toTable.position.x
          const from = resolveAnchor(
            fromTable,
            rel.fromColumnId,
            expandedMap[fromTable.id] ?? true,
            fromOnRight ? 'right' : 'left',
          )
          const to = resolveAnchor(
            toTable,
            rel.toColumnId,
            expandedMap[toTable.id] ?? true,
            fromOnRight ? 'left' : 'right',
          )

          const involved =
            selectedTableId === rel.fromTableId ||
            selectedTableId === rel.toTableId
          const muted = Boolean(selectedTableId) && !involved

          return (
            <RelationshipLine
              key={rel.id}
              fromX={from.x}
              fromY={from.y}
              toX={to.x}
              toY={to.y}
              relationship={toRelationshipLineModel(rel)}
              emphasized={involved}
              muted={muted}
              onSelect={onSelectRelationship}
              onRelationshipHover={onRelationshipHover}
              onPromote={onPromoteRelationship}
              onReject={onRejectRelationship}
              editMode={editMode}
              onEndpointPointerDown={onEndpointPointerDown}
            />
          )
        })}
      </g>
    </svg>
  )
}
