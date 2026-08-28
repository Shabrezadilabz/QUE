/**
 * Phase P3.6 — BI Studio access groups (Looker-class field-level security).
 * Admins/owners bypass. Members/viewers inherit merged group policies.
 */
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import {
  applyFiltersToSql,
  normalizeBoardFilters,
} from './boardFilters.js'

function mapGroup(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description || '',
    allowedTables: Array.isArray(row.allowed_tables) ? row.allowed_tables : [],
    deniedColumns:
      row.denied_columns && typeof row.denied_columns === 'object'
        ? row.denied_columns
        : {},
    rowFilters: Array.isArray(row.row_filters) ? row.row_filters : [],
    enabled: Boolean(row.enabled),
    memberCount: Number(row.member_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listBiAccessGroups(workspaceId) {
  const { rows } = await query(
    `SELECT g.*,
            (SELECT COUNT(*)::int FROM bi_access_group_members m
             WHERE m.group_id = g.id) AS member_count
     FROM bi_access_groups g
     WHERE g.workspace_id = $1
     ORDER BY g.name`,
    [workspaceId],
  )
  return rows.map(mapGroup)
}

export async function getBiAccessGroup(workspaceId, groupId) {
  const { rows } = await query(
    `SELECT g.*,
            (SELECT COUNT(*)::int FROM bi_access_group_members m
             WHERE m.group_id = g.id) AS member_count
     FROM bi_access_groups g
     WHERE g.workspace_id = $1 AND g.id = $2`,
    [workspaceId, groupId],
  )
  return mapGroup(rows[0])
}

export async function createBiAccessGroup(workspaceId, body = {}) {
  const name = String(body.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  const id = randomUUID()
  await query(
    `INSERT INTO bi_access_groups (
       id, workspace_id, name, description,
       allowed_tables, denied_columns, row_filters, enabled
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8)`,
    [
      id,
      workspaceId,
      name.slice(0, 80),
      String(body.description || '').slice(0, 500),
      JSON.stringify(
        (Array.isArray(body.allowedTables) ? body.allowedTables : []).slice(0, 80),
      ),
      JSON.stringify(
        body.deniedColumns && typeof body.deniedColumns === 'object'
          ? body.deniedColumns
          : {},
      ),
      JSON.stringify(
        normalizeBoardFilters(body.rowFilters || []).slice(0, 12),
      ),
      body.enabled !== false,
    ],
  )
  return getBiAccessGroup(workspaceId, id)
}

export async function updateBiAccessGroup(workspaceId, groupId, patch = {}) {
  const cur = await getBiAccessGroup(workspaceId, groupId)
  if (!cur) {
    const err = new Error('access group not found')
    err.status = 404
    throw err
  }
  const name =
    typeof patch.name === 'string' && patch.name.trim()
      ? patch.name.trim().slice(0, 80)
      : cur.name
  const description =
    typeof patch.description === 'string'
      ? patch.description.slice(0, 500)
      : cur.description
  const allowedTables = Array.isArray(patch.allowedTables)
    ? patch.allowedTables.slice(0, 80)
    : cur.allowedTables
  const deniedColumns =
    patch.deniedColumns && typeof patch.deniedColumns === 'object'
      ? patch.deniedColumns
      : cur.deniedColumns
  const rowFilters = Array.isArray(patch.rowFilters)
    ? normalizeBoardFilters(patch.rowFilters).slice(0, 12)
    : cur.rowFilters
  const enabled =
    typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled

  await query(
    `UPDATE bi_access_groups SET
       name = $3,
       description = $4,
       allowed_tables = $5::jsonb,
       denied_columns = $6::jsonb,
       row_filters = $7::jsonb,
       enabled = $8,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      groupId,
      name,
      description,
      JSON.stringify(allowedTables),
      JSON.stringify(deniedColumns),
      JSON.stringify(rowFilters),
      enabled,
    ],
  )
  return getBiAccessGroup(workspaceId, groupId)
}

export async function deleteBiAccessGroup(workspaceId, groupId) {
  await query(
    `DELETE FROM bi_access_groups WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, groupId],
  )
  return { ok: true }
}

export async function listBiAccessGroupMembers(workspaceId, groupId) {
  const { rows } = await query(
    `SELECT m.user_id, u.email, u.display_name, m.created_at
     FROM bi_access_group_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = $1 AND m.group_id = $2
     ORDER BY lower(u.email)`,
    [workspaceId, groupId],
  )
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    addedAt: r.created_at,
  }))
}

export async function addBiAccessGroupMember(workspaceId, groupId, userId) {
  const group = await getBiAccessGroup(workspaceId, groupId)
  if (!group) {
    const err = new Error('access group not found')
    err.status = 404
    throw err
  }
  const { rows } = await query(
    `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  )
  if (!rows.length) {
    const err = new Error('user is not a workspace member')
    err.status = 400
    throw err
  }
  await query(
    `INSERT INTO bi_access_group_members (id, workspace_id, group_id, user_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    [randomUUID(), workspaceId, groupId, userId],
  )
  return listBiAccessGroupMembers(workspaceId, groupId)
}

export async function removeBiAccessGroupMember(workspaceId, groupId, userId) {
  await query(
    `DELETE FROM bi_access_group_members
     WHERE workspace_id = $1 AND group_id = $2 AND user_id = $3`,
    [workspaceId, groupId, userId],
  )
  return { ok: true }
}

/**
 * Merge policies for a user. Admin/owner → unrestricted.
 * @param {string} workspaceId
 * @param {string|null} userId
 * @param {string} [role]
 */
export async function resolveBiAccessForUser(
  workspaceId,
  userId,
  role = 'member',
) {
  if (role === 'admin' || role === 'owner') {
    return {
      unrestricted: true,
      allowedTables: [],
      deniedColumns: {},
      rowFilters: [],
      groupIds: [],
    }
  }
  if (!userId) {
    return {
      unrestricted: false,
      allowedTables: [],
      deniedColumns: {},
      rowFilters: [],
      groupIds: [],
    }
  }

  const { rows } = await query(
    `SELECT g.*
     FROM bi_access_groups g
     JOIN bi_access_group_members m ON m.group_id = g.id
     WHERE g.workspace_id = $1 AND m.user_id = $2 AND g.enabled = true`,
    [workspaceId, userId],
  )

  if (!rows.length) {
    return {
      unrestricted: true,
      allowedTables: [],
      deniedColumns: {},
      rowFilters: [],
      groupIds: [],
    }
  }

  const allowedSets = []
  const deniedColumns = {}
  const rowFilters = []
  const groupIds = []

  for (const row of rows) {
    groupIds.push(row.id)
    const allowed = Array.isArray(row.allowed_tables) ? row.allowed_tables : []
    if (allowed.length) allowedSets.push(new Set(allowed.map(String)))
    const denied =
      row.denied_columns && typeof row.denied_columns === 'object'
        ? row.denied_columns
        : {}
    for (const [table, cols] of Object.entries(denied)) {
      const key = String(table)
      const list = Array.isArray(cols) ? cols.map(String) : []
      deniedColumns[key] = [...new Set([...(deniedColumns[key] || []), ...list])]
    }
    rowFilters.push(...normalizeBoardFilters(row.row_filters || []))
  }

  let allowedTables = []
  if (allowedSets.length) {
    let intersection = allowedSets[0]
    for (let i = 1; i < allowedSets.length; i++) {
      intersection = new Set([...intersection].filter((t) => allowedSets[i].has(t)))
    }
    allowedTables = [...intersection]
  }

  return {
    unrestricted: false,
    allowedTables,
    deniedColumns,
    rowFilters,
    groupIds,
  }
}

/** Extract table names referenced in SQL (FROM/JOIN). */
export function extractSqlTableRefs(sql) {
  const refs = new Set()
  const text = String(sql || '')
  const fromRe = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi
  let m
  while ((m = fromRe.exec(text))) {
    const raw = m[1]
    const short = raw.includes('.') ? raw.split('.').pop() : raw
    if (!['select', 'where', 'group', 'order', 'limit'].includes(short.toLowerCase())) {
      refs.add(short)
    }
  }
  return [...refs]
}

/**
 * Validate SQL against BI access policy.
 * @param {string} sql
 * @param {object} access
 */
export function validateBiSqlAccess(sql, access = {}) {
  if (access.unrestricted) return { allowed: true }

  const tables = extractSqlTableRefs(sql)
  if (access.allowedTables?.length) {
    const allowed = new Set(access.allowedTables.map(String))
    for (const t of tables) {
      if (!allowed.has(t)) {
        return {
          allowed: false,
          reason: `Table "${t}" is not in your BI access group`,
        }
      }
    }
  }

  const denied = access.deniedColumns || {}
  for (const [table, cols] of Object.entries(denied)) {
    for (const col of cols || []) {
      const re = new RegExp(`\\b${String(col).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(sql) && tables.includes(table)) {
        return {
          allowed: false,
          reason: `Column "${table}.${col}" is restricted by BI access policy`,
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * Apply row filters + strip denied columns from result rows.
 * @param {string} sql
 * @param {object} access
 */
export function applyBiAccessToSql(sql, access = {}) {
  if (access.unrestricted) return sql
  let out = String(sql || '').trim()
  const check = validateBiSqlAccess(out, access)
  if (!check.allowed) {
    const err = new Error(check.reason || 'BI access denied')
    err.status = 403
    throw err
  }
  if (access.rowFilters?.length) {
    out = applyFiltersToSql(out, access.rowFilters)
  }
  return out
}

/**
 * Mask denied columns in result set (defense in depth).
 * @param {object[]} rows
 * @param {string[]} columns
 * @param {object} access
 */
export function maskBiAccessColumns(rows, columns, access = {}) {
  if (access.unrestricted) return { rows, columns }

  const denyFlat = new Set()
  for (const cols of Object.values(access.deniedColumns || {})) {
    for (const c of cols || []) denyFlat.add(String(c).toLowerCase())
  }
  if (!denyFlat.size) return { rows, columns }

  const keepCols = columns.filter((c) => !denyFlat.has(String(c).toLowerCase()))
  const masked = rows.map((row) => {
    const next = { ...row }
    for (const c of columns) {
      if (denyFlat.has(String(c).toLowerCase())) delete next[c]
    }
    return next
  })
  return { rows: masked, columns: keepCols }
}

/** Current user's effective BI access (for UI badges). */
export async function getBiAccessSummary(workspaceId, userId, role) {
  const access = await resolveBiAccessForUser(workspaceId, userId, role)
  return {
    unrestricted: access.unrestricted,
    groupCount: access.groupIds?.length || 0,
    allowedTableCount: access.allowedTables?.length || 0,
    restrictedColumnCount: Object.values(access.deniedColumns || {}).reduce(
      (s, cols) => s + (cols?.length || 0),
      0,
    ),
    rowFilterCount: access.rowFilters?.length || 0,
  }
}
