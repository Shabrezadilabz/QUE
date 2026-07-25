import type { DiagramFilters } from '@/types/topBar'
import type { SchemaRelationship, SchemaTable } from '@/types/schema'
import { toRelationshipLineModel } from '@/components/canvas/RelationshipLine'

/**
 * Apply TopBar filters to tables / relationships and compute visibility.
 * Used by layout (counts) and MainCanvas (render + highlight).
 */
export function filterDiagramData(
  tables: SchemaTable[],
  relationships: SchemaRelationship[],
  filters: DiagramFilters,
  opts?: { connectionId?: string | null },
): {
  visibleTables: SchemaTable[]
  visibleRelationships: SchemaRelationship[]
  /** Table ids that match the search query (for highlight) */
  matchedTableIds: Set<string>
  /** Column ids that match the search query */
  matchedColumnIds: Set<string>
} {
  const q = filters.searchQuery.trim().toLowerCase()
  const connectionId = opts?.connectionId ?? null

  const matchedTableIds = new Set<string>()
  const matchedColumnIds = new Set<string>()

  const bySource = tables.filter((t) => {
    if (connectionId && t.sourceId !== connectionId) {
      return false
    }
    if (filters.sourceType !== 'all' && t.sourceType !== filters.sourceType) {
      return false
    }
    return true
  })

  const visibleTables = bySource.filter((t) => {
    if (!q) return true
    const nameHit = t.name.toLowerCase().includes(q)
    const colHits = t.columns.filter((c) => c.name.toLowerCase().includes(q))
    if (nameHit) matchedTableIds.add(t.id)
    for (const c of colHits) matchedColumnIds.add(c.id)
    if (nameHit || colHits.length > 0) {
      matchedTableIds.add(t.id)
      return true
    }
    // When searching, hide non-matching tables
    return false
  })

  // If no search, still track nothing special; all source-filtered tables show
  const tableIdSet = new Set(
    (q ? visibleTables : bySource).map((t) => t.id),
  )
  const tablesForRels = q ? visibleTables : bySource

  if (!q) {
    // no search highlight
  } else {
    for (const t of tablesForRels) {
      if (t.name.toLowerCase().includes(q)) matchedTableIds.add(t.id)
      for (const c of t.columns) {
        if (c.name.toLowerCase().includes(q)) {
          matchedTableIds.add(t.id)
          matchedColumnIds.add(c.id)
        }
      }
    }
  }

  const visibleRelationships = relationships.filter((rel) => {
    if (!tableIdSet.has(rel.fromTableId) || !tableIdSet.has(rel.toTableId)) {
      return false
    }
    const model = toRelationshipLineModel(rel)
    if (
      filters.relationshipType !== 'all' &&
      model.type !== filters.relationshipType
    ) {
      return false
    }
    if (model.confidence < filters.minConfidence) {
      return false
    }
    return true
  })

  return {
    visibleTables: q ? visibleTables : bySource,
    visibleRelationships,
    matchedTableIds,
    matchedColumnIds,
  }
}
