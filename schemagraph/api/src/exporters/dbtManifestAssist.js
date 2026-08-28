/**
 * S4.3 — dbt manifest assist v2 (table + column lineage overlay).
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
      const depName =
        depNode?.alias || depNode?.name || String(dep).split('.').pop()
      if (name && depName) {
        edges.push({ from: depName, to: name, kind: 'dbt_ref' })
      }
    }
  }
  return edges
}

/**
 * Column refs inferred from manifest node columns + ref edges.
 */
export function extractDbtColumnRefs(manifest) {
  const nodes = manifest?.nodes || {}
  const refs = []
  for (const node of Object.values(nodes)) {
    if (!node || typeof node !== 'object') continue
    const model = node.alias || node.name
    const cols = node.columns || {}
    for (const col of Object.values(cols)) {
      if (!col?.name) continue
      refs.push({
        model,
        column: col.name,
        description: col.description || '',
        kind: 'dbt_column',
      })
    }
    for (const dep of node.depends_on?.nodes || []) {
      const depNode = nodes[dep]
      const fromModel = depNode?.alias || depNode?.name
      if (fromModel && model) {
        refs.push({
          fromModel,
          toModel: model,
          column: '*',
          kind: 'dbt_model_ref',
        })
      }
    }
  }
  return refs
}

export async function getLatestDbtManifestAssist(workspaceId) {
  const { rows } = await query(
    `SELECT id, label, graph_json, created_at
     FROM schema_snapshots
     WHERE workspace_id = $1 AND graph_json->>'kind' = 'dbt_manifest_assist'
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId],
  )
  if (!rows[0]) return null
  const g = rows[0].graph_json || {}
  return {
    id: rows[0].id,
    label: rows[0].label,
    ingestedAt: g.ingestedAt || rows[0].created_at,
    edgeCount: g.edgeCount || 0,
    matchedTables: g.matchedTables || 0,
    columnRefCount: g.columnRefCount || 0,
    samples: g.samples || [],
    columnSamples: g.columnSamples || [],
  }
}

/**
 * Ingest manifest — enrich Que lineage with dbt ref + column metadata.
 */
export async function ingestDbtManifest(workspaceId, manifest) {
  const edges = extractDbtEdges(manifest)
  const columnRefs = extractDbtColumnRefs(manifest)
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

  const columnSamples = columnRefs
    .filter((c) => c.kind === 'dbt_column')
    .slice(0, 60)
    .map((c) => ({
      model: c.model,
      column: c.column,
    }))

  await query(
    `INSERT INTO schema_snapshots (id, workspace_id, label, graph_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      randomUUID(),
      workspaceId,
      `dbt-manifest-${new Date().toISOString().slice(0, 19)}`,
      JSON.stringify({
        kind: 'dbt_manifest_assist',
        version: 2,
        edgeCount: edges.length,
        matchedTables: matched,
        columnRefCount: columnRefs.length,
        samples: samples.slice(0, 40),
        columnSamples,
        ingestedAt: new Date().toISOString(),
      }),
    ],
  )

  return {
    edges: edges.length,
    matchedTables: matched,
    columnRefCount: columnRefs.length,
    samples: samples.slice(0, 20),
    columnSamples: columnSamples.slice(0, 15),
  }
}
