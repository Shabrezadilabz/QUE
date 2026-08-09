import { useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import styled, { css } from 'styled-components'
import type { SchemaColumn, SchemaTable } from '@/types/schema'
import {
  COLUMN_LIST_PADDING_Y,
  COLUMN_ROW_HEIGHT,
  TABLE_NODE_HEADER_HEIGHT,
  TABLE_NODE_WIDTH,
} from '@/components/canvas/layoutMetrics'
import { SourceTypeIcon } from '@/components/sidebar/SourceTypeIcon'
import {
  ColumnKeyIcon,
  keyKindLabel,
} from '@/components/canvas/ColumnIcons'
import { SAMPLE_TABLE_NODE } from '@/data/dummySchema'

/* Technical node — dark IDE tonal card (DESIGN.md) */

export interface TableNodeProps {
  table: SchemaTable
  isSelected: boolean
  onExpand: (tableId: string, expanded: boolean) => void
  onSelectColumn: (tableId: string, columnId: string) => void
  isExpanded?: boolean
  selectedColumnId?: string | null
  isSearchMatch?: boolean
  matchedColumnIds?: Set<string>
  onSelect?: (tableId: string) => void
  dragging?: boolean
  onPointerDownDrag?: (e: ReactPointerEvent, tableId: string) => void
  className?: string
}

function headerTone(sourceType: string, selected: boolean): {
  bg: string
  fg: string
  muted: string
} {
  if (selected) {
    return { bg: 'rgba(123,208,255,0.18)', fg: '#7bd0ff', muted: 'rgba(123,208,255,0.7)' }
  }
  switch (sourceType) {
    case 'mongodb':
    case 'databricks':
      return { bg: 'rgba(78,222,163,0.08)', fg: '#d3e4fe', muted: '#c6c6cd' }
    case 'snowflake':
      return { bg: 'rgba(123,208,255,0.08)', fg: '#d3e4fe', muted: '#c6c6cd' }
    default:
      return { bg: 'rgba(38,54,74,0.9)', fg: '#d3e4fe', muted: '#c6c6cd' }
  }
}

const Card = styled.div<{
  $selected: boolean
  $dragging: boolean
  $searchMatch: boolean
}>`
  position: absolute;
  width: ${TABLE_NODE_WIDTH}px;
  background: #0b1c30;
  border-radius: 0.5rem;
  overflow: hidden;
  border: ${({ $selected, $searchMatch }) =>
    $selected
      ? '1px solid rgba(123, 208, 255, 0.55)'
      : $searchMatch
        ? '1px solid rgba(78, 222, 163, 0.55)'
        : '1px solid #45464d'};
  box-shadow: ${({ $selected }) =>
    $selected
      ? '0 0 0 1px rgba(123, 208, 255, 0.25), 0 0 24px rgba(123, 208, 255, 0.12)'
      : 'none'};
  cursor: default;
  user-select: none;
  z-index: ${({ $dragging, $searchMatch }) =>
    $dragging ? 30 : $searchMatch ? 15 : 5};
  transition: ${({ $dragging }) =>
    $dragging ? 'none' : 'border-color 0.12s ease, box-shadow 0.12s ease'};
  will-change: ${({ $dragging }) => ($dragging ? 'left, top' : 'auto')};

  &:hover {
    border-color: rgba(123, 208, 255, 0.45);
  }
`

const Header = styled.div<{ $bg: string; $fg: string }>`
  height: ${TABLE_NODE_HEADER_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  border-bottom: 1px solid #45464d;
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`

const HeaderLeft = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`

const TableName = styled.span`
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const HeaderAction = styled.button<{ $fg: string }>`
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: ${({ $fg }) => $fg};
  opacity: 0.7;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 4px;
  border-radius: 0.25rem;

  &:hover {
    opacity: 1;
    background: rgba(123, 208, 255, 0.12);
  }
`

const ColumnList = styled.ul`
  list-style: none;
  margin: 0;
  padding: ${COLUMN_LIST_PADDING_Y}px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const ColumnRow = styled.li<{ $selected: boolean }>`
  position: relative;
  height: ${COLUMN_ROW_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border-radius: 0.25rem;
  cursor: pointer;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  color: ${({ $selected }) => ($selected ? '#7bd0ff' : '#c6c6cd')};

  ${({ $selected }) =>
    $selected &&
    css`
      background: rgba(123, 208, 255, 0.12);
    `}

  &:hover {
    background: rgba(38, 54, 74, 0.9);
    color: #d3e4fe;
  }
`

const ColLeft = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
`

const ColName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TypeMuted = styled.span`
  flex-shrink: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: #909097;
`

const KeyWrap = styled.span`
  display: inline-flex;
  color: #4edea3;
  flex-shrink: 0;
`

const ExpandHint = styled.div`
  padding: 8px 16px 14px;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: #909097;
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
  background: #1b2b3f;
  border: 1px solid #45464d;
  border-radius: 0.375rem;
  box-shadow: none;
  pointer-events: none;
  text-align: left;
`

const TipTitle = styled.div`
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: #7bd0ff;
  margin-bottom: 6px;
`

const TipMeta = styled.div`
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: #c6c6cd;
  text-transform: uppercase;
  margin-bottom: 4px;
`

const TipBody = styled.p`
  margin: 0 0 8px;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 11px;
  line-height: 1.4;
  color: #d3e4fe;
`

function ColumnTooltip({ column }: { column: SchemaColumn }) {
  const keyLabel = keyKindLabel(column.keyKind)
  return (
    <Tooltip role="tooltip" data-region="column-tooltip">
      <TipTitle>
        {column.name}
        <TypeMuted style={{ marginLeft: 6 }}> {column.dataType}</TypeMuted>
      </TipTitle>
      {keyLabel ? <TipMeta>{keyLabel}</TipMeta> : null}
      {column.references ? <TipMeta>→ {column.references}</TipMeta> : null}
      {column.nullable !== undefined ? (
        <TipMeta>{column.nullable ? 'NULLABLE' : 'NOT NULL'}</TipMeta>
      ) : null}
      {column.description ? <TipBody>{column.description}</TipBody> : null}
    </Tooltip>
  )
}

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
  const tone = headerTone(table.sourceType, isSelected)

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
      <Header
        $bg={tone.bg}
        $fg={tone.fg}
        onPointerDown={(e) => onPointerDownDrag?.(e, table.id)}
      >
        <HeaderLeft>
          <SourceTypeIcon type={table.sourceType} className="h-4 w-4 shrink-0" />
          <TableName title={table.name}>{table.name}</TableName>
        </HeaderLeft>
        <HeaderAction
          type="button"
          $fg={tone.fg}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse columns' : 'Expand columns'}
          onClick={handleExpandToggle}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isExpanded ? '▾' : '▸'}
        </HeaderAction>
      </Header>

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
              <ColLeft>
                <KeyWrap>
                  <ColumnKeyIcon kind={col.keyKind} />
                </KeyWrap>
                <ColName>{col.name}</ColName>
              </ColLeft>
              <TypeMuted>
                {col.keyKind === 'pk'
                  ? 'pk'
                  : col.keyKind === 'fk'
                    ? 'fk'
                    : col.dataType}
              </TypeMuted>

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

export { SAMPLE_TABLE_NODE }

export default TableNode
