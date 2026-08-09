/**
 * Phase 4 — Catalog assets: dashboards, metrics, pipelines as first-class nodes.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

const KINDS = ['dashboard', 'metric', 'pipeline', 'ml_feature', 'other']

function mapAsset(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    kind: r.kind,
    name: r.name,
    description: r.description || '',
    ownerUserId: r.owner_user_id,
    ownerEmail: r.owner_email || null,
    externalUrl: r.external_url || null,
    tags: Array.isArray(r.tags_json) ? r.tags_json : [],
    meta: r.meta_json || {},
    status: r.status,
    depCount: Number(r.dep_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listCatalogAssets(workspaceId, { kind } = {}) {
  const params = [workspaceId]
  let where = 'a.workspace_id = $1 AND a.status <> \'archived\''
  if (kind && kind !== 'all') {
    params.push(kind)
    where += ` AND a.kind = $${params.length}`
  }
  const { rows } = await query(
    `SELECT a.*, u.email AS owner_email,
            (SELECT COUNT(*)::int FROM catalog_asset_deps d WHERE d.asset_id = a.id) AS dep_count
     FROM catalog_assets a
     LEFT JOIN users u ON u.id = a.owner_user_id
     WHERE ${where}
     ORDER BY a.updated_at DESC
     LIMIT 200`,
    params,
  )
  return rows.map(mapAsset)
}

export async function createCatalogAsset(workspaceId, body = {}, userId = null) {
  const name = String(body.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  const kind = KINDS.includes(body.kind) ? body.kind : 'dashboard'
  const id = randomUUID()
  const tags = Array.isArray(body.tags)
    ? body.tags.map(String).filter(Boolean).slice(0, 20)
    : []
  await query(
    `INSERT INTO catalog_assets (
       id, workspace_id, kind, name, description, owner_user_id,
       external_url, tags_json, meta_json, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'active')`,
    [
      id,
      workspaceId,
      kind,
      name,
      String(body.description || '').slice(0, 4000),
      body.ownerUserId || userId || null,
      body.externalUrl ? String(body.externalUrl).slice(0, 500) : null,
      JSON.stringify(tags),
      JSON.stringify(body.meta && typeof body.meta === 'object' ? body.meta : {}),
    ],
  )

  const deps = Array.isArray(body.dependsOn)
    ? body.dependsOn
    : Array.isArray(body.tables)
      ? body.tables
      : []
  for (const dep of deps.slice(0, 40)) {
    const tableName =
      typeof dep === 'string' ? dep : dep?.table || dep?.tableName
    const columnName =
      typeof dep === 'object' ? dep.column || dep.columnName || null : null
    if (!tableName) continue
    const { rows } = await query(
      `SELECT id FROM schema_objects
       WHERE workspace_id = $1 AND lower(name) = lower($2) LIMIT 1`,
      [workspaceId, String(tableName)],
    )
    await query(
      `INSERT INTO catalog_asset_deps (
         id, workspace_id, asset_id, schema_object_id, table_name, column_name
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        workspaceId,
        id,
        rows[0]?.id || null,
        String(tableName),
        columnName ? String(columnName) : null,
      ],
    )
  }

  const assets = await listCatalogAssets(workspaceId)
  return assets.find((a) => a.id === id)
}

export async function updateCatalogAsset(workspaceId, assetId, patch = {}) {
  const { rows } = await query(
    `SELECT * FROM catalog_assets WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, assetId],
  )
  if (!rows[0]) {
    const err = new Error('asset not found')
    err.status = 404
    throw err
  }
  const c = rows[0]
  await query(
    `UPDATE catalog_assets SET
       kind = $3, name = $4, description = $5,
       external_url = $6, tags_json = $7::jsonb, status = $8,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      assetId,
      KINDS.includes(patch.kind) ? patch.kind : c.kind,
      patch.name != null ? String(patch.name).trim() : c.name,
      patch.description != null
        ? String(patch.description).slice(0, 4000)
        : c.description,
      patch.externalUrl !== undefined
        ? patch.externalUrl
          ? String(patch.externalUrl).slice(0, 500)
          : null
        : c.external_url,
      JSON.stringify(
        Array.isArray(patch.tags)
          ? patch.tags.map(String).slice(0, 20)
          : c.tags_json || [],
      ),
      ['active', 'deprecated', 'archived'].includes(patch.status)
        ? patch.status
        : c.status,
    ],
  )
  const assets = await listCatalogAssets(workspaceId)
  return assets.find((a) => a.id === assetId) || null
}

export async function deleteCatalogAsset(workspaceId, assetId) {
  await query(
    `UPDATE catalog_assets SET status = 'archived', updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, assetId],
  )
  return { ok: true }
}

export async function listAssetDeps(workspaceId, assetId) {
  const { rows } = await query(
    `SELECT id, table_name, column_name, schema_object_id, created_at
     FROM catalog_asset_deps
     WHERE workspace_id = $1 AND asset_id = $2
     ORDER BY created_at`,
    [workspaceId, assetId],
  )
  return rows.map((r) => ({
    id: r.id,
    tableName: r.table_name,
    columnName: r.column_name,
    schemaObjectId: r.schema_object_id,
    createdAt: r.created_at,
  }))
}
