import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  DataConnection,
  DiagramSelection,
  DiagramViewport,
} from '@/types/diagram'
import type { DiagramFilters } from '@/types/topBar'
import { DEFAULT_DIAGRAM_FILTERS } from '@/types/topBar'
import type { SchemaTable, TablePosition } from '@/types/schema'
import { DUMMY_TABLES } from '@/data/dummySchema'

/** tableId → world position (source of truth for drag-and-drop) */
export type TablePositionMap = Record<string, TablePosition>

function positionsFromTables(tables: SchemaTable[]): TablePositionMap {
  const map: TablePositionMap = {}
  for (const t of tables) {
    map[t.id] = { ...t.position }
  }
  return map
}

interface DiagramContextValue {
  selection: DiagramSelection
  viewport: DiagramViewport
  connections: DataConnection[]
  showRightSidebar: boolean
  filters: DiagramFilters
  /**
   * POSITION STORE — TableNode drag writes here via setTablePosition.
   * MainCanvas merges these onto SchemaTable.position for render + SVG edges.
   */
  tablePositions: TablePositionMap
  snapToGridEnabled: boolean
  selectTable: (tableId: string | null) => void
  selectColumn: (columnId: string | null) => void
  selectConnection: (connectionId: string | null) => void
  setViewport: (viewport: Partial<DiagramViewport>) => void
  setShowRightSidebar: (open: boolean) => void
  setConnections: (connections: DataConnection[]) => void
  setFilters: (next: DiagramFilters | ((prev: DiagramFilters) => DiagramFilters)) => void
  patchFilters: (partial: Partial<DiagramFilters>) => void
  /** POSITION UPDATE HANDLER — single-table write (drag move/end) */
  setTablePosition: (tableId: string, position: TablePosition) => void
  /** Bulk replace (auto-layout, hydrate from API) */
  setTablePositions: (next: TablePositionMap) => void
  setSnapToGridEnabled: (enabled: boolean) => void
}

const defaultSelection: DiagramSelection = {
  tableId: null,
  columnId: null,
  connectionId: null,
}

const defaultViewport: DiagramViewport = {
  x: 0,
  y: 0,
  zoom: 1,
}

const DiagramContext = createContext<DiagramContextValue | null>(null)

interface DiagramProviderProps {
  children: ReactNode
  initialConnections?: DataConnection[]
  /** Seed positions (defaults to DUMMY_TABLES) */
  initialTables?: SchemaTable[]
}

/**
 * Diagram workspace state (selection, viewport, positions, filters).
 */
export function DiagramProvider({
  children,
  initialConnections = [],
  initialTables = DUMMY_TABLES,
}: DiagramProviderProps) {
  const [selection, setSelection] = useState<DiagramSelection>(defaultSelection)
  const [viewport, setViewportState] = useState<DiagramViewport>(defaultViewport)
  const [connections, setConnections] = useState<DataConnection[]>(initialConnections)
  const [showRightSidebar, setShowRightSidebar] = useState(true)
  const [filters, setFilters] = useState<DiagramFilters>(DEFAULT_DIAGRAM_FILTERS)
  const [tablePositions, setTablePositionsState] = useState<TablePositionMap>(() =>
    positionsFromTables(initialTables),
  )
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true)

  const selectTable = useCallback((tableId: string | null) => {
    setSelection((prev) => ({
      ...prev,
      tableId,
      columnId: null,
    }))
    if (tableId) setShowRightSidebar(true)
  }, [])

  const selectColumn = useCallback((columnId: string | null) => {
    setSelection((prev) => ({ ...prev, columnId }))
  }, [])

  const selectConnection = useCallback((connectionId: string | null) => {
    setSelection((prev) => ({ ...prev, connectionId }))
  }, [])

  const setViewport = useCallback((next: Partial<DiagramViewport>) => {
    setViewportState((prev) => ({ ...prev, ...next }))
  }, [])

  const patchFilters = useCallback((partial: Partial<DiagramFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
  }, [])

  /** POSITION UPDATE HANDLER — used by useTableNodeDrag on move/end */
  const setTablePosition = useCallback(
    (tableId: string, position: TablePosition) => {
      setTablePositionsState((prev) => {
        const cur = prev[tableId]
        if (cur && cur.x === position.x && cur.y === position.y) return prev
        return { ...prev, [tableId]: position }
      })
    },
    [],
  )

  const setTablePositions = useCallback((next: TablePositionMap) => {
    setTablePositionsState(next)
  }, [])

  const value = useMemo<DiagramContextValue>(
    () => ({
      selection,
      viewport,
      connections,
      showRightSidebar,
      filters,
      tablePositions,
      snapToGridEnabled,
      selectTable,
      selectColumn,
      selectConnection,
      setViewport,
      setShowRightSidebar,
      setConnections,
      setFilters,
      patchFilters,
      setTablePosition,
      setTablePositions,
      setSnapToGridEnabled,
    }),
    [
      selection,
      viewport,
      connections,
      showRightSidebar,
      filters,
      tablePositions,
      snapToGridEnabled,
      selectTable,
      selectColumn,
      selectConnection,
      setViewport,
      patchFilters,
      setTablePosition,
      setTablePositions,
    ],
  )

  return (
    <DiagramContext.Provider value={value}>{children}</DiagramContext.Provider>
  )
}

export function useDiagram(): DiagramContextValue {
  const ctx = useContext(DiagramContext)
  if (!ctx) {
    throw new Error('useDiagram must be used within a DiagramProvider')
  }
  return ctx
}
