/**
 * Phase 4 — Business glossary + term ↔ table/column links.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

function slugify(name) {
  return (
    String(name || 'term')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'term'
  )
}

function mapTerm(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    definition: r.definition || '',
    status: r.status,
    ownerUserId: r.owner_user_id,
    ownerEmail: r.owner_email || null,
    synonyms: Array.isArray(r.synonyms_json) ? r.synonyms_json : [],
    linkCount: Number(r.link_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listGlossaryTerms(workspaceId, { status } = {}) {
  const params = [workspaceId]
  let where = 't.workspace_id = $1'
  if (status && status !== 'all') {
    params.push(status)
    where += ` AND t.status = $${params.length}`
  }
  const { rows } = await query(
    `SELECT t.*, u.email AS owner_email,
            (SELECT COUNT(*)::int FROM glossary_term_links l WHERE l.term_id = t.id) AS link_count
     FROM glossary_terms t
     LEFT JOIN users u ON u.id = t.owner_user_id
     WHERE ${where}
     ORDER BY t.name ASC
     LIMIT 200`,
    params,
  )
  return rows.map(mapTerm)
}

export async function createGlossaryTerm(workspaceId, body = {}, userId = null) {
  const name = String(body.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  let slug = slugify(body.slug || name)
  const id = randomUUID()
  const synonyms = Array.isArray(body.synonyms)
    ? body.synonyms.map(String).filter(Boolean).slice(0, 20)
    : []
  for (let i = 0; i < 5; i++) {
    try {
      await query(
        `INSERT INTO glossary_terms (
           id, workspace_id, name, slug, definition, status, owner_user_id, synonyms_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          id,
          workspaceId,
          name,
          slug,
          String(body.definition || '').slice(0, 4000),
          ['draft', 'approved', 'deprecated'].includes(body.status)
            ? body.status
            : 'draft',
          body.ownerUserId || userId || null,
          JSON.stringify(synonyms),
        ],
      )
      break
    } catch (err) {
      if (String(err.message || '').includes('unique') || err.code === '23505') {
        slug = `${slugify(name)}-${i + 2}`
        continue
      }
      throw err
    }
  }
  const terms = await listGlossaryTerms(workspaceId)
  return terms.find((t) => t.id === id)
}

export async function updateGlossaryTerm(workspaceId, termId, patch = {}) {
  const { rows: cur } = await query(
    `SELECT * FROM glossary_terms WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, termId],
  )
  if (!cur[0]) {
    const err = new Error('term not found')
    err.status = 404
    throw err
  }
  const c = cur[0]
  const name = patch.name != null ? String(patch.name).trim() : c.name
  const definition =
    patch.definition != null
      ? String(patch.definition).slice(0, 4000)
      : c.definition
  const status = ['draft', 'approved', 'deprecated'].includes(patch.status)
    ? patch.status
    : c.status
  const synonyms = Array.isArray(patch.synonyms)
    ? patch.synonyms.map(String).filter(Boolean).slice(0, 20)
    : c.synonyms_json
  await query(
    `UPDATE glossary_terms SET
       name = $3, definition = $4, status = $5, synonyms_json = $6::jsonb,
       owner_user_id = COALESCE($7, owner_user_id),
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      termId,
      name,
      definition,
      status,
      JSON.stringify(synonyms || []),
      patch.ownerUserId || null,
    ],
  )
  const terms = await listGlossaryTerms(workspaceId)
  return terms.find((t) => t.id === termId)
}

export async function deleteGlossaryTerm(workspaceId, termId) {
  await query(
    `DELETE FROM glossary_terms WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, termId],
  )
  return { ok: true }
}

export async function listTermLinks(workspaceId, termId) {
  const { rows } = await query(
    `SELECT id, term_id, schema_object_id, schema_column_id, table_name, column_name, created_at
     FROM glossary_term_links
     WHERE workspace_id = $1 AND term_id = $2
     ORDER BY created_at DESC`,
    [workspaceId, termId],
  )
  return rows.map((r) => ({
    id: r.id,
    termId: r.term_id,
    schemaObjectId: r.schema_object_id,
    schemaColumnId: r.schema_column_id,
    tableName: r.table_name,
    columnName: r.column_name,
    createdAt: r.created_at,
  }))
}

export async function linkTermToColumn(workspaceId, termId, body = {}) {
  const tableName = String(body.tableName || body.table || '').trim()
  const columnName = String(body.columnName || body.column || '').trim() || null
  if (!tableName) {
    const err = new Error('tableName required')
    err.status = 400
    throw err
  }
  let objectId = body.schemaObjectId || null
  let columnId = body.schemaColumnId || null
  if (!objectId) {
    const { rows } = await query(
      `SELECT id FROM schema_objects
       WHERE workspace_id = $1 AND lower(name) = lower($2) LIMIT 1`,
      [workspaceId, tableName],
    )
    objectId = rows[0]?.id || null
  }
  if (columnName && objectId && !columnId) {
    const { rows } = await query(
      `SELECT id FROM schema_columns
       WHERE schema_object_id = $1 AND lower(name) = lower($2) LIMIT 1`,
      [objectId, columnName],
    )
    columnId = rows[0]?.id || null
  }
  const id = randomUUID()
  await query(
    `INSERT INTO glossary_term_links (
       id, workspace_id, term_id, schema_object_id, schema_column_id, table_name, column_name
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, workspaceId, termId, objectId, columnId, tableName, columnName],
  )
  return { id, termId, tableName, columnName, schemaObjectId: objectId }
}
