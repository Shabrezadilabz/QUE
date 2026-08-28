import { useRef, type PointerEvent, type ReactNode } from 'react'
import type { BiChart } from '@/services/stitchApi'

type Layout = { col: number; row: number; w: number; h: number }

type Props = {
  chart: BiChart
  layout: Layout
  editMode: boolean
  canWrite: boolean
  selected: boolean
  crossFilterDimmed?: boolean
  crossFilterSource?: boolean
  onSelect: () => void
  onLayoutDraft: (patch: Partial<Layout>) => void
  onLayoutCommit: (patch: Partial<Layout>) => void
  children: ReactNode
}

function clampLayout(layout: Layout): Layout {
  return {
    col: Math.min(11, Math.max(0, layout.col)),
    row: Math.max(0, layout.row),
    w: Math.min(12, Math.max(3, layout.w)),
    h: Math.min(8, Math.max(2, layout.h)),
  }
}

/**
 * Studio v3 — draggable + resizable canvas tile (12-col grid snap).
 */
export function StudioCanvasTile({
  chart,
  layout,
  editMode,
  canWrite,
  selected,
  crossFilterDimmed = false,
  crossFilterSource = false,
  onSelect,
  onLayoutDraft,
  onLayoutCommit,
  children,
}: Props) {
  const dragRef = useRef<{
    startX: number
    startY: number
    startCol: number
    startRow: number
  } | null>(null)
  const resizeRef = useRef<{
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  function onDragPointerDown(e: PointerEvent) {
    if (!editMode || !canWrite) return
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCol: layout.col,
      startRow: layout.row,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onDragPointerMove(e: PointerEvent) {
    if (!dragRef.current) return
    const grid = (e.currentTarget as HTMLElement).closest(
      '[data-studio-grid]',
    ) as HTMLElement | null
    if (!grid) return
    const cellW = grid.clientWidth / 12
    const cellH = 72
    const dCol = Math.round((e.clientX - dragRef.current.startX) / cellW)
    const dRow = Math.round((e.clientY - dragRef.current.startY) / cellH)
    const col = Math.min(
      11,
      Math.max(0, dragRef.current.startCol + dCol),
    )
    const row = Math.max(0, dragRef.current.startRow + dRow)
    onLayoutDraft({ col, row })
  }

  function onDragPointerUp(e: PointerEvent) {
    if (!dragRef.current) return
    const grid = (e.currentTarget as HTMLElement).closest(
      '[data-studio-grid]',
    ) as HTMLElement | null
    if (grid) {
      const cellW = grid.clientWidth / 12
      const cellH = 72
      const dCol = Math.round((e.clientX - dragRef.current.startX) / cellW)
      const dRow = Math.round((e.clientY - dragRef.current.startY) / cellH)
      const col = Math.min(
        11,
        Math.max(0, dragRef.current.startCol + dCol),
      )
      const row = Math.max(0, dragRef.current.startRow + dRow)
      onLayoutCommit({ col, row })
    }
    dragRef.current = null
  }

  function onResizePointerDown(e: PointerEvent) {
    if (!editMode || !canWrite) return
    e.stopPropagation()
    e.preventDefault()
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: layout.w,
      startH: layout.h,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onResizePointerMove(e: PointerEvent) {
    if (!resizeRef.current) return
    const grid = (e.currentTarget as HTMLElement).closest(
      '[data-studio-grid]',
    ) as HTMLElement | null
    if (!grid) return
    const cellW = grid.clientWidth / 12
    const cellH = 72
    const dW = Math.round((e.clientX - resizeRef.current.startX) / cellW)
    const dH = Math.round((e.clientY - resizeRef.current.startY) / cellH)
    const next = clampLayout({
      ...layout,
      w: resizeRef.current.startW + dW,
      h: resizeRef.current.startH + dH,
    })
    onLayoutDraft({ w: next.w, h: next.h })
  }

  function onResizePointerUp(e: PointerEvent) {
    if (!resizeRef.current) return
    const grid = (e.currentTarget as HTMLElement).closest(
      '[data-studio-grid]',
    ) as HTMLElement | null
    if (grid) {
      const cellW = grid.clientWidth / 12
      const cellH = 72
      const dW = Math.round((e.clientX - resizeRef.current.startX) / cellW)
      const dH = Math.round((e.clientY - resizeRef.current.startY) / cellH)
      const next = clampLayout({
        ...layout,
        w: resizeRef.current.startW + dW,
        h: resizeRef.current.startH + dH,
      })
      onLayoutCommit({ w: next.w, h: next.h })
    }
    resizeRef.current = null
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      className={[
        'overflow-hidden rounded-[4px] border border-solid bg-[#0f1215] text-left transition-colors',
        selected
          ? 'border-[#d0d8e0]/50 ring-1 ring-[rgba(208,216,224,0.15)]'
          : crossFilterSource
            ? 'border-[#7aecd0]/50 ring-1 ring-[#7aecd0]/20'
            : crossFilterDimmed
              ? 'border-[#424850] opacity-75'
              : 'border-[#424850] hover:border-[#6b7380]',
      ].join(' ')}
      style={{
        gridColumn: `${layout.col + 1} / span ${layout.w}`,
        gridRow: `span ${layout.h}`,
        minHeight: `${layout.h * 3.2}rem`,
      }}
    >
      {editMode && canWrite ? (
        <div
          className="flex cursor-grab items-center gap-[6px] border-b border-[#424850] bg-[#121619] px-[10px] py-[4px] active:cursor-grabbing"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
        >
          <span className="text-[12px] text-[#6b7380]" aria-hidden>
            ⠿
          </span>
          <span className="truncate text-[10px] font-semibold text-[#8a9099]">
            {chart.title}
          </span>
          <span className="ml-auto font-mono text-[9px] text-[#6b7380]">
            c{layout.col} r{layout.row}
          </span>
        </div>
      ) : null}
      <div className="relative p-[14px]">
        {children}
        {editMode && canWrite ? (
          <div
            role="separator"
            aria-label="Resize visual"
            className="absolute right-[6px] bottom-[6px] h-[12px] w-[12px] cursor-se-resize rounded-[2px] border border-[#6b7380] bg-[#121619]"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          />
        ) : null}
      </div>
    </div>
  )
}
