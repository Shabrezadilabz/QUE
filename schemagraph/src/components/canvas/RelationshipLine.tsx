import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import styled, { keyframes, css } from 'styled-components'
import type {
  RelationshipLineType,
  SchemaRelationship,
} from '@/types/schema'

/* ─────────────────────────────────────────────────────────────────────────────
 * RelationshipLine
 *
 * SVG edge + portal tooltip (render-to-body so it is never clipped by the
 * canvas overflow / CSS transform).
 *
 * TOOLTIP SHOW / HIDE LOGIC — see `showTooltip` / `hideTooltip` below.
 * BUSINESS LOGIC FOR LINE STYLING — see `resolveLineStyle()`.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Minimal relationship payload the line needs. */
export interface RelationshipLineModel {
  id: string
  type: RelationshipLineType
  confidence: number
  fromId: string
  toId: string
  joinCriteria?: string
  label?: string
  /** Extra note for AI-inferred edges (tooltip body) */
  aiNotes?: string
  /** Review status — suggested edges show Promote / Reject */
  status?: 'suggested' | 'accepted' | 'rejected'
  /** Explainable why signals */
  evidence?: {
    summary?: string
    signals?: { code: string; label: string; weight: number }[]
  }
}

export type RelationshipHoverSource = 'hover' | 'keyboard' | 'click'

export interface RelationshipHoverEvent {
  relationship: RelationshipLineModel
  active: boolean
  source: RelationshipHoverSource
}

export interface RelationshipLineProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
  relationship: RelationshipLineModel
  emphasized?: boolean
  muted?: boolean
  className?: string
  onSelect?: (relationshipId: string) => void
  onRelationshipHover?: (event: RelationshipHoverEvent) => void
  /** Promote inferred → explicit accepted */
  onPromote?: (relationshipId: string) => void | Promise<void>
  /** Reject inferred (remove from canvas) */
  onReject?: (relationshipId: string) => void | Promise<void>
  /** Show endpoint handles for pull-thread edit */
  editMode?: boolean
  onEndpointPointerDown?: (
    e: ReactMouseEvent,
    relationshipId: string,
    end: 'from' | 'to',
  ) => void
}

export interface RelationshipLineStyle {
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  markerFill: string
  label: string
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUSINESS LOGIC — line styling by relationship type + confidence
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function resolveLineStyle(
  relationship: RelationshipLineModel,
  options: { emphasized?: boolean; muted?: boolean } = {},
): RelationshipLineStyle {
  const { emphasized = false, muted = false } = options
  const conf = clamp01(relationship.confidence)

  if (relationship.type === 'ai-inferred') {
    return {
      stroke: muted ? '#424850' : emphasized ? '#7aecd0' : 'rgba(122, 236, 208, 0.5)',
      strokeWidth: emphasized ? 2.25 : conf >= 0.75 ? 1.75 : 1.25,
      strokeDasharray: '6 4',
      markerFill: muted ? '#424850' : emphasized ? '#7aecd0' : 'rgba(122, 236, 208, 0.5)',
      label: 'AI-inferred',
    }
  }

  return {
    stroke: muted ? '#424850' : emphasized ? '#d0d8e0' : '#6b7380',
    strokeWidth: emphasized ? 2.5 : 1.75,
    strokeDasharray: emphasized ? undefined : '4 4',
    markerFill: muted ? '#424850' : emphasized ? '#d0d8e0' : '#6b7380',
    label: 'Explicit',
  }
}

export function toRelationshipLineModel(
  rel: SchemaRelationship,
): RelationshipLineModel {
  const type: RelationshipLineType =
    rel.type ?? (rel.kind === 'inferred' ? 'ai-inferred' : 'explicit')

  return {
    id: rel.id,
    type,
    confidence: rel.confidence ?? (type === 'explicit' ? 1 : 0.72),
    fromId: rel.fromId ?? rel.fromColumnId,
    toId: rel.toId ?? rel.toColumnId,
    joinCriteria:
      rel.joinCriteria ??
      rel.label ??
      `${rel.fromColumnId} → ${rel.toColumnId}`,
    label: rel.label,
    status: rel.status,
    evidence: rel.evidence,
    aiNotes:
      rel.evidence?.summary
        ? `Why: ${rel.evidence.summary}`
        : rel.aiNotes ??
          (type === 'ai-inferred'
            ? 'Suggested by name/type similarity. Review before promoting to an explicit foreign key.'
            : undefined),
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function buildElbowPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): string {
  const midX = (fromX + toX) / 2
  return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`
}

/* ── Animation ─────────────────────────────────────────────────────────────── */

const drawIn = keyframes`
  from { opacity: 0; stroke-dashoffset: 320; }
  to { opacity: 1; stroke-dashoffset: 0; }
`

const hoverGlow = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.72; }
`

const EdgeGroup = styled.g<{ $active: boolean }>`
  cursor: pointer;
  outline: none;

  .rl-path {
    stroke-dasharray: 320;
    animation: ${drawIn} 0.55s ease-out forwards;
    transition: stroke 0.15s ease, filter 0.15s ease;
  }

  &:hover .rl-path {
    filter: drop-shadow(0 0 4px rgba(123, 208, 255, 0.4));
  }

  ${({ $active }) =>
    $active &&
    css`
      .rl-path {
        stroke: #7bd0ff !important;
        stroke-width: 2px;
        filter: drop-shadow(0 0 6px rgba(123, 208, 255, 0.6));
        animation: ${hoverGlow} 0.9s ease-in-out infinite;
      }
    `}

  &:focus-visible .rl-hit {
    stroke: #7bd0ff;
    stroke-opacity: 0.45;
  }
`

const TooltipCard = styled.div<{ $interactive?: boolean }>`
  position: fixed;
  z-index: 10000;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 10px 12px;
  background: #1b2b3f;
  border: 1px solid #45464d;
  border-radius: 0.375rem;
  box-shadow: none;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 11px;
  line-height: 1.45;
  color: #d3e4fe;
  pointer-events: ${({ $interactive }) => ($interactive ? 'auto' : 'none')};
`

const TipActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 10px;
`

const TipButton = styled.button<{ $primary?: boolean }>`
  flex: 1;
  border: 1px solid
    ${({ $primary }) => ($primary ? '#7bd0ff' : '#45464d')};
  border-radius: 0.25rem;
  background: ${({ $primary }) =>
    $primary ? '#7bd0ff' : 'transparent'};
  color: ${({ $primary }) => ($primary ? '#00354a' : '#c6c6cd')};
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 8px 6px;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const TipTitle = styled.div`
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #7bd0ff;
  margin-bottom: 8px;
`

const TipRow = styled.div`
  margin-bottom: 4px;
  word-break: break-word;
`

const TipMuted = styled.span`
  color: #c6c6cd;
`

const TipNote = styled.p`
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px solid #45464d;
  color: #c6c6cd;
  font-size: 10px;
  line-height: 1.5;
`

const TipHint = styled.div`
  margin-top: 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #909097;
`

type TooltipState =
  | { open: false }
  | {
      open: true
      source: RelationshipHoverSource
      /** Screen coordinates for portal placement (near cursor or focus) */
      x: number
      y: number
    }

const TOOLTIP_OFFSET = 14
const TOOLTIP_W = 260
const TOOLTIP_H_EST = 160

function clampTooltipPos(x: number, y: number): { x: number; y: number } {
  const maxX = window.innerWidth - TOOLTIP_W - 12
  const maxY = window.innerHeight - TOOLTIP_H_EST - 12
  return {
    x: Math.max(12, Math.min(x + TOOLTIP_OFFSET, maxX)),
    y: Math.max(12, Math.min(y + TOOLTIP_OFFSET, maxY)),
  }
}

/**
 * Portal tooltip — always mounted on document.body so canvas overflow /
 * CSS world-transform cannot clip or skew it.
 */
function RelationshipTooltipPortal({
  open,
  x,
  y,
  relationship,
  styleLabel,
  pinnedHint,
  tooltipId,
  canReview,
  busy,
  onPromote,
  onReject,
}: {
  open: boolean
  x: number
  y: number
  relationship: RelationshipLineModel
  styleLabel: string
  pinnedHint?: boolean
  tooltipId: string
  canReview?: boolean
  busy?: boolean
  onPromote?: () => void
  onReject?: () => void
}) {
  if (!open || typeof document === 'undefined') return null

  const confidencePct = Math.round(clamp01(relationship.confidence) * 100)
  const pos = clampTooltipPos(x, y)

  return createPortal(
    <TooltipCard
      id={tooltipId}
      role="tooltip"
      data-region="relationship-tooltip"
      $interactive={canReview}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <TipTitle>{styleLabel}</TipTitle>
      <TipRow>
        <TipMuted>Columns: </TipMuted>
        {relationship.fromId} → {relationship.toId}
      </TipRow>
      <TipRow>
        <TipMuted>Join: </TipMuted>
        {relationship.joinCriteria ?? '—'}
      </TipRow>
      <TipRow>
        <TipMuted>Type: </TipMuted>
        {relationship.type}
        {relationship.status ? ` · ${relationship.status}` : ''}
      </TipRow>
      <TipRow>
        <TipMuted>Confidence: </TipMuted>
        {confidencePct}%
      </TipRow>
      {relationship.evidence?.signals &&
      relationship.evidence.signals.length > 0 ? (
        <TipNote>
          {relationship.evidence.signals
            .filter((s) => s.weight > 0)
            .slice(0, 5)
            .map((s) => s.label)
            .join(' · ')}
        </TipNote>
      ) : relationship.type === 'ai-inferred' ? (
        <TipNote>
          {relationship.aiNotes ??
            'AI-inferred link. Validate join criteria before promoting.'}
        </TipNote>
      ) : null}
      {canReview ? (
        <TipActions>
          <TipButton
            type="button"
            $primary
            disabled={busy}
            onClick={onPromote}
          >
            Promote
          </TipButton>
          <TipButton type="button" disabled={busy} onClick={onReject}>
            Reject
          </TipButton>
          <TipButton
            type="button"
            onClick={() => {
              window.location.assign('/joins')
            }}
          >
            Full evidence
          </TipButton>
        </TipActions>
      ) : relationship.evidence?.signals?.length ? (
        <TipActions>
          <TipButton
            type="button"
            onClick={() => {
              window.location.assign('/joins')
            }}
          >
            Full evidence
          </TipButton>
        </TipActions>
      ) : null}
      {pinnedHint ? (
        <TipHint>Esc to dismiss · Enter to toggle</TipHint>
      ) : null}
    </TooltipCard>,
    document.body,
  )
}

/**
 * Single relationship SVG edge with portal tooltip + a11y.
 */
export function RelationshipLine({
  fromX,
  fromY,
  toX,
  toY,
  relationship,
  emphasized = false,
  muted = false,
  className,
  onSelect,
  onRelationshipHover,
  onPromote,
  onReject,
  editMode = false,
  onEndpointPointerDown,
}: RelationshipLineProps) {
  const reactId = useId()
  const markerId = `rl-arrow-${relationship.id}-${reactId.replace(/:/g, '')}`
  const tooltipId = `rl-tip-${relationship.id}-${reactId.replace(/:/g, '')}`
  const groupRef = useRef<SVGGElement | null>(null)

  const [tooltip, setTooltip] = useState<TooltipState>({ open: false })
  const [drawn, setDrawn] = useState(false)
  const [busy, setBusy] = useState(false)
  const tooltipRef = useRef(tooltip)
  tooltipRef.current = tooltip

  const canReview =
    relationship.type === 'ai-inferred' &&
    (relationship.status === 'suggested' || relationship.status == null) &&
    Boolean(onPromote || onReject)

  const style = useMemo(
    () => resolveLineStyle(relationship, { emphasized, muted }),
    [relationship, emphasized, muted],
  )

  const pathD = useMemo(
    () => buildElbowPath(fromX, fromY, toX, toY),
    [fromX, fromY, toX, toY],
  )

  const confidencePct = Math.round(clamp01(relationship.confidence) * 100)
  const ariaLabel = [
    `${style.label} relationship`,
    relationship.joinCriteria ??
      `${relationship.fromId} to ${relationship.toId}`,
    `confidence ${confidencePct} percent`,
    'Press Enter to show details',
  ].join('. ')

  /* ── SHOW / HIDE TOOLTIP ──────────────────────────────────────────────────
   *
   * SHOW (`showTooltip`):
   *  - Pointer hover → source 'hover', position = mouse client coords
   *  - Keyboard Enter/Space while focused → source 'keyboard', position =
   *    bounding box of the edge group (or last mouse if any)
   *  - Click while hovered → source 'click' (keeps tip; fires analytics)
   *
   * HIDE (`hideTooltip`):
   *  - Pointer leave — only if current source is 'hover'
   *    (keyboard-pinned tips stay until Escape / blur / Enter toggle)
   *  - Escape key
   *  - Blur (keyboard dismiss)
   *  - Enter toggle when already keyboard-open
   *
   * Analytics: every show/hide notifies `onRelationshipHover`.
   * ──────────────────────────────────────────────────────────────────────── */

  const emitHover = useCallback(
    (active: boolean, source: RelationshipHoverSource) => {
      onRelationshipHover?.({ relationship, active, source })
    },
    [onRelationshipHover, relationship],
  )

  const showTooltip = useCallback(
    (source: RelationshipHoverSource, x: number, y: number) => {
      const wasOpen = tooltipRef.current.open
      setTooltip({ open: true, source, x, y })
      if (!wasOpen) emitHover(true, source)
    },
    [emitHover],
  )

  const hideTooltip = useCallback(
    (source: RelationshipHoverSource) => {
      if (!tooltipRef.current.open) return
      setTooltip({ open: false })
      emitHover(false, source)
    },
    [emitHover],
  )

  const focusScreenPoint = useCallback((): { x: number; y: number } => {
    const el = groupRef.current
    if (!el) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    }
    const box = el.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }, [])

  const onMouseEnter = (e: ReactMouseEvent) => {
    showTooltip('hover', e.clientX, e.clientY)
  }

  const onMouseMove = (e: ReactMouseEvent) => {
    // Keep tip glued near cursor while hovering
    if (tooltipRef.current.open && tooltipRef.current.source === 'hover') {
      setTooltip({
        open: true,
        source: 'hover',
        x: e.clientX,
        y: e.clientY,
      })
    }
  }

  const onMouseLeave = () => {
    // Only dismiss pointer-driven tips; keyboard-pinned stay open
    if (tooltipRef.current.open && tooltipRef.current.source === 'hover') {
      hideTooltip('hover')
    }
  }

  const onFocus = () => {
    // Tab focus alone does NOT open the tip — Enter/Space does (a11y contract)
  }

  const onBlur = () => {
    if (tooltipRef.current.open && tooltipRef.current.source === 'keyboard') {
      hideTooltip('keyboard')
    }
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      if (tooltipRef.current.open) {
        e.preventDefault()
        e.stopPropagation()
        hideTooltip(tooltipRef.current.source)
      }
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()

      // Toggle keyboard tooltip
      if (
        tooltipRef.current.open &&
        tooltipRef.current.source === 'keyboard'
      ) {
        hideTooltip('keyboard')
        return
      }

      const pt = focusScreenPoint()
      showTooltip('keyboard', pt.x, pt.y)
      onSelect?.(relationship.id)
    }
  }

  const onClick = (e: ReactMouseEvent) => {
    e.stopPropagation()
    const pt = { x: e.clientX, y: e.clientY }
    showTooltip('click', pt.x, pt.y)
    onSelect?.(relationship.id)
  }

  // Global Escape when tip is open (covers focus lost edge cases)
  useEffect(() => {
    if (!tooltip.open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') hideTooltip(tooltip.source)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tooltip, hideTooltip])

  const pathDash = drawn ? style.strokeDasharray : '320'
  const pathOffset = drawn ? 0 : undefined
  const tipOpen = tooltip.open

  return (
    <>
      <EdgeGroup
        ref={groupRef}
        className={className}
        data-region="relationship-line"
        data-relationship-id={relationship.id}
        data-relationship-type={relationship.type}
        $active={tipOpen}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-describedby={tipOpen ? tooltipId : undefined}
        aria-expanded={tipOpen}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget.querySelector('.rl-path')) {
            setDrawn(true)
          }
        }}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={style.markerFill} />
          </marker>
        </defs>

        <path
          className="rl-hit"
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          pointerEvents="stroke"
        />

        <path
          className="rl-path"
          d={pathD}
          fill="none"
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          strokeDasharray={pathDash}
          strokeDashoffset={pathOffset}
          strokeLinecap="square"
          markerEnd={`url(#${markerId})`}
          opacity={muted && !tipOpen ? 0.35 : 1}
          pointerEvents="stroke"
          style={
            drawn
              ? {
                  strokeDasharray: style.strokeDasharray ?? 'none',
                  animation: tipOpen ? undefined : 'none',
                }
              : undefined
          }
        />

        <title>{ariaLabel}</title>
        <desc>
          {relationship.type === 'ai-inferred'
            ? relationship.aiNotes ??
              'Suggested by AI inference. Review join criteria before promoting to an explicit key.'
            : 'Declared relationship between schema columns.'}
        </desc>

        {editMode ? (
          <>
            <circle
              cx={fromX}
              cy={fromY}
              r={6}
              fill="#7bd0ff"
              stroke="#031427"
              strokeWidth={2}
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                onEndpointPointerDown?.(
                  e as unknown as ReactMouseEvent,
                  relationship.id,
                  'from',
                )
              }}
            />
            <circle
              cx={toX}
              cy={toY}
              r={6}
              fill="#7bd0ff"
              stroke="#031427"
              strokeWidth={2}
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                onEndpointPointerDown?.(
                  e as unknown as ReactMouseEvent,
                  relationship.id,
                  'to',
                )
              }}
            />
          </>
        ) : null}
      </EdgeGroup>

      <RelationshipTooltipPortal
        open={tipOpen}
        x={tooltip.open ? tooltip.x : 0}
        y={tooltip.open ? tooltip.y : 0}
        relationship={relationship}
        styleLabel={style.label}
        pinnedHint={tooltip.open && tooltip.source === 'keyboard'}
        tooltipId={tooltipId}
        canReview={canReview}
        busy={busy}
        onPromote={
          onPromote
            ? async () => {
                setBusy(true)
                try {
                  await onPromote(relationship.id)
                  hideTooltip('click')
                } finally {
                  setBusy(false)
                }
              }
            : undefined
        }
        onReject={
          onReject
            ? async () => {
                setBusy(true)
                try {
                  await onReject(relationship.id)
                  hideTooltip('click')
                } finally {
                  setBusy(false)
                }
              }
            : undefined
        }
      />
    </>
  )
}

export default RelationshipLine
