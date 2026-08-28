/**
 * Que Model IDE — dbt-class SQL models per workspace (staging / mart).
 * Phase P3.2 — CRUD, warehouse preview, lineage, dbt export.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { executeWarehouseReadonlySql } from './queWarehouse.js'
import { recordAuditEvent } from './auditLog.js'

export const MODEL_LAYERS = new Set(['staging', 'mart', 'seed'])
export const MODEL_STATUS = new Set(['draft', 'ready', 'archived'])
export const MATERIALIZATIONS = new Set(['view', 'table', 'incremental'])

function mapModel(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    layer: row.layer,
    sqlText: row.sql_text || '',
    description: row.description || '',
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on : [],
    materialization: row.materialization || 'view',
    status: row.status,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunRows: row.last_run_rows,
    config:
      row.config_json && typeof row.config_json === 'object'
        ? row.config_json
        : {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** @param {string} name */
export function slugifyModelName(name) {
  return String(name || 'model')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'model'
}

/**
 * Parse dbt-style ref('model') and FROM identifiers from SQL.
 * @param {string} sql
 */
export function parseModelRefs(sql) {
  const refs = new Set()
  const text = String(sql || '')
  const refRe = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/gi
  let m
  while ((m = refRe.exec(text))) {
    refs.add(m[1])
  }
  const fromRe = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi
  while ((m = fromRe.exec(text))) {
    const raw = m[1]
    const short = raw.includes('.') ? raw.split('.').pop() : raw
    if (!['select', 'where', 'group', 'order', 'limit'].includes(short.toLowerCase())) {
      refs.add(short)
    }
  }
  return [...refs]
}

export async function listQueModels(workspaceId, { layer, status } = {}) {
  const params = [workspaceId]
  const clauses = ['workspace_id = $1']
  if (layer && MODEL_LAYERS.has(layer)) {
    params.push(layer)
    clauses.push(`layer = $${params.length}`)
  }
  if (status && MODEL_STATUS.has(status)) {
    params.push(status)
    clauses.push(`status = $${params.length}`)
  }
  const { rows } = await query(
    `SELECT * FROM que_sql_models
     WHERE ${clauses.join(' AND ')}
     ORDER BY layer, name
     LIMIT 200`,
    params,
  )
  return rows.map(mapModel)
}

export async function getQueModel(workspaceId, modelId) {
  const { rows } = await query(
    `SELECT * FROM que_sql_models WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, modelId],
  )
  return mapModel(rows[0])
}

export async function createQueModel(workspaceId, payload = {}, userId = null) {
  const name = String(payload.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  const layer = MODEL_LAYERS.has(payload.layer) ? payload.layer : 'staging'
  const materialization = MATERIALIZATIONS.has(payload.materialization)
    ? payload.materialization
    : 'view'
  const sqlText = String(payload.sqlText || payload.sql || '').trim()
  const dependsOn = parseModelRefs(sqlText)

  const id = randomUUID()
  try {
    await query(
      `INSERT INTO que_sql_models (
         id, workspace_id, name, layer, sql_text, description,
         depends_on, materialization, status, config_json, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9::jsonb,$10)`,
      [
        id,
        workspaceId,
        name.slice(0, 120),
        layer,
        sqlText,
        String(payload.description || '').slice(0, 2000),
        dependsOn,
        materialization,
        JSON.stringify(payload.config && typeof payload.config === 'object' ? payload.config : {}),
        userId,
      ],
    )
  } catch (err) {
    if (String(err.message || '').includes('unique')) {
      const e = new Error('Model name already exists in this workspace')
      e.status = 409
      throw e
    }
    throw err
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'model.create',
    resourceType: 'que_model',
    resourceId: id,
    summary: `Created SQL model “${name}” (${layer})`,
  })

  return getQueModel(workspaceId, id)
}

export async function updateQueModel(workspaceId, modelId, patch = {}, userId = null) {
  const cur = await getQueModel(workspaceId, modelId)
  if (!cur) {
    const err = new Error('model not found')
    err.status = 404
    throw err
  }

  const name =
    typeof patch.name === 'string' && patch.name.trim()
      ? patch.name.trim().slice(0, 120)
      : cur.name
  const layer = MODEL_LAYERS.has(patch.layer) ? patch.layer : cur.layer
  const materialization = MATERIALIZATIONS.has(patch.materialization)
    ? patch.materialization
    : cur.materialization
  const sqlText =
    typeof patch.sqlText === 'string' || typeof patch.sql === 'string'
      ? String(patch.sqlText ?? patch.sql).trim()
      : cur.sqlText
  const description =
    typeof patch.description === 'string' ? patch.description.slice(0, 2000) : cur.description
  const status = MODEL_STATUS.has(patch.status) ? patch.status : cur.status
  const dependsOn = Array.isArray(patch.dependsOn)
    ? patch.dependsOn.map(String).slice(0, 32)
    : parseModelRefs(sqlText)
  const config =
    patch.config && typeof patch.config === 'object'
      ? { ...cur.config, ...patch.config }
      : cur.config

  await query(
    `UPDATE que_sql_models SET
       name = $3,
       layer = $4,
       sql_text = $5,
       description = $6,
       depends_on = $7,
       materialization = $8,
       status = $9,
       config_json = $10::jsonb,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      modelId,
      name,
      layer,
      sqlText,
      description,
      dependsOn,
      materialization,
      status,
      JSON.stringify(config),
    ],
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'model.update',
    resourceType: 'que_model',
    resourceId: modelId,
    summary: `Updated SQL model “${name}”`,
  })

  return getQueModel(workspaceId, modelId)
}

export async function deleteQueModel(workspaceId, modelId, userId = null) {
  const cur = await getQueModel(workspaceId, modelId)
  if (!cur) {
    const err = new Error('model not found')
    err.status = 404
    throw err
  }
  await query(
    `DELETE FROM que_sql_models WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, modelId],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'model.delete',
    resourceType: 'que_model',
    resourceId: modelId,
    summary: `Deleted SQL model “${cur.name}”`,
  })
  return { ok: true, id: modelId }
}

/**
 * Run model SQL on Que Warehouse (read-only preview).
 * @param {string} workspaceId
 * @param {string} modelId
 * @param {{ sql?: string, maxRows?: number }} [opts]
 */
export async function runQueModelPreview(workspaceId, modelId, opts = {}) {
  const model = await getQueModel(workspaceId, modelId)
  if (!model) {
    const err = new Error('model not found')
    err.status = 404
    throw err
  }

  const sql = String(opts.sql || model.sqlText || '').trim()
  if (!sql) {
    const err = new Error('Model SQL is empty')
    err.status = 400
    throw err
  }

  const exec = await executeWarehouseReadonlySql(workspaceId, sql, {
    biWidget: true,
    maxRows: Math.min(Number(opts.maxRows) || 100, 500),
  })

  const rowCount = exec.rowCount ?? (exec.rows || []).length
  await query(
    `UPDATE que_sql_models SET
       last_run_at = now(),
       last_run_status = 'succeeded',
       last_run_rows = $3,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, modelId, rowCount],
  )

  return {
    model,
    sql: exec.schema ? sql : sql,
    rows: exec.rows || [],
    columns: (exec.columns || []).map((c) => c.name),
    rowCount,
    durationMs: exec.durationMs,
    engine: exec.engine,
    source: 'que_warehouse',
    aiAccess: 'denied',
  }
}

/**
 * Build lineage graph from model depends_on edges.
 * @param {string} workspaceId
 */
export async function buildQueModelLineage(workspaceId) {
  const models = await listQueModels(workspaceId)
  const byName = new Map(models.map((m) => [m.name, m]))
  const nodes = models.map((m) => ({
    id: m.id,
    name: m.name,
    layer: m.layer,
    status: m.status,
  }))
  const edges = []
  for (const m of models) {
    const deps = m.dependsOn?.length ? m.dependsOn : parseModelRefs(m.sqlText)
    for (const dep of deps) {
      const target = byName.get(dep)
      edges.push({
        from: target?.id || dep,
        to: m.id,
        fromName: dep,
        toName: m.name,
        kind: target ? 'model' : 'external',
      })
    }
  }
  return { nodes, edges, modelCount: models.length }
}

/**
 * Export workspace models as dbt YAML/SQL files.
 * @param {string} workspaceId
 */
export async function exportQueModelsDbt(workspaceId) {
  const models = await listQueModels(workspaceId, { status: 'ready' })
  const all = models.length ? models : await listQueModels(workspaceId)
  const files = []

  for (const m of all) {
    const slug = slugifyModelName(m.name)
    const layerPath = m.layer === 'mart' ? 'marts' : m.layer === 'seed' ? 'seeds' : 'staging'
    const header = [
      `-- Que Model export · ${m.name}`,
      `-- layer: ${m.layer} · materialized: ${m.materialization}`,
      m.description ? `-- ${m.description}` : '',
      '',
    ]
      .filter(Boolean)
      .join('\n')

    let body = m.sqlText
    if (!/\{\{\s*config/i.test(body)) {
      body = `{{ config(materialized='${m.materialization}') }}\n\n${body}`
    }

    files.push({
      path: `models/que/${layerPath}/${slug}.sql`,
      content: `${header}${body}\n`,
    })
  }

  if (files.length) {
    files.push({
      path: 'models/que/schema.yml',
      content: buildModelsSchemaYml(all),
    })
  }

  return {
    modelCount: all.length,
    files,
    exportedAt: new Date().toISOString(),
  }
}

/** @param {object[]} models */
export function buildModelsSchemaYml(models) {
  const lines = ['version: 2', 'models:']
  for (const m of models) {
    lines.push(`  - name: ${slugifyModelName(m.name)}`)
    lines.push(`    description: "${String(m.description || m.name).replace(/"/g, '\\"')}"`)
    if (m.layer === 'mart') {
      lines.push('    config:')
      lines.push('      tags: [mart, que]')
    }
  }
  return `${lines.join('\n')}\n`
}
