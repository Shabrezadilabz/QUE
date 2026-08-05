/**
 * Wave 3.4 — lineage lite: Sources → joins → job → export / materialize.
 * Assembles existing Que metadata only (no warehouse crawl).
 */
import { query } from './db.js'

function asArray(v) {
  if (Array.isArray(v)) return v
  if (v == null) return []
  return []
}

/**
 * @param {string} workspaceId
 * @param {{ jobId?: string, limit?: number }} [opts]
 */
export async function getWorkspaceLineageLite(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100)
  const jobFilter = opts.jobId ? String(opts.jobId) : null

  const [connRes, joinRes, jobRes, exportRes, matRes, artRes] =
    await Promise.all([
      query(
        `SELECT id, name, source_type, status, last_sync_at
         FROM connections
         WHERE workspace_id = $1
         ORDER BY name`,
        [workspaceId],
      ),
      query(
        `SELECT r.id, r.status, r.label, r.join_criteria, r.confidence,
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
         ORDER BY r.updated_at DESC
         LIMIT 300`,
        [workspaceId],
      ),
      query(
        `SELECT id, title, status, sources, tables, joins_snapshot,
                relationship_ids, updated_at, created_at
         FROM jobs
         WHERE workspace_id = $1
           AND ($2::uuid IS NULL OR id = $2::uuid)
           AND status <> 'archived'
         ORDER BY updated_at DESC
         LIMIT $3`,
        [workspaceId, jobFilter, limit],
      ),
      query(
        `SELECT DISTINCT ON (job_id)
            id, job_id, format, fingerprint, created_at, github_pr_url
         FROM export_audit_events
         WHERE workspace_id = $1 AND job_id IS NOT NULL
         ORDER BY job_id, created_at DESC`,
        [workspaceId],
      ),
      query(
        `SELECT id, job_id, object_kind, qualified_name, status, created_at,
                connection_id
         FROM job_materializations
         WHERE workspace_id = $1 AND status = 'succeeded'
         ORDER BY created_at DESC
         LIMIT 200`,
        [workspaceId],
      ),
      query(
        `SELECT id, job_id, format, filename, expires_at, revoked_at,
                download_count, created_at
         FROM export_artifacts
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [workspaceId],
      ),
    ])

  const connections = connRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.source_type,
    status: r.status,
    lastSyncAt: r.last_sync_at
      ? new Date(r.last_sync_at).toISOString()
      : null,
  }))
  const connByName = new Map(
    connections.map((c) => [String(c.name).toLowerCase(), c]),
  )

  const joins = joinRes.rows.map((r) => ({
    id: r.id,
    label: r.label || `${r.from_table}.${r.from_column} → ${r.to_table}.${r.to_column}`,
    from: {
      table: r.from_table,
      column: r.from_column,
      connection: r.from_connection,
    },
    to: {
      table: r.to_table,
      column: r.to_column,
      connection: r.to_connection,
    },
    confidence: r.confidence,
  }))
  const joinById = new Map(joins.map((j) => [j.id, j]))

  const exportsByJob = new Map()
  for (const r of exportRes.rows) {
    if (!exportsByJob.has(r.job_id)) {
      exportsByJob.set(r.job_id, {
        id: r.id,
        format: r.format,
        fingerprint: r.fingerprint,
        githubPrUrl: r.github_pr_url || null,
        createdAt: new Date(r.created_at).toISOString(),
      })
    }
  }

  const matsByJob = new Map()
  for (const r of matRes.rows) {
    const list = matsByJob.get(r.job_id) || []
    list.push({
      id: r.id,
      kind: r.object_kind,
      qualifiedName: r.qualified_name,
      connectionId: r.connection_id,
      createdAt: new Date(r.created_at).toISOString(),
    })
    matsByJob.set(r.job_id, list)
  }

  const artsByJob = new Map()
  for (const r of artRes.rows) {
    if (!r.job_id) continue
    const list = artsByJob.get(r.job_id) || []
    const active =
      !r.revoked_at &&
      r.expires_at &&
      new Date(r.expires_at).getTime() > Date.now()
    list.push({
      id: r.id,
      format: r.format,
      filename: r.filename,
      active,
      downloadCount: Number(r.download_count) || 0,
      expiresAt: r.expires_at
        ? new Date(r.expires_at).toISOString()
        : null,
      createdAt: new Date(r.created_at).toISOString(),
    })
    artsByJob.set(r.job_id, list)
  }

  const paths = jobRes.rows.map((job) => {
    const sourceNames = asArray(job.sources).map(String)
    const tables = asArray(job.tables).map(String)
    const snapshot = asArray(job.joins_snapshot)
    const relIds = asArray(job.relationship_ids).map(String)

    const pathJoins =
      snapshot.length > 0
        ? snapshot.map((j) => ({
            id: j.id || null,
            label:
              j.label ||
              `${j.fromTable || j.from_table || '?'}.${j.fromColumn || j.from_column || '?'} → ${j.toTable || j.to_table || '?'}.${j.toColumn || j.to_column || '?'}`,
            fromTable: j.fromTable || j.from_table || null,
            toTable: j.toTable || j.to_table || null,
            frozen: true,
          }))
        : relIds
            .map((id) => joinById.get(id))
            .filter(Boolean)
            .map((j) => ({
              id: j.id,
              label: j.label,
              fromTable: j.from.table,
              toTable: j.to.table,
              frozen: false,
            }))

    const pathSources = sourceNames.map((name) => {
      const hit = connByName.get(name.toLowerCase())
      return hit
        ? { id: hit.id, name: hit.name, type: hit.type, status: hit.status }
        : { id: null, name, type: null, status: null }
    })

    // Infer sources from join endpoints when job.sources empty
    if (pathSources.length === 0 && pathJoins.length > 0) {
      const names = new Set()
      for (const j of pathJoins) {
        const full = joinById.get(j.id)
        if (full?.from?.connection) names.add(full.from.connection)
        if (full?.to?.connection) names.add(full.to.connection)
      }
      for (const name of names) {
        const hit = connByName.get(String(name).toLowerCase())
        if (hit) {
          pathSources.push({
            id: hit.id,
            name: hit.name,
            type: hit.type,
            status: hit.status,
          })
        }
      }
    }

    const latestExport = exportsByJob.get(job.id) || null
    const materializations = matsByJob.get(job.id) || []
    const artifacts = (artsByJob.get(job.id) || []).slice(0, 5)

    const stages = [
      {
        key: 'sources',
        label: 'Sources',
        count: pathSources.length,
        ready: pathSources.length > 0,
      },
      {
        key: 'joins',
        label: 'Joins',
        count: pathJoins.length,
        ready: pathJoins.length > 0,
      },
      {
        key: 'job',
        label: 'Job',
        count: 1,
        ready: true,
      },
      {
        key: 'ship',
        label: 'Export / table',
        count:
          (latestExport ? 1 : 0) +
          materializations.length +
          artifacts.filter((a) => a.active).length,
        ready: Boolean(latestExport || materializations.length),
      },
    ]

    return {
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        updatedAt: job.updated_at
          ? new Date(job.updated_at).toISOString()
          : null,
      },
      stages,
      sources: pathSources,
      joins: pathJoins,
      tables,
      export: latestExport,
      materializations,
      artifacts,
      complete: stages.every((s) => s.ready),
    }
  })

  const jobSourceNames = new Set()
  for (const p of paths) {
    for (const s of p.sources) jobSourceNames.add(String(s.name).toLowerCase())
  }
  const unusedSources = connections.filter(
    (c) => !jobSourceNames.has(String(c.name).toLowerCase()),
  )

  return {
    ok: true,
    note: 'Lineage lite — Que metadata graph only (sources → promoted joins → jobs → attested export / customer warehouse objects).',
    summary: {
      sources: connections.length,
      acceptedJoins: joins.length,
      jobs: paths.length,
      exported: paths.filter((p) => p.export).length,
      materialized: paths.filter((p) => p.materializations.length > 0).length,
      completePaths: paths.filter((p) => p.complete).length,
    },
    paths,
    unusedSources: unusedSources.slice(0, 20),
    joins: joins.slice(0, 50),
  }
}
