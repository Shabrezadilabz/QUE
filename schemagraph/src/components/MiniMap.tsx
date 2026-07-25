import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { SchemaRelationship, SchemaTable } from '@/types/schema'
import {
  COLUMN_LIST_PADDING_Y,
  COLUMN_ROW_HEIGHT,
  SOURCE_HEADER_HEIGHT,
  TABLE_NODE_WIDTH,
  TABLE_TITLE_HEIGHT,
  collapsedAnchorY,
  columnAnchorY,
} from '@/components/canvas/layoutMetrics'
import {
  MOCK_MINIMAP_DATA,
  type ViewportRect,
} from '@/data/mockMiniMap'

/* ─────────────────────────────────────────────────────────────────────────────
 * MiniMap
 *
 * Scaled overview of MainCanvas (bottom-right overlay).
 * - TableNodes → muted rects
 * - RelationshipLines → thin elbows
 * - viewportRect → draggable frame (click/drag pans the main view)
 *
 * Min size 200×120; grows slightly on wide canvases via CSS min/max.
 * ─────────────────────────────────────────────────────────────────────────── */

export type { ViewportRect }

export interface MiniMapProps {
  tables: SchemaTable[]
  relationships: SchemaRelationship[]
  /** Visible MainCanvas window in world coordinates */
  viewportRect: ViewportRect
  /** Fired when user pans via click or viewport drag */
  onViewportChange?: (next: ViewportRect) => void
  className?: string
  /** Outer frame width (min enforced at 200) */
  width?: number
  /** Outer frame height (min enforced at 120) */
  height?: number
}

const MIN_W = 200
const MIN_H = 120
const PAD = 48

/** Approximate card height for overview bounds (expanded = all columns). */
function estimateTableHeight(table: SchemaTable, expanded = true): number {
  if (!expanded) {
    return SOURCE_HEADER_HEIGHT + TABLE_TITLE_HEIGHT + 36
  }
  return (
    SOURCE_HEADER_HEIGHT +
    TABLE_TITLE_HEIGHT +
    COLUMN_LIST_PADDING_Y * 2 +
    table.columns.length * COLUMN_ROW_HEIGHT
  )
}

interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

function computeContentBounds(tables: SchemaTable[]): WorldBounds {
  if (tables.length === 0) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const t of tables) {
    const h = estimateTableHeight(t, true)
    minX = Math.min(minX, t.position.x)
    minY = Math.min(minY, t.position.y)
    maxX = Math.max(maxX, t.position.x + TABLE_NODE_WIDTH)
    maxY = Math.max(maxY, t.position.y + h)
  }

  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  }
}

function tableAnchor(
  table: SchemaTable,
  columnId: string,
  side: 'left' | 'right',
): { x: number; y: number } {
  const idx = table.columns.findIndex((c) => c.id === columnId)
  const yOff = idx >= 0 ? columnAnchorY(idx) : collapsedAnchorY()
  return {
    x: side === 'right' ? table.position.x + TABLE_NODE_WIDTH : table.position.x,
    y: table.position.y + yOff,
  }
}

/**
 * Bottom-right navigation overview for the schema diagram.
 */
export function MiniMap({
  tables,
  relationships,
  viewportRect,
  onViewportChange,
  className = '',
  width = 220,
  height = 140,
}: MiniMapProps) {
  const frameW = Math.max(MIN_W, width)
  const frameH = Math.max(MIN_H, height)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    startClientX: number
    startClientY: number
    origin: ViewportRect
  } | null>(null)
  const [dragging, setDragging] = useState(false)

  const bounds = useMemo(() => computeContentBounds(tables), [tables])
  const scale = useMemo(
    () =>
      Math.min(
        (frameW - 8) / bounds.width,
        (frameH - 8) / bounds.height,
      ),
    [bounds, frameW, frameH],
  )

  const toMini = useCallback(
    (wx: number, wy: number) => ({
      x: (wx - bounds.minX) * scale + 4,
      y: (wy - bounds.minY) * scale + 4,
    }),
    [bounds.minX, bounds.minY, scale],
  )

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { x: bounds.minX, y: bounds.minY }
      const rect = svg.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top
      return {
        x: bounds.minX + (mx - 4) / scale,
        y: bounds.minY + (my - 4) / scale,
      }
    },
    [bounds.minX, bounds.minY, scale],
  )

  const vpMini = useMemo(() => {
    const tl = toMini(viewportRect.x, viewportRect.y)
    return {
      x: tl.x,
      y: tl.y,
      w: viewportRect.width * scale,
      h: viewportRect.height * scale,
    }
  }, [viewportRect, toMini, scale])

  const moveViewportTo = useCallback(
    (next: ViewportRect) => {
      onViewportChange?.(next)
    },
    [onViewportChange],
  )

  /** Click empty minimap → center viewport on that world point */
  const onBackgroundPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const world = clientToWorld(e.clientX, e.clientY)
    moveViewportTo({
      ...viewportRect,
      x: world.x - viewportRect.width / 2,
      y: world.y - viewportRect.height / 2,
    })
  }

  const onViewportPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      origin: { ...viewportRect },
    }
    setDragging(true)

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (ev.clientX - drag.startClientX) / scale
      const dy = (ev.clientY - drag.startClientY) / scale
      moveViewportTo({
        ...drag.origin,
        x: drag.origin.x + dx,
        y: drag.origin.y + dy,
      })
    }

    const onUp = () => {
      dragRef.current = null
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const byId = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables])

  return (
    <div
      data-region="mini-map"
      className={`absolute bottom-md right-md z-20 overflow-hidden border border-[#2a2a2a] bg-[#0e0e0e]/70 backdrop-blur-[2px] ${className}`}
      style={{
        width: frameW,
        height: frameH,
        minWidth: MIN_W,
        minHeight: MIN_H,
      }}
      aria-label="Diagram minimap"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <svg
        ref={svgRef}
        width={frameW}
        height={frameH}
        className="block"
        role="img"
        aria-label="Scaled overview of schema tables and relationships"
      >
        {/* Clickable backdrop */}
        <rect
          x={0}
          y={0}
          width={frameW}
          height={frameH}
          fill="#0e0e0e"
          fillOpacity={0.85}
          onPointerDown={onBackgroundPointerDown}
          style={{ cursor: 'crosshair' }}
        />

        {/* Relationship elbows (muted) */}
        {relationships.map((rel) => {
          const fromTable = byId.get(rel.fromTableId)
          const toTable = byId.get(rel.toTableId)
          if (!fromTable || !toTable) return null

          const fromOnRight = fromTable.position.x <= toTable.position.x
          const from = tableAnchor(
            fromTable,
            rel.fromColumnId,
            fromOnRight ? 'right' : 'left',
          )
          const to = tableAnchor(
            toTable,
            rel.toColumnId,
            fromOnRight ? 'left' : 'right',
          )
          const a = toMini(from.x, from.y)
          const b = toMini(to.x, to.y)
          const midX = (a.x + b.x) / 2
          const inferred =
            rel.type === 'ai-inferred' || rel.kind === 'inferred'

          return (
            <path
              key={rel.id}
              d={`M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`}
              fill="none"
              stroke={inferred ? '#5a5340' : '#3a3f2e'}
              strokeWidth={1}
              strokeDasharray={inferred ? '3 2' : undefined}
              pointerEvents="none"
            />
          )
        })}

        {/* Table node thumbs */}
        {tables.map((t) => {
          const p = toMini(t.position.x, t.position.y)
          const w = TABLE_NODE_WIDTH * scale
          const h = estimateTableHeight(t, true) * scale
          return (
            <g key={t.id} pointerEvents="none">
              <rect
                x={p.x}
                y={p.y}
                width={Math.max(w, 4)}
                height={Math.max(h, 4)}
                fill="#1b1b1b"
                stroke="#444933"
                strokeWidth={1}
              />
              {/* Source header strip */}
              <rect
                x={p.x}
                y={p.y}
                width={Math.max(w, 4)}
                height={Math.max(SOURCE_HEADER_HEIGHT * scale, 2)}
                fill="#2a2a2a"
              />
            </g>
          )
        })}

        {/* Current viewport — draggable */}
        <rect
          x={vpMini.x}
          y={vpMini.y}
          width={Math.max(vpMini.w, 12)}
          height={Math.max(vpMini.h, 10)}
          fill="rgba(195, 244, 0, 0.08)"
          stroke="#8e9379"
          strokeWidth={dragging ? 2 : 1.5}
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
          onPointerDown={onViewportPointerDown}
          aria-label="Visible canvas region. Drag to pan."
        />
      </svg>

      <div className="pointer-events-none absolute bottom-xs right-xs font-label text-[9px] tracking-widest text-[#5c6148]">
        MINIMAP
      </div>
    </div>
  )
}

/** Demo helper — MiniMap preloaded with mock schema + viewport */
export function MiniMapDemo(props: Partial<MiniMapProps> = {}) {
  const [viewportRect, setViewportRect] = useState(
    props.viewportRect ?? MOCK_MINIMAP_DATA.viewportRect,
  )

  return (
    <div className="relative h-[160px] w-[240px] bg-background">
      <MiniMap
        tables={props.tables ?? MOCK_MINIMAP_DATA.tables}
        relationships={
          props.relationships ?? MOCK_MINIMAP_DATA.relationships
        }
        viewportRect={viewportRect}
        onViewportChange={setViewportRect}
        {...props}
      />
    </div>
  )
}

export default MiniMap
