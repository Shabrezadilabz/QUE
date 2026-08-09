/**
 * Offer B — Que Managed Data Plane.
 * Workspace-isolated job output store for customers without Databricks/Snowflake.
 * AI must NEVER read managed_dataset_rows — only schema metadata.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { recordAuditEvent } from './auditLog.js'

function slugify(name) {
  return (
    String(name || 'dataset')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'dataset'
  )
}

function mapDataset(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    description: r.description || '',
    jobId: r.job_id,
    sourceRunId: r.source_run_id || null,
    status: r.status,
    columns: Array.isArray(r.column_schema_json) ? r.column_schema_json : [],
    rowCount: Number(r.row_count || 0),
    bytesEstimate: Number(r.bytes_estimate || 0),
    certified: Boolean(r.certified),
    expiresAt: r.expires_at || null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    aiAccess: 'denied',
  }
}

export async function isManagedPlaneEnabled(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  return settings.enableManagedDataPlane === true
}

export async function getManagedPlaneQuotas(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const maxDatasets = Math.min(
    200,
    Math.max(1, Number(settings.managedMaxDatasets) || 25),
  )
  const maxRowsPerDataset = Math.min(
    100000,
    Math.max(100, Number(settings.managedMaxRowsPerDataset) || 50000),
  )
  const retentionDays = Math.min(
    365,
    Math.max(1, Number(settings.managedRetentionDays) || 90),
  )
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(row_count),0)::bigint AS rows_total
     FROM managed_datasets WHERE workspace_id = $1`,
    [workspaceId],
  )
  return {
    maxDatasets,
    maxRowsPerDataset,
    retentionDays,
    usedDatasets: rows[0]?.n || 0,
    usedRows: Number(rows[0]?.rows_total || 0),
  }
}

async function assertQuotaHeadroom(workspaceId, incomingRows, { replaceSlug = null } = {}) {
  const q = await getManagedPlaneQuotas(workspaceId)
  if (incomingRows > q.maxRowsPerDataset) {
    const err = new Error(
      `Row cap exceeded — max ${q.maxRowsPerDataset} rows per managed dataset`,
    )
    err.status = 413
    err.code = 'MANAGED_ROW_CAP'
    throw err
  }
  let count = q.usedDatasets
  if (replaceSlug) {
    const { rows } = await query(
      `SELECT id FROM managed_datasets WHERE workspace_id = $1 AND slug = $2`,
      [workspaceId, replaceSlug],
    )
    if (rows[0]) count -= 1
  }
  if (count >= q.maxDatasets) {
    const err = new Error(
      `Dataset quota exceeded — max ${q.maxDatasets} managed datasets (purge or raise managedMaxDatasets)`,
    )
    err.status = 413
    err.code = 'MANAGED_DATASET_CAP'
    throw err
  }
  return q
}

export async function listManagedDatasets(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM managed_datasets
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT 200`,
    [workspaceId],
  )
  return rows.map(mapDataset)
}

export async function getManagedDataset(workspaceId, datasetId) {
  const { rows } = await query(
    `SELECT * FROM managed_datasets
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, datasetId],
  )
  return rows[0] ? mapDataset(rows[0]) : null
}

/**
 * Create / replace managed dataset from job output rows.
 */
export async function upsertManagedDatasetFromJob(
  workspaceId,
  {
    jobId = null,
    sourceRunId = null,
    name,
    description = '',
    columns = [],
    rows = [],
    certify = false,
    userId = null,
  } = {},
) {
  if (!(await isManagedPlaneEnabled(workspaceId))) {
    const err = new Error(
      'Managed data plane is disabled — enable enableManagedDataPlane in Settings (Offer B)',
    )
    err.status = 403
    err.code = 'MANAGED_PLANE_OFF'
    throw err
  }
  const title = String(name || 'dataset').trim()
  if (!title) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }

  const slugGuess = slugify(title)
  const quotas = await assertQuotaHeadroom(
    workspaceId,
    (Array.isArray(rows) ? rows : []).length,
    { replaceSlug: slugGuess },
  )
  const maxRows = quotas.maxRowsPerDataset
  const safeRows = (Array.isArray(rows) ? rows : []).slice(0, maxRows)
  let colSchema = Array.isArray(columns) ? columns : []
  if (!colSchema.length && safeRows[0] && typeof safeRows[0] === 'object') {
    colSchema = Object.keys(safeRows[0]).map((k) => ({
      name: k,
      dataType: 'text',
    }))
  }

  const bytesEstimate = Buffer.byteLength(JSON.stringify(safeRows), 'utf8')
  const expiresAt = new Date(
    Date.now() + quotas.retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  let slug = slugGuess
  const id = randomUUID()
  for (let i = 0; i < 5; i++) {
    try {
      await query(
        `INSERT INTO managed_datasets (
           id, workspace_id, name, slug, description, job_id, source_run_id, status,
           column_schema_json, row_count, bytes_estimate, certified, created_by, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ready',$8::jsonb,$9,$10,$11,$12,$13::timestamptz)
         ON CONFLICT (workspace_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           job_id = COALESCE(EXCLUDED.job_id, managed_datasets.job_id),
           source_run_id = COALESCE(EXCLUDED.source_run_id, managed_datasets.source_run_id),
           column_schema_json = EXCLUDED.column_schema_json,
           row_count = EXCLUDED.row_count,
           bytes_estimate = EXCLUDED.bytes_estimate,
           certified = EXCLUDED.certified OR managed_datasets.certified,
           expires_at = EXCLUDED.expires_at,
           status = 'ready',
           updated_at = now()
         RETURNING id`,
        [
          id,
          workspaceId,
          title,
          slug,
          String(description || '').slice(0, 2000),
          jobId,
          sourceRunId,
          JSON.stringify(colSchema),
          safeRows.length,
          bytesEstimate,
          Boolean(certify),
          userId,
          expiresAt,
        ],
      )
      break
    } catch (err) {
      if (err.code === '23505' || String(err.message).includes('unique')) {
        slug = `${slugify(title)}-${i + 2}`
        continue
      }
      throw err
    }
  }

  const { rows: ds } = await query(
    `SELECT id FROM managed_datasets WHERE workspace_id = $1 AND slug = $2`,
    [workspaceId, slug],
  )
  const datasetId = ds[0].id

  await query(
    `DELETE FROM managed_dataset_rows WHERE workspace_id = $1 AND dataset_id = $2`,
    [workspaceId, datasetId],
  )

  for (let i = 0; i < safeRows.length; i += 100) {
    const chunk = safeRows.slice(i, i + 100)
    for (const row of chunk) {
      await query(
        `INSERT INTO managed_dataset_rows (id, workspace_id, dataset_id, row_json)
         VALUES ($1,$2,$3,$4::jsonb)`,
        [randomUUID(), workspaceId, datasetId, JSON.stringify(row || {})],
      )
    }
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'managed_dataset.upsert',
    resourceType: 'managed_dataset',
    resourceId: datasetId,
    summary: `Managed dataset “${title}” · ${safeRows.length} rows (AI access denied)`,
    meta: {
      jobId,
      sourceRunId,
      rowCount: safeRows.length,
      expiresAt,
      retentionDays: quotas.retentionDays,
    },
  })

  return getManagedDataset(workspaceId, datasetId)
}

/**
 * Land any successful job run into managed plane (live results or dry-run samples).
 */
export async function landManagedDatasetFromJobRun(
  workspaceId,
  {
    jobId,
    runId = null,
    jobTitle = null,
    liveResults = [],
    samplePreviews = [],
    userId = null,
  } = {},
) {
  if (!(await isManagedPlaneEnabled(workspaceId))) {
    return { landed: false, reason: 'managed_plane_off' }
  }
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  if (settings.defaultExecutionPlane !== 'managed') {
    return { landed: false, reason: 'execution_plane_not_managed' }
  }

  let columns = []
  let rows = []
  let source = 'none'

  const live = Array.isArray(liveResults) ? liveResults : []
  if (live.length && Array.isArray(live[0].rows) && live[0].rows.length) {
    source = 'live'
    const first = live[0]
    columns = (first.columns || []).map((c) =>
      typeof c === 'string' ? { name: c, dataType: 'text' } : c,
    )
    rows = first.rows
  } else {
    const samples = Array.isArray(samplePreviews) ? samplePreviews : []
    const withRows = samples.find(
      (s) => Array.isArray(s.rows) && s.rows.length,
    )
    if (withRows) {
      source = 'dry_run_samples'
      columns = (withRows.columns || []).map((c) => ({
        name: c.name || c,
        dataType: c.dataType || 'text',
      }))
      rows = withRows.rows
    }
  }

  if (!rows.length) {
    return { landed: false, reason: 'no_rows' }
  }

  const item = await upsertManagedDatasetFromJob(workspaceId, {
    jobId,
    sourceRunId: runId,
    name: jobTitle || `job-${String(jobId || '').slice(0, 8)}`,
    description: `Landed from ${source} run ${runId || 'n/a'}`,
    columns,
    rows,
    certify: false,
    userId,
  })
  return { landed: true, source, item }
}

/**
 * Purge expired managed datasets (retention).
 */
export async function purgeExpiredManagedDatasets(workspaceId = null) {
  const params = []
  let wsSql = ''
  if (workspaceId) {
    params.push(workspaceId)
    wsSql = ` AND workspace_id = $1`
  }
  const { rows } = await query(
    `DELETE FROM managed_datasets
     WHERE expires_at IS NOT NULL AND expires_at < now()
       ${wsSql}
     RETURNING id, workspace_id, name`,
    params,
  )
  for (const r of rows) {
    void recordAuditEvent({
      workspaceId: r.workspace_id,
      action: 'managed_dataset.purge',
      resourceType: 'managed_dataset',
      resourceId: r.id,
      summary: `Retention purge “${r.name}”`,
    })
  }
  return { purged: rows.length, items: rows }
}

export async function readManagedDatasetRows(
  workspaceId,
  datasetId,
  { limit = 100, offset = 0 } = {},
) {
  const ds = await getManagedDataset(workspaceId, datasetId)
  if (!ds) {
    const err = new Error('dataset not found')
    err.status = 404
    throw err
  }
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 1000)
  const off = Math.max(Number(offset) || 0, 0)
  const { rows } = await query(
    `SELECT id, row_json, created_at FROM managed_dataset_rows
     WHERE workspace_id = $1 AND dataset_id = $2
     ORDER BY created_at ASC
     LIMIT $3 OFFSET $4`,
    [workspaceId, datasetId, lim, off],
  )
  return {
    dataset: ds,
    rows: rows.map((r) => ({
      id: r.id,
      data: r.row_json,
      createdAt: r.created_at,
    })),
    aiAccess: 'denied',
  }
}

export async function certifyManagedDataset(
  workspaceId,
  datasetId,
  userId = null,
) {
  await query(
    `UPDATE managed_datasets SET certified = true, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, datasetId],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'managed_dataset.certify',
    resourceType: 'managed_dataset',
    resourceId: datasetId,
    summary: 'Certified managed dataset for BI',
  })
  return getManagedDataset(workspaceId, datasetId)
}

export async function deleteManagedDataset(workspaceId, datasetId) {
  await query(
    `DELETE FROM managed_datasets WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, datasetId],
  )
  return { ok: true }
}

export async function managedDatasetsSchemaForAi(workspaceId) {
  const list = await listManagedDatasets(workspaceId)
  return list.map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    columns: d.columns,
    rowCount: d.rowCount,
    certified: d.certified,
    note: 'Managed dataset — row data not available to AI',
  }))
}
