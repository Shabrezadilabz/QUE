/**
 * Thin BI reverse-lineage ingest (Looker/Tableau/Power BI exports).
 * Accepts a simple JSON shape — not a full Atlan BI crawler.
 *
 * Expected body:
 * {
 *   tool: 'looker' | 'tableau' | 'powerbi' | 'other',
 *   assets: [{ name, dependsOn: ['schema.table', ...] }]
 * }
 */
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { leafName, norm } from '../inferJoins.js'

export async function ingestBiLineage(workspaceId, payload = {}) {
  const tool = String(payload.tool || 'other').toLowerCase()
  const assets = Array.isArray(payload.assets) ? payload.assets : []
  const { rows: tables } = await query(
    `SELECT id, name FROM schema_objects WHERE workspace_id = $1`,
    [workspaceId],
  )
  const byName = new Map(
    tables.map((t) => [norm(leafName(t.name)), { id: t.id, name: t.name }]),
  )

  const links = []
  for (const asset of assets.slice(0, 500)) {
    const assetName = String(asset.name || asset.title || '').trim()
    const deps = Array.isArray(asset.dependsOn)
      ? asset.dependsOn
      : Array.isArray(asset.tables)
        ? asset.tables
        : []
    for (const dep of deps) {
      const tableKey = norm(leafName(String(dep)))
      const hit = byName.get(tableKey)
      if (hit && assetName) {
        links.push({
          asset: assetName,
          table: hit.name,
          tableId: hit.id,
          tool,
        })
      }
    }
  }

  await query(
    `INSERT INTO schema_snapshots (id, workspace_id, label, graph_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      randomUUID(),
      workspaceId,
      `bi-lineage-${tool}-${new Date().toISOString().slice(0, 19)}`,
      JSON.stringify({
        kind: 'bi_reverse_lineage',
        tool,
        linkCount: links.length,
        links: links.slice(0, 200),
        ingestedAt: new Date().toISOString(),
      }),
    ],
  )

  return {
    tool,
    assets: assets.length,
    linked: links.length,
    preview: links.slice(0, 25),
  }
}

export async function listLatestBiLineage(workspaceId) {
  const { rows } = await query(
    `SELECT id, label, graph_json, created_at
     FROM schema_snapshots
     WHERE workspace_id = $1
       AND graph_json->>'kind' = 'bi_reverse_lineage'
     ORDER BY created_at DESC
     LIMIT 5`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
    ...(r.graph_json || {}),
  }))
}
