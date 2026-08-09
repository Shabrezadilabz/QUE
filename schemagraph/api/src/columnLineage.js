/**
 * Phase 4 — Multi-hop column lineage across promoted joins + dbt + BI metadata.
 * Assembled from Que metadata only (no warehouse SQL parse crawl).
 */
import { query } from './db.js'
import { getWorkspaceLineageLite } from './lineageLite.js'

/**
 * Build a directed column graph from accepted joins, then BFS multi-hop.
 */
export async function getColumnLineage(workspaceId, opts = {}) {
  const startTable = opts.table ? String(opts.table) : null
  const startColumn = opts.column ? String(opts.column) : null
  const maxHops = Math.min(Math.max(Number(opts.maxHops) || 4, 1), 8)
  const direction =
    opts.direction === 'upstream' || opts.direction === 'both'
      ? opts.direction
      : 'downstream'

  const { rows: joinRows } = await query(
    `SELECT r.id,
            fo.name AS from_table, fc.name AS from_column,
            too.name AS to_table, tc.name AS to_column,
            c_from.name AS from_connection, c_to.name AS to_connection
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects too ON too.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     JOIN connections c_from ON c_from.id = fo.connection_id
     JOIN connections c_to ON c_to.id = too.connection_id
     WHERE r.workspace_id = $1 AND r.status = 'accepted'
     LIMIT 500`,
    [workspaceId],
  )

  const edges = joinRows.map((r) => ({
    id: r.id,
    kind: 'promoted_join',
    from: {
      table: r.from_table,
      column: r.from_column,
      connection: r.from_connection,
      key: `${r.from_table}.${r.from_column}`,
    },
    to: {
      table: r.to_table,
      column: r.to_column,
      connection: r.to_connection,
      key: `${r.to_table}.${r.to_column}`,
    },
  }))

  // dbt table-level edges → synthetic column * when both tables exist
  const { rows: dbtSnaps } = await query(
    `SELECT graph_json FROM schema_snapshots
     WHERE workspace_id = $1 AND graph_json->>'kind' = 'dbt_manifest_assist'
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  )
  const dbtSamples = dbtSnaps[0]?.graph_json?.samples || []
  for (const s of dbtSamples) {
    edges.push({
      id: `dbt:${s.from}->${s.to}`,
      kind: 'dbt_ref',
      from: {
        table: s.from,
        column: '*',
        connection: null,
        key: `${s.from}.*`,
      },
      to: {
        table: s.to,
        column: '*',
        connection: null,
        key: `${s.to}.*`,
      },
    })
  }

  // BI reverse lineage assets → table.*
  const { rows: biSnaps } = await query(
    `SELECT graph_json FROM schema_snapshots
     WHERE workspace_id = $1 AND graph_json->>'kind' = 'bi_reverse_lineage'
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  )
  const biLinks = biSnaps[0]?.graph_json?.links || []
  for (const link of biLinks.slice(0, 200)) {
    edges.push({
      id: `bi:${link.asset}->${link.table}`,
      kind: 'bi_asset',
      from: {
        table: link.table,
        column: '*',
        connection: null,
        key: `${link.table}.*`,
      },
      to: {
        table: link.asset,
        column: '(dashboard)',
        connection: link.tool || 'bi',
        key: `asset:${link.asset}`,
      },
    })
  }

  // Catalog asset deps
  const { rows: assetDeps } = await query(
    `SELECT a.name AS asset_name, a.kind AS asset_kind, d.table_name, d.column_name
     FROM catalog_asset_deps d
     JOIN catalog_assets a ON a.id = d.asset_id
     WHERE d.workspace_id = $1 AND a.status = 'active'
     LIMIT 300`,
    [workspaceId],
  ).catch(() => ({ rows: [] }))

  for (const d of assetDeps) {
    const col = d.column_name || '*'
    edges.push({
      id: `asset:${d.asset_name}:${d.table_name}`,
      kind: 'catalog_asset',
      from: {
        table: d.table_name,
        column: col,
        connection: null,
        key: `${d.table_name}.${col}`,
      },
      to: {
        table: d.asset_name,
        column: `(${d.asset_kind})`,
        connection: 'catalog',
        key: `asset:${d.asset_name}`,
      },
    })
  }

  const adjDown = new Map()
  const adjUp = new Map()
  for (const e of edges) {
    if (!adjDown.has(e.from.key)) adjDown.set(e.from.key, [])
    adjDown.get(e.from.key).push(e)
    if (!adjUp.has(e.to.key)) adjUp.set(e.to.key, [])
    adjUp.get(e.to.key).push(e)
  }

  function bfs(startKey, adj, reverse = false) {
    if (!startKey) return { nodes: [], pathEdges: [] }
    const seen = new Set([startKey])
    const queue = [{ key: startKey, hop: 0 }]
    const pathEdges = []
    const nodes = new Map()
    nodes.set(startKey, { key: startKey, hop: 0 })

    while (queue.length) {
      const cur = queue.shift()
      if (cur.hop >= maxHops) continue
      for (const e of adj.get(cur.key) || []) {
        const next = reverse ? e.from : e.to
        pathEdges.push({ ...e, hop: cur.hop + 1 })
        if (seen.has(next.key)) continue
        seen.add(next.key)
        nodes.set(next.key, { ...next, hop: cur.hop + 1 })
        queue.push({ key: next.key, hop: cur.hop + 1 })
      }
    }
    return { nodes: [...nodes.values()], pathEdges }
  }

  let startKey = null
  if (startTable && startColumn) {
    startKey = `${startTable}.${startColumn}`
  } else if (startTable) {
    // Prefer concrete columns on that table from edges
    const hit = edges.find(
      (e) =>
        e.from.table.toLowerCase() === startTable.toLowerCase() ||
        e.to.table.toLowerCase() === startTable.toLowerCase(),
    )
    startKey = hit
      ? hit.from.table.toLowerCase() === startTable.toLowerCase()
        ? hit.from.key
        : hit.to.key
      : `${startTable}.*`
  }

  const down =
    direction === 'upstream' ? { nodes: [], pathEdges: [] } : bfs(startKey, adjDown)
  const up =
    direction === 'downstream'
      ? { nodes: [], pathEdges: [] }
      : bfs(startKey, adjUp, true)

  const lite = await getWorkspaceLineageLite(workspaceId, { limit: 12 }).catch(
    () => null,
  )

  return {
    ok: true,
    note: 'Multi-hop column lineage from promoted joins + dbt/BI/catalog metadata (not a full SQL AST crawler).',
    start: startKey
      ? { table: startTable, column: startColumn, key: startKey }
      : null,
    maxHops,
    direction,
    summary: {
      joinEdges: joinRows.length,
      dbtEdges: dbtSamples.length,
      biEdges: biLinks.length,
      catalogEdges: assetDeps.length,
      totalEdges: edges.length,
      downstreamNodes: down.nodes.length,
      upstreamNodes: up.nodes.length,
    },
    downstream: down,
    upstream: up,
    edges: edges.slice(0, 120),
    jobPaths: lite?.paths?.slice(0, 8) || [],
  }
}
