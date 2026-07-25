import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { TablePosition } from '@/types/schema'
import { snapToGrid as snapPoint, SNAP_GRID_SIZE } from '@/components/canvas/layoutMetrics'

/* ─────────────────────────────────────────────────────────────────────────────
 * useTableNodeDrag
 *
 * DRAG LOGIC LIVES HERE:
 *  - beginDrag / onPointerMove / endDrag (pointer + touch via Pointer Events)
 *  - rAF batching so React position commits stay ≤ 1/frame (~60fps)
 *  - optional snap-to-grid on move (and final snap on drop)
 *
 * POSITION UPDATE HANDLER:
 *  - `onPositionChange(tableId, position, phase)` is the single write path
 *    into DiagramContext (`setTablePosition`) / store.
 * ─────────────────────────────────────────────────────────────────────────── */

export type DragPhase = 'start' | 'move' | 'end'

export interface UseTableNodeDragOptions {
  /** Current viewport zoom — screen deltas are divided by zoom → world space */
  getZoom: () => number
  /** Resolve the node's world position at drag start */
  getPosition: (tableId: string) => TablePosition | null
  /**
   * POSITION UPDATE HANDLER — called ≤ once per animation frame during move,
   * and once on drop. Wire this to DiagramContext.setTablePosition.
   */
  onPositionChange: (
    tableId: string,
    position: TablePosition,
    phase: DragPhase,
  ) => void
  /** When true, positions snap to SNAP_GRID_SIZE while dragging */
  snapToGrid?: boolean
  gridSize?: number
  onDragTableChange?: (tableId: string | null) => void
}

interface NodeDragSession {
  tableId: string
  pointerId: number
  startClientX: number
  startClientY: number
  origin: TablePosition
  /** Latest computed world position (may be ahead of React state) */
  latest: TablePosition
  target: EventTarget | null
}

/**
 * Pointer-driven TableNode repositioning (mouse + touch + pen).
 */
export function useTableNodeDrag({
  getZoom,
  getPosition,
  onPositionChange,
  snapToGrid = false,
  gridSize = SNAP_GRID_SIZE,
  onDragTableChange,
}: UseTableNodeDragOptions) {
  const sessionRef = useRef<NodeDragSession | null>(null)
  const rafRef = useRef<number | null>(null)
  const snapRef = useRef(snapToGrid)
  snapRef.current = snapToGrid
  const gridRef = useRef(gridSize)
  gridRef.current = gridSize

  const [draggingTableId, setDraggingTableId] = useState<string | null>(null)

  const flushMove = useCallback(() => {
    rafRef.current = null
    const session = sessionRef.current
    if (!session) return
    // Commit pending world position → context/store (RelationshipLayer re-renders)
    onPositionChange(session.tableId, session.latest, 'move')
  }, [onPositionChange])

  const scheduleFlush = useCallback(() => {
    // Cap React updates to one per frame for ≥60fps dragging
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(flushMove)
  }, [flushMove])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const session = sessionRef.current
      if (!session || e.pointerId !== session.pointerId) return

      const zoom = Math.max(getZoom(), 0.0001)
      const rawX = session.origin.x + (e.clientX - session.startClientX) / zoom
      const rawY = session.origin.y + (e.clientY - session.startClientY) / zoom

      session.latest = snapRef.current
        ? snapPoint(rawX, rawY, gridRef.current)
        : { x: rawX, y: rawY }

      scheduleFlush()
    },
    [getZoom, scheduleFlush],
  )

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const session = sessionRef.current
      if (!session || e.pointerId !== session.pointerId) return

      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      // Final snap on drop even if snap-while-drag was off mid-gesture? keep consistent
      const finalPos = snapRef.current
        ? snapPoint(session.latest.x, session.latest.y, gridRef.current)
        : session.latest

      sessionRef.current = null
      setDraggingTableId(null)
      onDragTableChange?.(null)

      try {
        if (session.target && 'releasePointerCapture' in session.target) {
          ;(session.target as Element).releasePointerCapture(session.pointerId)
        }
      } catch {
        /* already released */
      }

      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)

      onPositionChange(session.tableId, finalPos, 'end')
    },
    [onPointerMove, onPositionChange, onDragTableChange],
  )

  /**
   * DRAG START — attach to TableNode drag handle (source header).
   * Uses setPointerCapture so touch + mouse keep streaming moves off-element.
   */
  const beginDrag = useCallback(
    (e: ReactPointerEvent, tableId: string) => {
      // Primary button only for mouse; touch/pen pointerType always ok
      if (e.pointerType === 'mouse' && e.button !== 0) return

      e.stopPropagation()
      e.preventDefault()

      const origin = getPosition(tableId)
      if (!origin) return

      const target = e.currentTarget
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        /* some environments reject capture — window listeners still work */
      }

      sessionRef.current = {
        tableId,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origin: { ...origin },
        latest: { ...origin },
        target,
      }

      setDraggingTableId(tableId)
      onDragTableChange?.(tableId)
      onPositionChange(tableId, origin, 'start')

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
    },
    [getPosition, onPointerMove, endDrag, onPositionChange, onDragTableChange],
  )

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [onPointerMove, endDrag])

  return {
    beginDrag,
    draggingTableId,
  }
}
