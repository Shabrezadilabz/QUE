/**
 * S4.4 — No lock-in export kit (graph, jobs, metrics, audit trail).
 */
import { query } from '../db.js'
import { listJobs } from '../jobs.js'
import { listMetrics } from '../metricDefinitions.js'
import { listAuditEvents } from '../auditLog.js'
import { listBiCharts } from '../certifiedBi.js'
import { getLatestPackCertification } from '../packCertification.js'
import { getWorkspaceSettings } from '../workspaceSettings.js'
import { loadAcceptedJoins } from './dbtBundle.js'
import { buildSchemaOnlyAttestation } from './attestation.js'

async function loadWorkspaceGraph(workspaceId) {
  const { rows: tables } = await query(
    `SELECT o.id, o.name, o.entity_kind, o.source_label,
            c.name AS connection_name, c.type AS connection_type
     FROM schema_objects o
     LEFT JOIN connections c ON c.id = o.connection_id
     WHERE o.workspace_id = $1
     ORDER BY o.name
     LIMIT 500`,
    [workspaceId],
  )

  const { rows: columns } = await query(
    `SELECT col.id, col.name, col.data_type, col.schema_object_id
     FROM schema_columns col
     JOIN schema_objects o ON o.id = col.schema_object_id
     WHERE o.workspace_id = $1
     ORDER BY col.name
     LIMIT 5000`,
    [workspaceId],
  )

  const { rows: relationships } = await query(
    `SELECT r.id, r.status, r.relation_type, r.confidence, r.label,
            fo.name AS from_table, fc.name AS from_column,
            too.name AS to_table, tc.name AS to_column
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects too ON too.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1
     ORDER BY r.updated_at DESC
     LIMIT 500`,
    [workspaceId],
  )

  return {
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.entity_kind,
      connection: t.connection_name,
      connectionType: t.connection_type,
      sourceLabel: t.source_label,
    })),
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      dataType: c.data_type,
      objectId: c.schema_object_id,
    })),
    relationships: relationships.map((r) => ({
      id: r.id,
      status: r.status,
      type: r.relation_type,
      confidence: r.confidence,
      label: r.label,
      from: `${r.from_table}.${r.from_column}`,
      to: `${r.to_table}.${r.to_column}`,
    })),
  }
}

/**
 * @param {string} workspaceId
 * @param {{ packId?: string, auditLimit?: number }} [opts]
 */
export async function buildNoLockInExportKit(workspaceId, opts = {}) {
  const packId = opts.packId || 'ecommerce-v1'
  const auditLimit = Math.min(Math.max(Number(opts.auditLimit) || 500, 50), 2000)

  const [jobs, metrics, audit, charts, settings, cert, joins, graph] =
    await Promise.all([
      listJobs(workspaceId),
      listMetrics(workspaceId),
      listAuditEvents(workspaceId, { limit: auditLimit }),
      listBiCharts(workspaceId),
      getWorkspaceSettings(workspaceId),
      getLatestPackCertification(workspaceId, packId).catch(() => null),
      loadAcceptedJoins(workspaceId, []),
      loadWorkspaceGraph(workspaceId),
    ])

  const exportedAt = new Date().toISOString()
  const attestation = buildSchemaOnlyAttestation({
    workspaceId,
    job: { id: 'export-kit', title: 'No lock-in export kit' },
    joins: joins.slice(0, 100),
    format: 'no-lock-in-kit',
  })

  const manifest = {
    format: 'que_no_lock_in_v1',
    workspaceId,
    exportedAt,
    claim:
      'Portable export of Que metadata — graph, jobs, metrics, audit. No warehouse row dumps.',
    counts: {
      tables: graph.tables.length,
      relationships: graph.relationships.length,
      jobs: jobs.length,
      metrics: metrics.length,
      biCharts: charts.length,
      auditEvents: audit.length,
      acceptedJoins: joins.length,
    },
    certification: cert
      ? {
          packId: cert.packId || packId,
          status: cert.status,
          goldenRecall: cert.goldenRecall,
          certifiedAt: cert.certifiedAt,
        }
      : null,
    attestation,
  }

  const files = [
    {
      path: 'manifest.json',
      content: JSON.stringify(manifest, null, 2) + '\n',
    },
    {
      path: 'graph/tables.json',
      content: JSON.stringify(graph.tables, null, 2) + '\n',
    },
    {
      path: 'graph/relationships.json',
      content: JSON.stringify(graph.relationships, null, 2) + '\n',
    },
    {
      path: 'graph/columns.json',
      content: JSON.stringify(graph.columns, null, 2) + '\n',
    },
    {
      path: 'jobs/jobs.json',
      content:
        JSON.stringify(
          jobs.map((j) => ({
            id: j.id,
            title: j.title,
            status: j.status,
            tables: j.tables,
            sources: j.sources,
            schemaSnapshotId: j.schemaSnapshotId,
            joinCount: j.joinsSnapshot?.length || 0,
            sqlText: j.sqlText,
            updatedAt: j.updatedAt,
          })),
          null,
          2,
        ) + '\n',
    },
    {
      path: 'metrics/metrics.json',
      content: JSON.stringify(metrics, null, 2) + '\n',
    },
    {
      path: 'bi/charts.json',
      content: JSON.stringify(charts, null, 2) + '\n',
    },
    {
      path: 'audit/audit_events.json',
      content: JSON.stringify(audit, null, 2) + '\n',
    },
    {
      path: 'settings/workspace_settings.json',
      content:
        JSON.stringify(settings?.settings || {}, null, 2) + '\n',
    },
    {
      path: 'README.md',
      content: [
        '# Que no lock-in export kit',
        '',
        `Exported **${exportedAt}** from workspace \`${workspaceId}\`.`,
        '',
        '## Files',
        '',
        '| Path | Contents |',
        '|------|----------|',
        '| `graph/` | Schema tables, columns, relationships |',
        '| `jobs/` | Stitch job contracts (SQL + join snapshots) |',
        '| `metrics/` | Metric definitions |',
        '| `bi/` | Report Studio chart metadata |',
        '| `audit/` | Workspace audit trail |',
        '',
        '## Procurement note',
        '',
        'This kit proves Que does not hold your logic hostage — re-implement in dbt,',
        'Looker, or another steward tool using the exported graph and job SQL.',
        '',
        'Pair with **dbt bundle v2** export for merge-ready models + tests.',
        '',
      ].join('\n'),
    },
  ]

  return { manifest, files }
}
