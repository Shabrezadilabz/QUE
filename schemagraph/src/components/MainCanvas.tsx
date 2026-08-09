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
  /** Open two-source stitch session (top-right canvas action) */
  onOpenStitchSession?: () => void
  stitchSessionLabel?: string
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
  onOpenStitchSession,
  stitchSessionLabel = 'STITCH SESSION · 2 SOURCES',
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
      {/* ── Toolbar (floating IDE pill) ─────────────────────────────────── */}
      <div
        className="absolute left-md top-md z-30 flex items-center gap-sm rounded border border-outline-variant bg-surface-container-low/90 p-sm backdrop-blur-md"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <ToolbarButton
          label={
            handTool
              ? 'Hand tool on — drag to pan'
              : 'Hand tool off — click to enable grab-pan'
          }
          onClick={() => setHandTool((v) => !v)}
          active={handTool || spaceHeld}
        >
          <HandIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Select / navigate"
          onClick={() => setHandTool(false)}
          active={!handTool && !spaceHeld}
        >
          <SelectIcon />
        </ToolbarButton>
        <div className="mx-xs h-6 w-px self-center bg-outline-variant/30" />
        <ToolbarButton
          label="Zoom in"
          onClick={() => setZoom(viewport.zoom + ZOOM_STEP)}
          chip
        >
          +
        </ToolbarButton>
        <ToolbarButton
          label="Zoom out"
          onClick={() => setZoom(viewport.zoom - ZOOM_STEP)}
          chip
        >
          −
        </ToolbarButton>
        <span className="hidden h-8 items-center px-sm font-label text-[10px] tracking-widest text-on-surface-variant sm:flex">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <div className="mx-xs hidden h-6 w-px self-center bg-outline-variant/30 sm:block" />
        <ToolbarButton
          label={snapToGridEnabled ? 'Snap to grid on' : 'Snap to grid off'}
          onClick={() => setSnapToGridEnabled(!snapToGridEnabled)}
          active={snapToGridEnabled}
          wide
        >
          Snap
        </ToolbarButton>
        <ToolbarButton
          label={readOnly ? 'Auto layout (read-only)' : 'Auto layout'}
          onClick={autoLayout}
          wide
        >
          Layout
        </ToolbarButton>
        {readOnly ? (
          <span className="flex h-8 items-center rounded-lg px-sm font-label text-[9px] tracking-widest text-on-surface-variant">
            VIEW
          </span>
        ) : null}
      </div>

      {onOpenStitchSession ? (
        <div
          className="absolute top-md right-md z-30"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onOpenStitchSession}
            className="rounded border border-secondary/40 bg-secondary/10 px-md py-sm font-label text-[10px] font-bold tracking-[0.14em] text-secondary uppercase backdrop-blur-md hover:bg-secondary hover:text-on-secondary"
          >
            {stitchSessionLabel}
          </button>
        </div>
      ) : null}

      {/* Stats widget — bottom left */}
      <div
        className="absolute bottom-md left-md z-30 flex gap-lg rounded border border-outline-variant bg-surface-container-low/90 p-md backdrop-blur-md"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
            Total Nodes
          </span>
          <span className="font-headline text-2xl font-semibold text-secondary">
            {String(visibleTables.length).padStart(2, '0')}
          </span>
        </div>
        <div className="h-8 w-px self-center bg-outline-variant/30" />
        <div className="flex flex-col">
          <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
            Relationships
          </span>
          <span className="font-headline text-2xl font-semibold text-tertiary">
            {String(visibleRelationships.length).padStart(2, '0')}
          </span>
        </div>
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
  chip,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  wide?: boolean
  active?: boolean
  /** Soft fill for zoom +/- */
  chip?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={
        wide
          ? `rounded px-sm py-sm font-label text-[11px] font-medium tracking-wide transition-colors ${
              active
                ? 'bg-secondary/20 text-secondary'
                : 'text-on-surface-variant hover:bg-surface-container-highest'
            }`
          : chip
            ? `flex h-9 min-w-9 items-center justify-center rounded bg-surface-container-highest px-sm font-label text-sm font-semibold text-on-surface-variant transition-colors hover:text-secondary ${
                active ? 'text-secondary' : ''
              }`
            : `flex h-9 min-w-9 items-center justify-center rounded px-sm font-label text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-secondary/20 text-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-highest'
              }`
      }
    >
      {children}
    </button>
  )
}

function HandIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11.5V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 11V7a1.5 1.5 0 0 1 3 0v6.5" />
      <path d="M17 12.5V11a1.5 1.5 0 0 1 3 0v4c0 3.5-2.5 6-6.5 6h-1.2C10 21 7 18.5 7 15.2V12a1.5 1.5 0 0 1 3 0v1" />
    </svg>
  )
}

function SelectIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M5.5 3.2 18.8 12.4a.7.7 0 0 1-.25 1.25l-5.35 1.35-2.3 5.55a.7.7 0 0 1-1.3.05L5.2 4.1a.7.7 0 0 1 .3-.9Z" />
    </svg>
  )
}

export default MainCanvas
