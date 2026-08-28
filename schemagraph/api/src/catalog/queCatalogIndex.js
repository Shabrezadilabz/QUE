/**
 * Que Catalog — unified asset index (tables, metrics, BI, jobs, models, terms).
 * Atlan/ Collibra-class browse surface over existing workspace metadata.
 */
import { query } from '../db.js'
import { listCatalogAssets } from '../catalogAssets.js'
import { listGlossaryTerms } from '../glossary.js'
import { listMetrics } from '../metricDefinitions.js'
import { listBiCharts } from '../certifiedBi.js'
import { listJobs } from '../jobs.js'
import { listQueModels } from '../queModel.js'
import { listWarehouseTables } from '../queWarehouse.js'

export const CATALOG_KINDS = [
  'all',
  'table',
  'metric',
  'dashboard',
  'pipeline',
  'model',
  'dataset',
  'term',
  'catalog_asset',
]

/**
 * @param {object} entry
 * @param {string} [q]
 */
export function filterCatalogEntries(entries, q = '') {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return entries
  return entries.filter((e) => {
    const hay = [
      e.name,
      e.description,
      e.kind,
      e.connection,
      e.owner,
      ...(e.tags || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(needle)
  })
}

/**
 * @param {object[]} entries
 * @param {string} [kind]
 */
export function filterCatalogByKind(entries, kind = 'all') {
  if (!kind || kind === 'all') return entries
  return entries.filter((e) => e.kind === kind)
}

/**
 * Build searchable catalog index from workspace metadata sources.
 * @param {string} workspaceId
 * @param {{ kind?: string, q?: string, limit?: number }} [opts]
 */
export async function buildCatalogIndex(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500)

  const [
    objects,
    metrics,
    charts,
    jobs,
    models,
    terms,
    manualAssets,
    whTables,
    datasets,
  ] = await Promise.all([
    query(
      `SELECT o.id, o.name, o.entity_kind, o.description, o.updated_at,
              c.name AS connection_name, c.source_type
       FROM schema_objects o
       JOIN connections c ON c.id = o.connection_id
       WHERE o.workspace_id = $1
       ORDER BY o.updated_at DESC
       LIMIT 300`,
      [workspaceId],
    ).then((r) => r.rows),
    listMetrics(workspaceId).catch(() => []),
    listBiCharts(workspaceId).catch(() => []),
    listJobs(workspaceId).catch(() => []),
    listQueModels(workspaceId).catch(() => []),
    listGlossaryTerms(workspaceId).catch(() => []),
    listCatalogAssets(workspaceId).catch(() => []),
    listWarehouseTables(workspaceId).catch(() => []),
    query(
      `SELECT id, name, description, status, certified, updated_at
       FROM managed_datasets
       WHERE workspace_id = $1
       ORDER BY updated_at DESC
       LIMIT 100`,
      [workspaceId],
    )
      .then((r) => r.rows)
      .catch(() => []),
  ])

  const whBySource = new Map(
    whTables.map((t) => [String(t.sourceTable || '').toLowerCase(), t]),
  )

  const entries = []

  for (const o of objects) {
    const wh = whBySource.get(String(o.name || '').toLowerCase())
    entries.push({
      id: `table:${o.id}`,
      sourceId: o.id,
      kind: 'table',
      name: o.name,
      description: o.description || '',
      status: 'active',
      certified: false,
      owner: null,
      connection: o.connection_name,
      sourceType: o.source_type,
      tags: [o.entity_kind].filter(Boolean),
      route: '/workspace',
      meta: {
        entityKind: o.entity_kind,
        warehouseRowCount: wh?.rowCount ?? null,
        rawTableName: wh?.rawTableName ?? null,
      },
      updatedAt: o.updated_at,
    })
  }

  for (const m of metrics) {
    entries.push({
      id: `metric:${m.id}`,
      sourceId: m.id,
      kind: 'metric',
      name: m.name,
      description: m.description || '',
      status: m.status || 'active',
      certified: Boolean(m.certified),
      owner: m.ownerUserId || null,
      connection: null,
      tags: Array.isArray(m.tags) ? m.tags : [],
      route: '/metrics',
      meta: { expressionSql: m.expressionSql?.slice(0, 120) || '' },
      updatedAt: m.updatedAt,
    })
  }

  for (const c of charts) {
    entries.push({
      id: `dashboard:${c.id}`,
      sourceId: c.id,
      kind: 'dashboard',
      name: c.title || 'Chart',
      description: c.description || '',
      status: c.status || 'active',
      certified: Boolean(c.certified),
      owner: null,
      connection: null,
      tags: c.chartType ? [c.chartType] : [],
      route: `/bi?chart=${c.id}`,
      meta: { chartType: c.chartType, reportId: c.config?.reportId || null },
      updatedAt: c.updatedAt,
    })
  }

  for (const j of jobs) {
    entries.push({
      id: `pipeline:${j.id}`,
      sourceId: j.id,
      kind: 'pipeline',
      name: j.title || 'Job',
      description: j.notes || '',
      status: j.status || 'draft',
      certified: Boolean(j.contract),
      owner: null,
      connection: null,
      tags: j.runSchedule && j.runSchedule !== 'off' ? ['scheduled'] : [],
      route: `/jobs/${j.id}`,
      meta: { schedule: j.runSchedule || null },
      updatedAt: j.updatedAt,
    })
  }

  for (const m of models) {
    entries.push({
      id: `model:${m.id}`,
      sourceId: m.id,
      kind: 'model',
      name: m.name,
      description: m.description || '',
      status: m.status || 'draft',
      certified: m.status === 'ready',
      owner: null,
      connection: null,
      tags: [m.layer, m.materialization].filter(Boolean),
      route: `/model/${m.id}`,
      meta: {
        layer: m.layer,
        dependsOn: m.dependsOn?.slice(0, 8) || [],
      },
      updatedAt: m.updatedAt,
    })
  }

  for (const d of datasets) {
    entries.push({
      id: `dataset:${d.id}`,
      sourceId: d.id,
      kind: 'dataset',
      name: d.name,
      description: d.description || '',
      status: d.status || 'active',
      certified: Boolean(d.certified),
      owner: null,
      connection: null,
      tags: ['managed'],
      route: '/managed',
      meta: {},
      updatedAt: d.updated_at,
    })
  }

  for (const t of terms) {
    entries.push({
      id: `term:${t.id}`,
      sourceId: t.id,
      kind: 'term',
      name: t.name,
      description: t.definition || '',
      status: t.status || 'draft',
      certified: t.status === 'approved',
      owner: t.ownerEmail || null,
      connection: null,
      tags: t.synonyms?.slice(0, 5) || [],
      route: '/glossary',
      meta: { linkCount: t.linkCount || 0, slug: t.slug },
      updatedAt: t.updatedAt,
    })
  }

  for (const a of manualAssets) {
    entries.push({
      id: `catalog_asset:${a.id}`,
      sourceId: a.id,
      kind: 'catalog_asset',
      name: a.name,
      description: a.description || '',
      status: a.status || 'active',
      certified: false,
      owner: a.ownerEmail || null,
      connection: null,
      tags: a.tags || [],
      route: '/catalog',
      meta: { manualKind: a.kind, depCount: a.depCount },
      updatedAt: a.updatedAt,
    })
  }

  entries.sort(
    (a, b) =>
      new Date(b.updatedAt || 0).getTime() -
      new Date(a.updatedAt || 0).getTime(),
  )

  let filtered = filterCatalogByKind(entries, opts.kind)
  filtered = filterCatalogEntries(filtered, opts.q)

  return {
    entries: filtered.slice(0, limit),
    total: filtered.length,
    stats: summarizeCatalogEntries(entries),
  }
}

/** @param {object[]} entries */
export function summarizeCatalogEntries(entries) {
  const byKind = {}
  let certified = 0
  for (const e of entries) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1
    if (e.certified) certified += 1
  }
  return {
    total: entries.length,
    certified,
    byKind,
  }
}

/**
 * Resolve one catalog entry by composite id (e.g. table:uuid).
 * @param {string} workspaceId
 * @param {string} assetKey
 */
export async function getCatalogEntry(workspaceId, assetKey) {
  const { entries } = await buildCatalogIndex(workspaceId, { limit: 500 })
  return entries.find((e) => e.id === assetKey) || null
}
