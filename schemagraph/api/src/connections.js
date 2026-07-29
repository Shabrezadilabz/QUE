/**
 * Connection (data source) CRUD for the Sources page.
 * Secret fields sealed with AES-GCM at rest (__enc blob).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import {
  publicConnectionConfig,
  sealConnectionConfig,
  unsealConnectionConfig,
} from './connectionCrypto.js'

const SYNCABLE = new Set([
  'postgresql',
  'excel',
  'csv',
  'mongodb',
  'databricks',
  'snowflake',
])

function mapConnection(row, { includeConfig = true } = {}) {
  const base = {
    id: row.id,
    name: row.name,
    type: row.source_type,
    status: row.status,
    description: row.description ?? undefined,
    syncable: SYNCABLE.has(row.source_type),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
  if (!includeConfig) return base
  const { config, hasSecrets } = publicConnectionConfig(row.config_json)
  return { ...base, config, hasSecrets }
}

/**
 * Merge config updates — keep previous sealed secrets if client sends blank / mask.
 */
function mergeConfig(existing, incoming) {
  const prevRaw = existing && typeof existing === 'object' ? { ...existing } : {}
  const prev = unsealConnectionConfig(prevRaw)
  if (!incoming || typeof incoming !== 'object') {
    return sealConnectionConfig(prev)
  }
  const next = { ...prev, ...incoming }
  // Drop incoming mask placeholders so we keep prev secrets
  for (const key of ['password', 'secret', 'token', 'apiKey']) {
    if (
      next[key] === '' ||
      next[key] === '••••••••' ||
      next[key] == null
    ) {
      if (prev[key] != null) next[key] = prev[key]
      else delete next[key]
    }
  }
  // Carry forward __enc only via seal — remove raw from merge
  delete next.__enc
  delete next.__encVersion
  return sealConnectionConfig(next)
}

export async function listConnections(workspaceId) {
  const { rows } = await query(
    `SELECT id, name, source_type, status, description, config_json,
            created_at, updated_at
     FROM connections
     WHERE workspace_id = $1
     ORDER BY name`,
    [workspaceId],
  )
  return rows.map((r) => mapConnection(r))
}

export async function getConnection(workspaceId, connectionId) {
  const { rows } = await query(
    `SELECT id, name, source_type, status, description, config_json,
            created_at, updated_at
     FROM connections
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, connectionId],
  )
  return rows[0] ? mapConnection(rows[0]) : null
}

export async function createConnection(workspaceId, body = {}) {
  const name = String(body.name || '').trim()
  const sourceType = String(body.type || body.source_type || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  if (!sourceType) {
    const err = new Error('type required')
    err.status = 400
    throw err
  }

  const id = body.id || randomUUID()
  const status = ['active', 'warning', 'error'].includes(body.status)
    ? body.status
    : 'warning'
  const description = body.description ?? null
  const raw =
    body.config && typeof body.config === 'object' ? body.config : {}
  const config = sealConnectionConfig(raw)

  try {
    const { rows } = await query(
      `INSERT INTO connections (
         id, workspace_id, name, source_type, status, description, config_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING id, name, source_type, status, description, config_json,
                 created_at, updated_at`,
      [
        id,
        workspaceId,
        name,
        sourceType,
        status,
        description,
        JSON.stringify(config),
      ],
    )
    return mapConnection(rows[0])
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('connection name already exists in workspace')
      err.status = 409
      throw err
    }
    throw e
  }
}

export async function updateConnection(workspaceId, connectionId, body = {}) {
  const { rows: existingRows } = await query(
    `SELECT * FROM connections WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, connectionId],
  )
  if (existingRows.length === 0) return null
  const existing = existingRows[0]

  const name =
    body.name != null ? String(body.name).trim() : existing.name
  const sourceType =
    body.type != null || body.source_type != null
      ? String(body.type || body.source_type).trim()
      : existing.source_type
  const status = ['active', 'warning', 'error'].includes(body.status)
    ? body.status
    : existing.status
  const description =
    body.description !== undefined ? body.description : existing.description
  const config = mergeConfig(existing.config_json, body.config)

  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }

  try {
    const { rows } = await query(
      `UPDATE connections SET
         name = $3,
         source_type = $4,
         status = $5,
         description = $6,
         config_json = $7::jsonb,
         updated_at = now()
       WHERE workspace_id = $1 AND id = $2
       RETURNING id, name, source_type, status, description, config_json,
                 created_at, updated_at`,
      [
        workspaceId,
        connectionId,
        name,
        sourceType,
        status,
        description,
        JSON.stringify(config),
      ],
    )
    return mapConnection(rows[0])
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('connection name already exists in workspace')
      err.status = 409
      throw err
    }
    throw e
  }
}

export async function deleteConnection(workspaceId, connectionId) {
  const { rowCount } = await query(
    `DELETE FROM connections WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, connectionId],
  )
  return rowCount > 0
}

/** Internal — full config including secrets (never return to client). */
export async function getConnectionSecrets(workspaceId, connectionId) {
  const { rows } = await query(
    `SELECT id, name, source_type, status, config_json
     FROM connections
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, connectionId],
  )
  if (!rows[0]) return null
  const row = rows[0]
  const raw =
    row.config_json && typeof row.config_json === 'object'
      ? row.config_json
      : {}
  return {
    id: row.id,
    name: row.name,
    type: row.source_type,
    status: row.status,
    config: unsealConnectionConfig(raw),
  }
}

/** List raw connections for runner target resolution (secrets stay server-side). */
export async function listConnectionsRaw(workspaceId) {
  const { rows } = await query(
    `SELECT id, name, source_type, status, config_json
     FROM connections
     WHERE workspace_id = $1
     ORDER BY name`,
    [workspaceId],
  )
  return rows.map((row) => {
    const raw =
      row.config_json && typeof row.config_json === 'object'
        ? row.config_json
        : {}
    return {
      id: row.id,
      name: row.name,
      type: row.source_type,
      status: row.status,
      config: unsealConnectionConfig(raw),
    }
  })
}
