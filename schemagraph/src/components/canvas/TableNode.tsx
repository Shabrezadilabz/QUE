import { useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import styled, { css } from 'styled-components'
import type { SchemaColumn, SchemaTable } from '@/types/schema'
import {
  COLUMN_LIST_PADDING_Y,
  COLUMN_ROW_HEIGHT,
  SOURCE_HEADER_HEIGHT,
  TABLE_NODE_WIDTH,
  TABLE_TITLE_HEIGHT,
} from '@/components/canvas/layoutMetrics'
import { SourceTypeIcon } from '@/components/sidebar/SourceTypeIcon'
import {
  ColumnKeyIcon,
  ColumnTypeIcon,
  keyKindLabel,
} from '@/components/canvas/ColumnIcons'
import { SAMPLE_TABLE_NODE } from '@/data/dummySchema'

/* ─────────────────────────────────────────────────────────────────────────────
 * TableNode
 *
 * Rectangle card for one schema table on the diagram canvas.
 *
 * Layout:
 *  ┌─ SourceHeader (icon + label) — drag handle ───────────────────────────┐
 *  │ TitleBar (name + expand toggle + entity badge)                        │
 *  │ ColumnList (when expanded) — name, type icon, key icon + tooltip      │
 *  └───────────────────────────────────────────────────────────────────────┘
 *
 * Required props: table, isSelected, onExpand, onSelectColumn
 * Canvas extras (optional): isExpanded, selectedColumnId, dragging, drag handlers
 * ─────────────────────────────────────────────────────────────────────────── */

export interface TableNodeProps {
  /** Table payload (name, source, columns, position, …) */
  table: SchemaTable
  /** Selection highlight (lime border / source header) */
  isSelected: boolean
  /**
   * Expand / collapse toggle.
   * Called with the table id and the *next* expanded boolean.
   */
  onExpand: (tableId: string, expanded: boolean) => void
  /** Column click — bubbles to parent / right sidebar */
  onSelectColumn: (tableId: string, columnId: string) => void

  /* ── Optional canvas integration ──────────────────────────────────────── */
  /** Controlled expand state (parent owns map). Defaults to table.defaultExpanded */
  isExpanded?: boolean
  selectedColumnId?: string | null
  /** Real-time TopBar search match — amber outline pulse */
  isSearchMatch?: boolean
  /** Column ids matched by current search (row highlight) */
  matchedColumnIds?: Set<string>
  /** Card click selects the table (without toggling expand) */
  onSelect?: (tableId: string) => void
  dragging?: boolean
  onPointerDownDrag?: (e: ReactPointerEvent, tableId: string) => void
  className?: string
}

/* ── Styled pieces ─────────────────────────────────────────────────────────── */

const Card = styled.div<{
  $selected: boolean
  $dragging: boolean
  $searchMatch: boolean
}>`
  position: absolute;
  width: ${TABLE_NODE_WIDTH}px;
  background: #1f1f1f;
  border: ${({ $selected, $searchMatch }) =>
    $selected
      ? '2px solid #c3f400'
      : $searchMatch
        ? '2px solid #FFB020'
        : '1px solid #444933'};
  box-shadow: ${({ $selected, $searchMatch }) =>
    $selected
      ? '0 0 15px -5px rgba(195, 244, 0, 0.35)'
      : $searchMatch
        ? '0 0 12px -4px rgba(255, 176, 32, 0.45)'
        : 'none'};
  cursor: default;
  user-select: none;
  z-index: ${({ $dragging, $searchMatch }) =>
    $dragging ? 30 : $searchMatch ? 15 : 5};
  transition: ${({ $dragging }) =>
    $dragging ? 'none' : 'border-color 0.12s ease, box-shadow 0.12s ease'};
  will-change: ${({ $dragging }) => ($dragging ? 'left, top' : 'auto')};

  &:hover {
    border-color: #c3f400;
  }
`

const SourceHeader = styled.div<{ $active: boolean }>`
  height: ${SOURCE_HEADER_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: ${({ $active }) => ($active ? '#c3f400' : '#353535')};
  color: ${({ $active }) => ($active ? '#161e00' : '#c4c9ac')};
  cursor: grab;
  /* Required for smooth touch dragging (prevents browser scroll/zoom steal) */
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`

const SourceLeft = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`

const TitleBar = styled.div`
  height: ${TABLE_TITLE_HEIGHT}px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid #444933;
  background: #2a2a2a;
`

const TableNameBtn = styled.button`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: #e2e2e2;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;

  &:hover {
    color: #c3f400;
  }
`

const ExpandToggle = styled.button<{ $open: boolean }>`
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #444933;
  background: #1f1f1f;
  color: #c3f400;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
  transition: transform 0.12s ease;

  &:hover {
    border-color: #c3f400;
  }
`

const Badge = styled.span`
  flex-shrink: 0;
  padding: 2px 6px;
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: #c3f400;
  background: rgba(195, 244, 0, 0.12);
  border: 1px solid rgba(195, 244, 0, 0.3);
`

const ColumnList = styled.ul`
  list-style: none;
  margin: 0;
  padding: ${COLUMN_LIST_PADDING_Y}px 8px;
  display: flex;
  flex-direction: column;
  gap: 0;
`

const ColumnRow = styled.li<{ $selected: boolean }>`
  position: relative;
  height: ${COLUMN_ROW_HEIGHT}px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: ${({ $selected }) => ($selected ? '#c3f400' : '#e2e2e2')};

  ${({ $selected }) =>
    $selected &&
    css`
      background: rgba(195, 244, 0, 0.08);
      outline: 1px solid rgba(195, 244, 0, 0.35);
    `}

  &:hover {
    color: #c3f400;
    background: rgba(195, 244, 0, 0.06);
  }
`

const ColName = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TypeMuted = styled.span`
  margin-left: 6px;
  opacity: 0.45;
  color: #c4c9ac;
  font-size: 11px;
`

const TypeIconWrap = styled.span`
  display: inline-flex;
  color: #8e9379;
  flex-shrink: 0;
`

const KeyIconWrap = styled.span`
  display: inline-flex;
  color: #c3f400;
  flex-shrink: 0;
`

const ExpandHint = styled.div`
  padding: 8px 16px 12px;
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: #8e9379;
  text-transform: uppercase;
`

const Tooltip = styled.div`
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 50;
  width: 220px;
  padding: 10px 12px;
  background: #0e0e0e;
  border: 1px solid #c3f400;
  box-shadow: 0 0 12px -4px rgba(195, 244, 0, 0.35);
  pointer-events: none;
  text-align: left;
`

const TipTitle = styled.div`
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  color: #c3f400;
  margin-bottom: 6px;
`

const TipMeta = styled.div`
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: #c4c9ac;
  text-transform: uppercase;
  margin-bottom: 4px;
`

const TipBody = styled.p`
  margin: 0 0 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.4;
  color: #e2e2e2;
`

const SampleList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const SampleItem = styled.li`
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #abd600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/* ── Tooltip content ───────────────────────────────────────────────────────── */

function ColumnTooltip({ column }: { column: SchemaColumn }) {
  const keyLabel = keyKindLabel(column.keyKind)
  return (
    <Tooltip role="tooltip" data-region="column-tooltip">
      <TipTitle>
        {column.name}
        <TypeMuted> {column.dataType}</TypeMuted>
      </TipTitle>

      {keyLabel ? <TipMeta>{keyLabel}</TipMeta> : null}
      {column.references ? (
        <TipMeta>→ {column.references}</TipMeta>
      ) : null}
      {column.nullable !== undefined ? (
        <TipMeta>{column.nullable ? 'NULLABLE' : 'NOT NULL'}</TipMeta>
      ) : null}

      {column.description ? <TipBody>{column.description}</TipBody> : null}

      {column.sampleValues && column.sampleValues.length > 0 ? (
        <>
          <TipMeta>Sample values</TipMeta>
          <SampleList>
            {column.sampleValues.slice(0, 4).map((v) => (
              <SampleItem key={v}>{v}</SampleItem>
            ))}
          </SampleList>
        </>
      ) : (
        <TipBody style={{ opacity: 0.6 }}>No sample values</TipBody>
      )}
    </Tooltip>
  )
}

/* ── Main component ────────────────────────────────────────────────────────── */

/**
 * Rectangle card for a single table on the schema diagram.
 */
export function TableNode({
  table,
  isSelected,
  onExpand,
  onSelectColumn,
  isExpanded: isExpandedProp,
  selectedColumnId = null,
  isSearchMatch = false,
  matchedColumnIds,
  onSelect,
  dragging = false,
  onPointerDownDrag,
  className,
}: TableNodeProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(
    table.defaultExpanded ?? true,
  )
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null)

  const expandControlled = isExpandedProp !== undefined
  const isExpanded = expandControlled ? isExpandedProp : uncontrolledExpanded

  function handleExpandToggle(e: MouseEvent) {
    e.stopPropagation()
    const next = !isExpanded
    if (!expandControlled) setUncontrolledExpanded(next)
    onExpand(table.id, next)
    onSelect?.(table.id)
  }

  return (
    <Card
      data-table-id={table.id}
      data-region="table-node"
      className={className}
      $selected={isSelected}
      $dragging={dragging}
      $searchMatch={isSearchMatch && !isSelected}
      style={{
        left: table.position.x,
        top: table.position.y,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(table.id)
      }}
    >
      {/* Source strip + icon — drag handle when canvas provides handler */}
      <SourceHeader
        $active={isSelected}
        onPointerDown={(e) => onPointerDownDrag?.(e, table.id)}
      >
        <SourceLeft>
          <SourceTypeIcon type={table.sourceType} className="h-3.5 w-3.5" />
          <span
            style={
              {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              } satisfies CSSProperties
            }
          >
            {table.sourceLabel}
          </span>
        </SourceLeft>
      </SourceHeader>

      {/* Table name + dedicated expand/collapse control */}
      <TitleBar>
        <TableNameBtn
          type="button"
          title={table.name}
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.(table.id)
          }}
        >
          {table.name}
        </TableNameBtn>
        <Badge>{table.entityKind ?? 'TABLE'}</Badge>
        <ExpandToggle
          type="button"
          $open={isExpanded}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse columns' : 'Expand columns'}
          onClick={handleExpandToggle}
        >
          ▸
        </ExpandToggle>
      </TitleBar>

      {isExpanded ? (
        <ColumnList>
          {table.columns.map((col) => (
            <ColumnRow
              key={col.id}
              data-column-id={col.id}
              $selected={
                selectedColumnId === col.id ||
                Boolean(matchedColumnIds?.has(col.id))
              }
              onMouseEnter={() => setHoveredColumnId(col.id)}
              onMouseLeave={() => setHoveredColumnId(null)}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(table.id)
                onSelectColumn(table.id, col.id)
              }}
            >
              <TypeIconWrap title={col.dataType}>
                <ColumnTypeIcon dataType={col.dataType} />
              </TypeIconWrap>
              <ColName>
                {col.name}
                <TypeMuted>{col.dataType}</TypeMuted>
              </ColName>
              <KeyIconWrap>
                <ColumnKeyIcon kind={col.keyKind} />
              </KeyIconWrap>

              {/* Hover tooltip: PK/FK, samples, description */}
              {hoveredColumnId === col.id ? (
                <ColumnTooltip column={col} />
              ) : null}
            </ColumnRow>
          ))}
        </ColumnList>
      ) : (
        <ExpandHint onClick={handleExpandToggle} style={{ cursor: 'pointer' }}>
          {table.columns.length} cols · expand
        </ExpandHint>
      )}
    </Card>
  )
}

/** Re-export sample for isolated demos / docs */
export { SAMPLE_TABLE_NODE }

export default TableNode
