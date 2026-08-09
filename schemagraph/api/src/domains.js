/**
 * Phase 2 — Workspace domains / data products.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

function slugify(name) {
  return String(name || 'domain')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'domain'
}

function mapDomain(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    description: r.description || '',
    ownerUserId: r.owner_user_id,
    ownerEmail: r.owner_email || null,
    ownerDisplayName: r.owner_display_name || null,
    connectionIds: Array.isArray(r.connection_ids) ? r.connection_ids : [],
    tableGlobs: Array.isArray(r.table_globs) ? r.table_globs : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listDomains(workspaceId) {
  const { rows } = await query(
    `SELECT d.*, u.email AS owner_email, u.display_name AS owner_display_name
     FROM workspace_domains d
     LEFT JOIN users u ON u.id = d.owner_user_id
     WHERE d.workspace_id = $1
     ORDER BY d.name ASC`,
    [workspaceId],
  )
  return rows.map(mapDomain)
}

export async function getDomain(workspaceId, domainId) {
  const { rows } = await query(
    `SELECT d.*, u.email AS owner_email, u.display_name AS owner_display_name
     FROM workspace_domains d
     LEFT JOIN users u ON u.id = d.owner_user_id
     WHERE d.workspace_id = $1 AND d.id = $2`,
    [workspaceId, domainId],
  )
  return rows[0] ? mapDomain(rows[0]) : null
}

export async function createDomain(workspaceId, body = {}, actorUserId = null) {
  const name = String(body.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  let slug = slugify(body.slug || name)
  const id = randomUUID()
  const connectionIds = Array.isArray(body.connectionIds)
    ? body.connectionIds.filter(Boolean).slice(0, 40)
    : []
  const tableGlobs = Array.isArray(body.tableGlobs)
    ? body.tableGlobs.map(String).filter(Boolean).slice(0, 80)
    : []

  // unique slug retry
  for (let i = 0; i < 5; i++) {
    try {
      await query(
        `INSERT INTO workspace_domains (
           id, workspace_id, name, slug, description, owner_user_id,
           connection_ids, table_globs
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
        [
          id,
          workspaceId,
          name.slice(0, 120),
          slug,
          String(body.description || '').slice(0, 500),
          body.ownerUserId || actorUserId || null,
          JSON.stringify(connectionIds),
          JSON.stringify(tableGlobs),
        ],
      )
      return getDomain(workspaceId, id)
    } catch (err) {
      if (String(err.message || '').includes('unique')) {
        slug = `${slugify(name)}-${i + 2}`
        continue
      }
      throw err
    }
  }
  const err = new Error('could not allocate unique domain slug')
  err.status = 409
  throw err
}

export async function updateDomain(workspaceId, domainId, body = {}) {
  const existing = await getDomain(workspaceId, domainId)
  if (!existing) {
    const err = new Error('domain not found')
    err.status = 404
    throw err
  }
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : existing.name
  const description =
    typeof body.description === 'string'
      ? body.description.slice(0, 500)
      : existing.description
  const ownerUserId =
    body.ownerUserId === null
      ? null
      : body.ownerUserId || existing.ownerUserId
  const connectionIds = Array.isArray(body.connectionIds)
    ? body.connectionIds.filter(Boolean).slice(0, 40)
    : existing.connectionIds
  const tableGlobs = Array.isArray(body.tableGlobs)
    ? body.tableGlobs.map(String).filter(Boolean).slice(0, 80)
    : existing.tableGlobs

  await query(
    `UPDATE workspace_domains SET
       name = $3,
       description = $4,
       owner_user_id = $5,
       connection_ids = $6::jsonb,
       table_globs = $7::jsonb,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      domainId,
      name,
      description,
      ownerUserId,
      JSON.stringify(connectionIds),
      JSON.stringify(tableGlobs),
    ],
  )
  return getDomain(workspaceId, domainId)
}

export async function deleteDomain(workspaceId, domainId) {
  const { rowCount } = await query(
    `DELETE FROM workspace_domains WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, domainId],
  )
  return rowCount > 0
}
