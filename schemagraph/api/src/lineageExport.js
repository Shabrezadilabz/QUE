/**
 * S7.3 — Lineage export bundle (column graph + BI + dbt + column impact).
 */
import { query } from './db.js'
import { getColumnLineage } from './columnLineage.js'
import { getWorkspaceLineageLite } from './lineageLite.js'
import { listLatestBiLineage } from './exporters/biLineage.js'
import { getOpenHighDrift } from './contracts/contractFreeze.js'
import { listBiCharts } from './certifiedBi.js'
import { recordAuditEvent } from './auditLog.js'

async function loadDbtManifestAssist(workspaceId) {
  const { rows } = await query(
    `SELECT graph_json, created_at FROM schema_snapshots
     WHERE workspace_id = $1 AND graph_json->>'kind' = 'dbt_manifest_assist'
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  )
  if (!rows[0]) return null
  const g = rows[0].graph_json || {}
  return {
    ingestedAt: rows[0].created_at,
    modelCount: g.modelCount ?? (g.models || []).length ?? 0,
    edgeCount: g.edgeCount ?? (g.samples || []).length ?? 0,
    samples: (g.samples || []).slice(0, 200),
    columnSamples: (g.columnSamples || []).slice(0, 300),
  }
}

/**
 * Build a portable lineage export bundle for compliance / Atlan-lite handoff.
 */
export async function buildLineageExportBundle(workspaceId, opts = {}) {
  const table = opts.table ? String(opts.table) : null
  const column = opts.column ? String(opts.column) : null

  const [columnGraph, lite, biLineage, dbtAssist, driftOpen, charts] =
    await Promise.all([
      getColumnLineage(workspaceId, {
        table,
        column,
        direction: 'both',
        maxHops: opts.maxHops || 4,
      }),
      getWorkspaceLineageLite(workspaceId, { limit: 40 }).catch(() => null),
      listLatestBiLineage(workspaceId).catch(() => null),
      loadDbtManifestAssist(workspaceId),
      getOpenHighDrift(workspaceId).catch(() => []),
      listBiCharts(workspaceId).catch(() => []),
    ])

  const columnImpact = (driftOpen || [])
    .filter((d) =>
      /column|type_change|nullable|join_broken|broken.?join/i.test(
        `${d.code || ''} ${d.summary || ''}`,
      ),
    )
    .slice(0, 80)
    .map((d) => ({
      id: d.id,
      code: d.code,
      severity: d.severity,
      summary: d.summary,
      acknowledged: Boolean(d.acknowledged),
    }))

  const bundle = {
    exportedAt: new Date().toISOString(),
    workspaceId,
    brand: 'Que',
    note: 'Lineage bundle: promoted joins + dbt manifest assist + BI reverse lineage + open column-impact drift.',
    columnLineage: {
      start: columnGraph.start,
      summary: columnGraph.summary,
      downstream: columnGraph.downstream,
      upstream: columnGraph.upstream,
      edges: columnGraph.edges,
    },
    jobPaths: lite?.paths || [],
    biLineage: biLineage || { links: [], tool: null },
    biCharts: (charts || [])
      .filter((c) => c.certified)
      .slice(0, 100)
      .map((c) => ({
        id: c.id,
        title: c.title,
        chartType: c.chartType,
        datasetId: c.datasetId,
        reportId: c.config?.reportId || null,
      })),
    dbtManifestAssist: dbtAssist,
    columnImpactDrift: columnImpact,
    stats: {
      joinEdges: columnGraph.summary?.joinEdges ?? 0,
      dbtEdges: columnGraph.summary?.dbtEdges ?? 0,
      biEdges: columnGraph.summary?.biEdges ?? 0,
      jobPaths: (lite?.paths || []).length,
      openColumnDrift: columnImpact.length,
      certifiedCharts: (charts || []).filter((c) => c.certified).length,
    },
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: opts.userId ?? null,
    action: 'lineage.export',
    resourceType: 'workspace',
    resourceId: workspaceId,
    summary: `Lineage export bundle (${bundle.stats.joinEdges} join edges, ${bundle.stats.jobPaths} job paths)`,
    meta: bundle.stats,
  })

  return bundle
}

export function formatLineageExportMarkdown(bundle) {
  const s = bundle.stats || {}
  return `# Que lineage export

Exported: ${bundle.exportedAt}

| Signal | Count |
|--------|------:|
| Promoted join edges | ${s.joinEdges ?? 0} |
| dbt manifest edges | ${s.dbtEdges ?? 0} |
| BI reverse links | ${s.biEdges ?? 0} |
| Job paths | ${s.jobPaths ?? 0} |
| Open column-impact drift | ${s.openColumnDrift ?? 0} |
| Certified BI charts | ${s.certifiedCharts ?? 0} |

Open column-impact drift items block attested export until acknowledged.
`
}
