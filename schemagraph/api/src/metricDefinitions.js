/**
 * Semantic metrics on certified managed datasets (DA self-serve).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getManagedDataset, readManagedDatasetRows } from './managedDataPlane.js'
import { recordAuditEvent } from './auditLog.js'
import { createBiChart } from './certifiedBi.js'

function slugify(name) {
  return (
    String(name || 'metric')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'metric'
  )
}

function mapMetric(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    description: r.description || '',
    expressionSql: r.expression_sql || '',
    datasetId: r.dataset_id,
    dimensions: Array.isArray(r.dimensions_json) ? r.dimensions_json : [],
    certified: Boolean(r.certified),
    sourceObjectId: r.source_object_id || null,
    sourceColumnName: r.source_column_name || '',
    lineage:
      r.lineage_json && typeof r.lineage_json === 'object' ? r.lineage_json : {},
    ownerUserId: r.owner_user_id || null,
    tags: Array.isArray(r.tags_json) ? r.tags_json : [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listMetrics(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM metric_definitions
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT 200`,
    [workspaceId],
  )
  return rows.map(mapMetric)
}

export async function getMetric(workspaceId, metricId) {
  const { rows } = await query(
    `SELECT * FROM metric_definitions WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, metricId],
  )
  return rows[0] ? mapMetric(rows[0]) : null
}

export async function createMetric(
  workspaceId,
  {
    name,
    description = '',
    expressionSql = '',
    datasetId = null,
    dimensions = [],
    certify = false,
    userId = null,
    sourceObjectId = null,
    sourceColumnName = '',
    lineage = {},
    tags = [],
  } = {},
) {
  const title = String(name || '').trim()
  if (!title) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  if (datasetId) {
    const ds = await getManagedDataset(workspaceId, datasetId)
    if (!ds) {
      const err = new Error('dataset not found')
      err.status = 404
      throw err
    }
    if (certify && !ds.certified) {
      const err = new Error('Certify the managed dataset before certifying the metric')
      err.status = 400
      throw err
    }
  }
  let slug = slugify(title)
  const id = randomUUID()
  for (let i = 0; i < 5; i++) {
    try {
      await query(
        `INSERT INTO metric_definitions (
           id, workspace_id, name, slug, description, expression_sql,
           dataset_id, dimensions_json, certified, created_by,
           source_object_id, source_column_name, lineage_json, tags_json, owner_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$10)`,
        [
          id,
          workspaceId,
          title.slice(0, 200),
          slug,
          String(description || '').slice(0, 2000),
          String(expressionSql || '').slice(0, 8000),
          datasetId,
          JSON.stringify(Array.isArray(dimensions) ? dimensions : []),
          Boolean(certify),
          userId,
          sourceObjectId,
          String(sourceColumnName || '').slice(0, 200),
          JSON.stringify(lineage && typeof lineage === 'object' ? lineage : {}),
          JSON.stringify(Array.isArray(tags) ? tags : []),
        ],
      )
      break
    } catch (err) {
      if (err.code === '23505') {
        slug = `${slugify(title)}-${i + 2}`
        continue
      }
      throw err
    }
  }
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'metric.create',
    resourceType: 'metric',
    resourceId: id,
    summary: `Metric “${title}”`,
  })
  return getMetric(workspaceId, id)
}

export async function updateMetric(
  workspaceId,
  metricId,
  patch = {},
  userId = null,
) {
  const cur = await getMetric(workspaceId, metricId)
  if (!cur) {
    const err = new Error('metric not found')
    err.status = 404
    throw err
  }
  const name =
    typeof patch.name === 'string' && patch.name.trim()
      ? patch.name.trim().slice(0, 200)
      : cur.name
  const description =
    typeof patch.description === 'string'
      ? patch.description.slice(0, 2000)
      : cur.description
  const expressionSql =
    typeof patch.expressionSql === 'string'
      ? patch.expressionSql.slice(0, 8000)
      : cur.expressionSql
  const datasetId =
    patch.datasetId !== undefined ? patch.datasetId : cur.datasetId
  const dimensions = Array.isArray(patch.dimensions)
    ? patch.dimensions
    : cur.dimensions
  const certified =
    typeof patch.certified === 'boolean' ? patch.certified : cur.certified
  const sourceObjectId =
    patch.sourceObjectId !== undefined ? patch.sourceObjectId : cur.sourceObjectId
  const sourceColumnName =
    typeof patch.sourceColumnName === 'string'
      ? patch.sourceColumnName.slice(0, 200)
      : cur.sourceColumnName
  const lineage =
    patch.lineage && typeof patch.lineage === 'object'
      ? patch.lineage
      : cur.lineage
  const tags = Array.isArray(patch.tags) ? patch.tags : cur.tags

  if (certified && datasetId) {
    const ds = await getManagedDataset(workspaceId, datasetId)
    if (ds && !ds.certified) {
      const err = new Error('Certify the managed dataset before certifying the metric')
      err.status = 400
      throw err
    }
  }

  await query(
    `UPDATE metric_definitions SET
       name = $3, description = $4, expression_sql = $5, dataset_id = $6,
       dimensions_json = $7::jsonb, certified = $8,
       source_object_id = $9, source_column_name = $10,
       lineage_json = $11::jsonb, tags_json = $12::jsonb,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      metricId,
      name,
      description,
      expressionSql,
      datasetId,
      JSON.stringify(dimensions || []),
      certified,
      sourceObjectId,
      sourceColumnName || '',
      JSON.stringify(lineage || {}),
      JSON.stringify(tags || []),
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'metric.update',
    resourceType: 'metric',
    resourceId: metricId,
    summary: `Updated metric “${name}”`,
  })
  return getMetric(workspaceId, metricId)
}

/**
 * Lineage-to-metric graph for semantic layer depth.
 */
export async function getMetricLineage(workspaceId, metricId = null) {
  const metrics = metricId
    ? [await getMetric(workspaceId, metricId)].filter(Boolean)
    : await listMetrics(workspaceId)

  const nodes = []
  const edges = []
  for (const m of metrics) {
    nodes.push({
      id: `metric:${m.id}`,
      kind: 'metric',
      label: m.name,
      certified: m.certified,
      slug: m.slug,
    })
    if (m.datasetId) {
      nodes.push({
        id: `dataset:${m.datasetId}`,
        kind: 'dataset',
        label: `dataset`,
      })
      edges.push({
        from: `dataset:${m.datasetId}`,
        to: `metric:${m.id}`,
        type: 'feeds',
      })
    }
    if (m.sourceObjectId) {
      const oid = `table:${m.sourceObjectId}`
      nodes.push({
        id: oid,
        kind: 'table',
        label: m.sourceColumnName
          ? `${m.sourceObjectId.slice(0, 8)}….${m.sourceColumnName}`
          : m.sourceObjectId.slice(0, 8),
      })
      edges.push({
        from: oid,
        to: `metric:${m.id}`,
        type: 'column_source',
        column: m.sourceColumnName || null,
      })
    }
    const lin = m.lineage || {}
    for (const t of lin.tables || []) {
      const tid = `table:${t}`
      nodes.push({ id: tid, kind: 'table', label: String(t) })
      edges.push({ from: tid, to: `metric:${m.id}`, type: 'declared' })
    }
    for (const j of lin.jobs || []) {
      const jid = `job:${j}`
      nodes.push({ id: jid, kind: 'job', label: String(j) })
      edges.push({ from: jid, to: `metric:${m.id}`, type: 'produced_by' })
    }
  }

  const uniqNodes = []
  const seen = new Set()
  for (const n of nodes) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    uniqNodes.push(n)
  }

  return {
    metrics: metrics.length,
    nodes: uniqNodes,
    edges,
    note: 'Semantic lineage — metadata only; AI never receives row payloads.',
  }
}

/**
 * Preview metric from managed dataset rows (simple aggregate on a field).
 * expressionSql like: COUNT(*) | SUM(amount) | fieldName
 */
export async function previewMetric(workspaceId, metricId, { limit = 500 } = {}) {
  const metric = await getMetric(workspaceId, metricId)
  if (!metric) {
    const err = new Error('metric not found')
    err.status = 404
    throw err
  }
  if (!metric.datasetId) {
    return { metric, value: null, note: 'Bind a managed dataset' }
  }
  const data = await readManagedDatasetRows(workspaceId, metric.datasetId, {
    limit,
  })
  const rows = data.rows.map((r) => r.data)
  const expr = String(metric.expressionSql || '').trim().toLowerCase()
  let value = rows.length
  if (expr.startsWith('sum(')) {
    const field = expr.slice(4, -1).trim()
    value = rows.reduce((a, r) => a + (Number(r?.[field]) || 0), 0)
  } else if (expr.startsWith('avg(')) {
    const field = expr.slice(4, -1).trim()
    const nums = rows.map((r) => Number(r?.[field])).filter(Number.isFinite)
    value = nums.length
      ? nums.reduce((a, b) => a + b, 0) / nums.length
      : null
  } else if (expr && expr !== 'count(*)' && !expr.includes('(')) {
    // distinct count of field
    value = new Set(rows.map((r) => r?.[expr]).filter((v) => v != null)).size
  }
  return {
    metric,
    value,
    rowSample: rows.slice(0, 20),
    aiAccess: 'denied',
  }
}

/** One-click: certified metric → certified KPI chart */
export async function publishMetricToBi(
  workspaceId,
  metricId,
  userId = null,
) {
  const metric = await getMetric(workspaceId, metricId)
  if (!metric) {
    const err = new Error('metric not found')
    err.status = 404
    throw err
  }
  if (!metric.certified) {
    const err = new Error('Certify the metric before publishing to BI')
    err.status = 400
    throw err
  }
  const chart = await createBiChart(workspaceId, {
    title: metric.name,
    description: metric.description || metric.expressionSql,
    chartType: 'kpi',
    datasetId: metric.datasetId,
    config: {
      metricId: metric.id,
      expressionSql: metric.expressionSql,
      yField: metric.dimensions[0] || undefined,
    },
    certify: true,
    userId,
  })
  return { metric, chart }
}
