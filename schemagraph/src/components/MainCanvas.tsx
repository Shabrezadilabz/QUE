import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react'
import type {
  DiagramAction,
  SchemaRelationship,
  SchemaTable,
  TablePosition,
} from '@/types/schema'
import { DUMMY_RELATIONSHIPS, DUMMY_TABLES } from '@/data/dummySchema'
import { TableNode } from '@/components/canvas/TableNode'
import { RelationshipLayer } from '@/components/canvas/RelationshipLayer'
import type { RelationshipHoverEvent } from '@/components/canvas/RelationshipLine'
import { MiniMap, type ViewportRect } from '@/components/MiniMap'
import type { DiagramFilters } from '@/types/topBar'
import { DEFAULT_DIAGRAM_FILTERS } from '@/types/topBar'
import { filterDiagramData } from '@/utils/filterDiagram'
import { useDiagram } from '@/context/DiagramContext'
import { useTableNodeDrag } from '@/hooks/useTableNodeDrag'
import type { DragPhase } from '@/hooks/useTableNodeDrag'
import { saveWorkspaceLayout } from '@/services/stitchApi'
import { useToast } from '@/context/ToastContext'

/* ─────────────────────────────────────────────────────────────────────────────
 * MainCanvas
 *
 * Structure (z-order bottom → top):
 *  ┌─ main.grid-bg (fills remaining layout space) ─────────────────────────┐
 *  │  [toolbar] zoom / snap / auto-layout                                  │
 *  │  ┌─ world transform (pan + zoom) ───────────────────────────────────┐ │
 *  │  │  RelationshipLayer (SVG edges — re-render on position store)     │ │
 *  │  │  TableNode[] (drag handle → useTableNodeDrag)                    │ │
 *  │  └──────────────────────────────────────────────────────────────────┘ │
 *  │  [miniMap slot]                                                       │
 *  └───────────────────────────────────────────────────────────────────────┘
 *
 * DRAG LOGIC:        hooks/useTableNodeDrag.ts
 * POSITION UPDATES:  DiagramContext.setTablePosition (store)
 * ─────────────────────────────────────────────────────────────────────────── */

export interface MainCanvasProps {
  tables?: SchemaTable[]
  relationships?: SchemaRelationship[]
  /** Controlled selected table (falls back to internal state). */
  selectedTableId?: string | null
  selectedColumnId?: string | null
  onTableSelect?: (tableId: string | null) => void
  onColumnSelect?: (tableId: string, columnId: string) => void
  onDiagramAction?: (action: DiagramAction) => void
  /** TopBar filters — drives visible nodes/edges + search highlight */
  filters?: DiagramFilters
  /** Analytics when a relationship tooltip opens/closes */
  onRelationshipHover?: (event: RelationshipHoverEvent) => void
  onPromoteRelationship?: (relationshipId: string) => void | Promise<void>
  onRejectRelationship?: (relationshipId: string) => void | Promise<void>
  /** Disable drag / auto-layout / layout persist (viewers) */
  readOnly?: boolean
  /** Optional overlay (MiniMap). */
  miniMap?: ReactNode
  className?: string
}

type PanDrag = {
  kind: 'pan'
  startX: number
  startY: number
  originX: number
  originY: number
}

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

function buildExpandedMap(tables: SchemaTable[]): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  for (const t of tables) {
    map[t.id] = t.defaultExpanded ?? true
  }
  return map
}

/**
 * Central schema diagram surface — fills parent, hosts nodes + SVG edges.
 */
export function MainCanvas({
  tables: tablesProp,
  relationships = DUMMY_RELATIONSHIPS,
  selectedTableId: selectedTableIdProp,
  selectedColumnId: selectedColumnIdProp,
  onTableSelect,
  onColumnSelect,
  onDiagramAction,
  filters = DEFAULT_DIAGRAM_FILTERS,
  onRelationshipHover,
  onPromoteRelationship,
  onRejectRelationship,
  readOnly = false,
  miniMap,
  className = '',
}: MainCanvasProps) {
  const initialTables = tablesProp ?? DUMMY_TABLES
  const { pushToast } = useToast()

  const {
    tablePositions,
    setTablePosition,
    setTablePositions,
    snapToGridEnabled,
    setSnapToGridEnabled,
    selection,
  } = useDiagram()

  /** Schema payload without relying on embedded positions for drag. */
  const [tablesBase, setTablesBase] = useState<SchemaTable[]>(initialTables)
  const [expandedMap, setExpandedMap] = useState(() =>
    buildExpandedMap(initialTables),
  )
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  /** Hand tool — grab-drag pans the screen (Space holds temporary hand) */
  const [handTool, setHandTool] = useState(true)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [internalTableId, setInternalTableId] = useState<string | null>(null)
  const [internalColumnId, setInternalColumnId] = useState<string | null>(null)

  /** Merge context position store onto table records for render + SVG edges */
  const tables = useMemo(
    () =>
      tablesBase.map((t) => ({
        ...t,
        position: tablePositions[t.id] ?? t.position,
      })),
    [tablesBase, tablePositions],
  )

  const panDragRef = useRef<PanDrag | null>(null)
  const didPanRef = useRef(false)
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const canvasRef = useRef<HTMLElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 640 })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const sync = () => {
      const r = el.getBoundingClientRect()
      setCanvasSize({
        width: Math.max(r.width, 1),
        height: Math.max(r.height, 1),
      })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** World-space rectangle currently visible through the pan/zoom transform */
  const viewportRect: ViewportRect = useMemo(
    () => ({
      x: -viewport.x / viewport.zoom,
      y: -viewport.y / viewport.zoom,
      width: canvasSize.width / viewport.zoom,
      height: canvasSize.height / viewport.zoom,
    }),
    [viewport, canvasSize],
  )

  const tableSelectedControlled = selectedTableIdProp !== undefined
  const columnSelectedControlled = selectedColumnIdProp !== undefined
  const selectedTableId = tableSelectedControlled
    ? selectedTableIdProp
    : internalTableId
  const selectedColumnId = columnSelectedControlled
    ? selectedColumnIdProp
    : internalColumnId

  // Re-seed schema when parent swaps tables[]; keep existing drag positions
  useEffect(() => {
    if (!tablesProp) return
    setTablesBase(tablesProp)
    setExpandedMap((prev) => {
      const next = { ...prev }
      for (const t of tablesProp) {
        if (next[t.id] === undefined) next[t.id] = t.defaultExpanded ?? true
      }
      return next
    })
    const next: Record<string, TablePosition> = {}
    for (const t of tablesProp) {
      next[t.id] = tablePositions[t.id] ?? { ...t.position }
    }
    setTablePositions(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- merge on tablesProp identity only
  }, [tablesProp, setTablePositions])

  const emitAction = useCallback(
    (action: DiagramAction) => {
      onDiagramAction?.(action)
    },
    [onDiagramAction],
  )

  const onMiniMapViewportChange = useCallback(
    (next: ViewportRect) => {
      const zoom = viewportRef.current.zoom
      const pan = {
        x: -next.x * zoom,
        y: -next.y * zoom,
        zoom,
      }
      setViewport(pan)
      emitAction({ type: 'pan', viewport: pan })
    },
    [emitAction],
  )

  const selectTable = useCallback(
    (tableId: string | null) => {
      if (!tableSelectedControlled) setInternalTableId(tableId)
      if (tableId === null && !columnSelectedControlled) {
        setInternalColumnId(null)
      }
      onTableSelect?.(tableId)
    },
    [tableSelectedControlled, columnSelectedControlled, onTableSelect],
  )

  const selectColumn = useCallback(
    (tableId: string, columnId: string) => {
      if (!columnSelectedControlled) setInternalColumnId(columnId)
      onColumnSelect?.(tableId, columnId)
    },
    [columnSelectedControlled, onColumnSelect],
  )

  const toggleExpand = useCallback(
    (tableId: string, expanded?: boolean) => {
      setExpandedMap((prev) => {
        const nextOpen =
          typeof expanded === 'boolean' ? expanded : !(prev[tableId] ?? true)
        emitAction({
          type: nextOpen ? 'expand' : 'collapse',
          tableId,
        })
        return { ...prev, [tableId]: nextOpen }
      })
    },
    [emitAction],
  )

  /* ── TableNode drag (mouse + touch) — see hooks/useTableNodeDrag.ts ───── */

  const handlePositionChange = useCallback(
    (tableId: string, position: TablePosition, phase: DragPhase) => {
      if (readOnly) return
      setTablePosition(tableId, position)
      if (phase === 'start') {
        selectTable(tableId)
      }
      if (phase === 'move' || phase === 'end') {
        emitAction({ type: 'node-move', tableId, position })
      }
      if (phase === 'end') {
        const next = { ...tablePositions, [tableId]: position }
        void saveWorkspaceLayout(next).then((ok) => {
          if (!ok) {
            pushToast('Could not save layout', 'error')
          }
        })
      }
    },
    [
      setTablePosition,
      selectTable,
      emitAction,
      tablePositions,
      readOnly,
      pushToast,
    ],
  )

  const getZoom = useCallback(() => viewportRef.current.zoom, [])
  const getPosition = useCallback(
    (tableId: string) => tablePositions[tableId] ?? null,
    [tablePositions],
  )

  const { beginDrag, draggingTableId } = useTableNodeDrag({
    getZoom,
    getPosition,
    onPositionChange: handlePositionChange,
    snapToGrid: snapToGridEnabled,
  })

  /* ── Canvas pan (hand tool / Space / middle-mouse / background) ───────── */

  const panModeActive = handTool || spaceHeld
  const spaceHeldRef = useRef(spaceHeld)
  spaceHeldRef.current = spaceHeld
  const handToolRef = useRef(handTool)
  handToolRef.current = handTool

  const onPanMove = useCallback(
    (e: PointerEvent) => {
      const drag = panDragRef.current
      if (!drag) return
      if (
        Math.abs(e.clientX - drag.startX) > 3 ||
        Math.abs(e.clientY - drag.startY) > 3
      ) {
        didPanRef.current = true
      }
      const next = {
        ...viewportRef.current,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      }
      setViewport(next)
      emitAction({ type: 'pan', viewport: next })
    },
    [emitAction],
  )

  const endPan = useCallback(() => {
    panDragRef.current = null
    setIsPanning(false)
    window.removeEventListener('pointermove', onPanMove)
    window.removeEventListener('pointerup', endPan)
    window.removeEventListener('pointercancel', endPan)
  }, [onPanMove])

  const beginPan = useCallback(
    (e: ReactPointerEvent, force = false) => {
      if (draggingTableId) return
      const middle = e.pointerType === 'mouse' && e.button === 1
      const left = e.pointerType === 'mouse' && e.button === 0
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen'
      const wantPan =
        force ||
        middle ||
        ((left || touch) &&
          (handToolRef.current || spaceHeldRef.current || e.target === e.currentTarget))

      if (!wantPan) return
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return

      e.preventDefault()
      e.stopPropagation()
      didPanRef.current = false
      setIsPanning(true)
      panDragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        originX: viewportRef.current.x,
        originY: viewportRef.current.y,
      }
      window.addEventListener('pointermove', onPanMove)
      window.addEventListener('pointerup', endPan)
      window.addEventListener('pointercancel', endPan)
    },
    [onPanMove, endPan, draggingTableId],
  )

  // Space = temporary hand tool (Figma-style)
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable
      )
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      setSpaceHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      setSpaceHeld(false)
    }
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPanMove)
      window.removeEventListener('pointerup', endPan)
      window.removeEventListener('pointercancel', endPan)
    }
  }, [onPanMove, endPan])

  /* ── Zoom + trackpad pan ──────────────────────────────────────────────── */

  const setZoom = useCallback(
    (nextZoom: number) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
      const next = { ...viewportRef.current, zoom }
      setViewport(next)
      emitAction({ type: 'zoom', viewport: next })
    },
    [emitAction],
  )

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      // Ctrl/Meta + wheel → zoom; plain wheel / trackpad → pan screen
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        setZoom(viewportRef.current.zoom + delta)
        return
      }
      const next = {
        ...viewportRef.current,
        x: viewportRef.current.x - e.deltaX,
        y: viewportRef.current.y - e.deltaY,
      }
      setViewport(next)
      emitAction({ type: 'pan', viewport: next })
    },
    [setZoom, emitAction],
  )

  const autoLayout = useCallback(() => {
    if (readOnly) {
      pushToast('Read-only — layout requires member+', 'error')
      return
    }
    const nextPositions: Record<string, TablePosition> = {}
    tablesBase.forEach((t, i) => {
      nextPositions[t.id] = {
        x: 80 + (i % 3) * 360,
        y: 80 + Math.floor(i / 3) * 280,
      }
    })
    setTablePositions(nextPositions)
    setViewport({ x: 0, y: 0, zoom: 1 })
    emitAction({ type: 'auto-layout', viewport: { x: 0, y: 0, zoom: 1 } })
    void saveWorkspaceLayout(nextPositions).then((ok) => {
      if (!ok) pushToast('Could not save layout', 'error')
    })
  }, [tablesBase, setTablePositions, emitAction, readOnly, pushToast])

  const worldStyle = useMemo(
    () => ({
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      transformOrigin: '0 0',
      width: '100%',
      height: '100%',
      position: 'absolute' as const,
      inset: 0,
    }),
    [viewport],
  )

  const {
    visibleTables,
    visibleRelationships,
    matchedTableIds,
    matchedColumnIds,
  } = useMemo(
    () =>
      filterDiagramData(tables, relationships, filters, {
        connectionId: selection.connectionId,
      }),
    [tables, relationships, filters, selection.connectionId],
  )

  const canvasCursor = isPanning
    ? 'cursor-grabbing'
    : panModeActive
      ? 'cursor-grab'
      : 'cursor-default'

  return (
    <main
      ref={canvasRef}
      data-region="main-canvas"
      className={`grid-bg relative min-h-0 min-w-0 flex-1 overflow-hidden ${canvasCursor} ${className}`}
      onPointerDown={(e) => beginPan(e)}
      onWheel={onWheel}
      onClick={() => {
        if (didPanRef.current) {
          didPanRef.current = false
          return
        }
        if (panModeActive) return
        selectTable(null)
        if (!columnSelectedControlled) setInternalColumnId(null)
        emitAction({ type: 'background-click' })
      }}
    >
      {/* ── Toolbar (screen-fixed, outside world transform) ─────────────── */}
      <div
        className="absolute left-md top-md z-30 flex gap-xs"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <ToolbarButton
          label={
            handTool
              ? 'Hand tool on — drag to move screen (Space also pans)'
              : 'Hand tool off — click to enable grab-pan'
          }
          onClick={() => setHandTool((v) => !v)}
          wide
          active={handTool || spaceHeld}
        >
          {spaceHeld ? 'HAND (SPACE)' : handTool ? 'HAND ON' : 'HAND OFF'}
        </ToolbarButton>
        <ToolbarButton
          label="Zoom in"
          onClick={() => setZoom(viewport.zoom + ZOOM_STEP)}
        >
          +
        </ToolbarButton>
        <ToolbarButton
          label="Zoom out"
          onClick={() => setZoom(viewport.zoom - ZOOM_STEP)}
        >
          −
        </ToolbarButton>
        <div className="mx-xs h-8 w-px bg-outline-variant" />
        <span className="flex h-8 items-center border border-outline-variant bg-surface-container px-sm font-label text-[10px] tracking-widest text-on-surface-variant">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <ToolbarButton
          label={snapToGridEnabled ? 'Snap to grid on' : 'Snap to grid off'}
          onClick={() => setSnapToGridEnabled(!snapToGridEnabled)}
          wide
          active={snapToGridEnabled}
        >
          SNAP {snapToGridEnabled ? 'ON' : 'OFF'}
        </ToolbarButton>
        <ToolbarButton
          label={
            readOnly
              ? 'Auto layout (read-only)'
              : 'Auto layout'
          }
          onClick={autoLayout}
          wide
        >
          AUTO-LAYOUT
        </ToolbarButton>
        {readOnly ? (
          <span className="flex h-8 items-center border border-outline-variant px-sm font-label text-[9px] tracking-widest text-on-surface-variant">
            VIEW ONLY
          </span>
        ) : null}
      </div>

      {/* ── World: SVG edges + table cards ──────────────────────────────── */}
      <div
        data-region="canvas-world"
        style={{
          ...worldStyle,
          pointerEvents: panModeActive ? 'none' : undefined,
        }}
      >
        <RelationshipLayer
          tables={visibleTables}
          relationships={visibleRelationships}
          expandedMap={expandedMap}
          selectedTableId={selectedTableId}
          onRelationshipHover={onRelationshipHover}
          onPromoteRelationship={onPromoteRelationship}
          onRejectRelationship={onRejectRelationship}
        />

        {visibleTables.map((table) => (
          <TableNode
            key={table.id}
            table={table}
            isSelected={selectedTableId === table.id}
            isExpanded={expandedMap[table.id] ?? true}
            isSearchMatch={matchedTableIds.has(table.id)}
            matchedColumnIds={matchedColumnIds}
            selectedColumnId={
              selectedTableId === table.id ? selectedColumnId : null
            }
            dragging={draggingTableId === table.id}
            onPointerDownDrag={
              readOnly || panModeActive ? () => undefined : beginDrag
            }
            onExpand={toggleExpand}
            onSelect={panModeActive ? () => undefined : selectTable}
            onSelectColumn={panModeActive ? () => undefined : selectColumn}
          />
        ))}
      </div>

      {/* MiniMap overlay — live overview; override via miniMap prop */}
      {miniMap ?? (
        <MiniMap
          tables={visibleTables}
          relationships={visibleRelationships}
          viewportRect={viewportRect}
          onViewportChange={onMiniMapViewportChange}
        />
      )}
    </main>
  )
}

function ToolbarButton({
  children,
  onClick,
  label,
  wide,
  active,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  wide?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={
        wide
          ? `border px-md py-sm font-label text-[11px] font-bold tracking-widest ${
              active
                ? 'border-primary-fixed bg-primary-fixed/10 text-primary-fixed'
                : 'border-outline-variant bg-surface-container text-on-surface hover:border-primary-fixed'
            }`
          : 'flex h-8 w-8 items-center justify-center border border-outline-variant bg-surface-container text-on-surface hover:border-primary-fixed'
      }
    >
      {children}
    </button>
  )
}

export default MainCanvas
