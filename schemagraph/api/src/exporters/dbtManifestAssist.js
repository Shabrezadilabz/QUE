/**
 * dbt manifest assisted joins — parse nodes/sources for ref edges & columns.
 */
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { leafName, norm } from '../inferJoins.js'

/**
 * @param {object} manifest — dbt manifest.json
 * @returns {Array<{ from: string, to: string, kind: string }>}
 */
export function extractDbtEdges(manifest) {
  const nodes = manifest?.nodes || {}
  const edges = []
  for (const node of Object.values(nodes)) {
    if (!node || typeof node !== 'object') continue
    const name = node.alias || node.name
    const depends = node.depends_on?.nodes || []
    for (const dep of depends) {
      const depNode = nodes[dep]
      const depName = depNode?.alias || depNode?.name || String(dep).split('.').pop()
      if (name && depName) {
        edges.push({ from: depName, to: name, kind: 'dbt_ref' })
      }
    }
  }
  return edges
}

/**
 * Soft-suggest table-level lineage (not column joins) as notes on relationships
 * when matching tables exist; also returns parse summary for UI.
 */
export async function ingestDbtManifest(workspaceId, manifest) {
  const edges = extractDbtEdges(manifest)
  const { rows: tables } = await query(
    `SELECT id, name FROM schema_objects WHERE workspace_id = $1`,
    [workspaceId],
  )
  const byName = new Map(
    tables.map((t) => [norm(leafName(t.name)), t.id]),
  )

  let matched = 0
  const samples = []
  for (const e of edges.slice(0, 200)) {
    const fromId = byName.get(norm(e.from))
    const toId = byName.get(norm(e.to))
    if (fromId && toId) {
      matched += 1
      samples.push({ from: e.from, to: e.to, kind: e.kind })
    }
  }

  // Persist as workspace doc chunk-ish note via schema_snapshots? Keep lightweight:
  await query(
    `INSERT INTO schema_snapshots (id, workspace_id, label, graph_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      randomUUID(),
      workspaceId,
      `dbt-manifest-${new Date().toISOString().slice(0, 19)}`,
      JSON.stringify({
        kind: 'dbt_manifest_assist',
        edgeCount: edges.length,
        matchedTables: matched,
        samples: samples.slice(0, 40),
        ingestedAt: new Date().toISOString(),
      }),
    ],
  )

  return {
    edges: edges.length,
    matchedTables: matched,
    samples: samples.slice(0, 20),
  }
}
