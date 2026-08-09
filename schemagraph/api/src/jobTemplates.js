/**
 * Phase 2 — Job / stitch templates gallery.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { createJob, createStitchJobFromTables } from './jobs.js'
import {
  buildNotebookFromFields,
  normalizeNotebook,
} from './jobNotebook.js'

const SYSTEM_SEEDS = [
  {
    name: 'Fact ↔ Dim stitch',
    slug: 'fact-dim-stitch',
    kind: 'stitch',
    description: 'Join a fact table to dimension keys (orders ↔ customers).',
    notes:
      'Promote joins first. Replace table names with your fact/dim pair.',
    sql: `-- Que template: fact ↔ dim\n-- SELECT f.*, d.*\n-- FROM fact_orders f\n-- JOIN dim_customer d ON f.customer_id = d.customer_id`,
  },
  {
    name: 'CRM enrich',
    slug: 'crm-enrich',
    kind: 'enrich',
    description: 'Enrich warehouse entities with Salesforce/CRM attributes.',
    notes: 'Use promoted CRM↔warehouse joins only.',
    sql: `-- Que template: CRM enrich\n-- SELECT w.*, c.account_name, c.owner_email\n-- FROM warehouse_accounts w\n-- LEFT JOIN crm_accounts c ON w.external_id = c.id`,
  },
  {
    name: 'SCD2 dimension sketch',
    slug: 'scd2-dim',
    kind: 'scd2',
    description: 'Sketch an SCD2 dimension from a staged source.',
    notes: 'Ship via dbt; Que freezes the join contract only.',
    sql: `-- Que template: SCD2 sketch\n-- SELECT *, valid_from, valid_to, is_current\n-- FROM stg_customer`,
  },
]

function slugify(name) {
  return String(name || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'template'
}

function mapTemplate(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    description: r.description || '',
    kind: r.kind || 'custom',
    notebook: normalizeNotebook(r.notebook_json),
    defaultTables: Array.isArray(r.default_tables) ? r.default_tables : [],
    isSystem: Boolean(r.is_system),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function ensureSystemTemplates(workspaceId) {
  for (const seed of SYSTEM_SEEDS) {
    const { rows } = await query(
      `SELECT id FROM job_templates WHERE workspace_id = $1 AND slug = $2`,
      [workspaceId, seed.slug],
    )
    if (rows.length) continue
    const notebook = buildNotebookFromFields({
      title: seed.name,
      notes: seed.notes,
      sqlText: seed.sql,
      tables: [],
      status: 'draft',
    })
    await query(
      `INSERT INTO job_templates (
         id, workspace_id, name, slug, description, kind,
         notebook_json, default_tables, is_system
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'[]'::jsonb,true)`,
      [
        randomUUID(),
        workspaceId,
        seed.name,
        seed.slug,
        seed.description,
        seed.kind,
        JSON.stringify(notebook),
      ],
    )
  }
}

export async function listJobTemplates(workspaceId) {
  await ensureSystemTemplates(workspaceId)
  const { rows } = await query(
    `SELECT * FROM job_templates
     WHERE workspace_id = $1
     ORDER BY is_system DESC, name ASC`,
    [workspaceId],
  )
  return rows.map(mapTemplate)
}

export async function createJobTemplate(workspaceId, body = {}, userId = null) {
  const name = String(body.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  const slug = slugify(body.slug || name)
  const notebook = Array.isArray(body.notebook)
    ? normalizeNotebook(body.notebook)
    : buildNotebookFromFields({
        title: name,
        notes: body.description || '',
        sqlText: body.sqlText || '-- Que template',
        tables: body.defaultTables || [],
        status: 'draft',
      })
  const id = randomUUID()
  await query(
    `INSERT INTO job_templates (
       id, workspace_id, name, slug, description, kind,
       notebook_json, default_tables, is_system, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,false,$9)`,
    [
      id,
      workspaceId,
      name.slice(0, 120),
      slug,
      String(body.description || '').slice(0, 500),
      String(body.kind || 'custom').slice(0, 40),
      JSON.stringify(notebook),
      JSON.stringify(
        Array.isArray(body.defaultTables)
          ? body.defaultTables.map(String).slice(0, 40)
          : [],
      ),
      userId,
    ],
  )
  const { rows } = await query(
    `SELECT * FROM job_templates WHERE id = $1`,
    [id],
  )
  return mapTemplate(rows[0])
}

export async function deleteJobTemplate(workspaceId, templateId) {
  const { rowCount } = await query(
    `DELETE FROM job_templates
     WHERE workspace_id = $1 AND id = $2 AND is_system = false`,
    [workspaceId, templateId],
  )
  return rowCount > 0
}

/**
 * Instantiate a template into a real job.
 */
export async function applyJobTemplate(workspaceId, templateId, body = {}) {
  const { rows } = await query(
    `SELECT * FROM job_templates WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, templateId],
  )
  if (!rows.length) {
    const err = new Error('template not found')
    err.status = 404
    throw err
  }
  const t = mapTemplate(rows[0])
  const tables =
    Array.isArray(body.tableNames) && body.tableNames.length
      ? body.tableNames.map(String)
      : t.defaultTables
  const title = String(body.title || t.name).slice(0, 160)

  if (tables.length >= 1) {
    try {
      return await createStitchJobFromTables(workspaceId, {
        tableNames: tables,
        title,
        notes: t.description,
      })
    } catch {
      /* fall through to plain create */
    }
  }

  return createJob(workspaceId, {
    title,
    notes: t.description,
    tables,
    notebook: t.notebook,
    status: 'draft',
  })
}
