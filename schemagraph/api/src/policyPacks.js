/**
 * Phase 4 — Policy packs: PII tags, retention, access-request templates.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

const KINDS = ['pii', 'retention', 'access', 'custom']

function mapPack(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    kind: r.kind,
    rules: Array.isArray(r.rules_json) ? r.rules_json : [],
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listPolicyPacks(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM policy_packs
     WHERE workspace_id = $1
     ORDER BY kind, name
     LIMIT 100`,
    [workspaceId],
  )
  return rows.map(mapPack)
}

export async function createPolicyPack(workspaceId, body = {}) {
  const name = String(body.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  const id = randomUUID()
  const rules = Array.isArray(body.rules) ? body.rules.slice(0, 40) : []
  await query(
    `INSERT INTO policy_packs (
       id, workspace_id, name, kind, rules_json, enabled
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [
      id,
      workspaceId,
      name,
      KINDS.includes(body.kind) ? body.kind : 'custom',
      JSON.stringify(rules),
      body.enabled !== false,
    ],
  )
  const packs = await listPolicyPacks(workspaceId)
  return packs.find((p) => p.id === id)
}

export async function updatePolicyPack(workspaceId, packId, patch = {}) {
  const { rows } = await query(
    `SELECT * FROM policy_packs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, packId],
  )
  if (!rows[0]) {
    const err = new Error('policy pack not found')
    err.status = 404
    throw err
  }
  const c = rows[0]
  await query(
    `UPDATE policy_packs SET
       name = $3, kind = $4, rules_json = $5::jsonb, enabled = $6, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      packId,
      patch.name != null ? String(patch.name).trim() : c.name,
      KINDS.includes(patch.kind) ? patch.kind : c.kind,
      JSON.stringify(
        Array.isArray(patch.rules) ? patch.rules.slice(0, 40) : c.rules_json,
      ),
      patch.enabled != null ? Boolean(patch.enabled) : c.enabled,
    ],
  )
  return (await listPolicyPacks(workspaceId)).find((p) => p.id === packId)
}

export async function deletePolicyPack(workspaceId, packId) {
  await query(
    `DELETE FROM policy_packs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, packId],
  )
  return { ok: true }
}

/**
 * Seed default packs once if workspace has none.
 */
export async function ensureDefaultPolicyPacks(workspaceId) {
  const existing = await listPolicyPacks(workspaceId)
  if (existing.length) return existing
  await createPolicyPack(workspaceId, {
    name: 'PII tagging',
    kind: 'pii',
    rules: [
      { tag: 'pii.email', match: 'column_name:~email' },
      { tag: 'pii.phone', match: 'column_name:~phone|mobile' },
      { tag: 'pii.name', match: 'column_name:~first_name|last_name|full_name' },
    ],
  })
  await createPolicyPack(workspaceId, {
    name: 'Default retention',
    kind: 'retention',
    rules: [
      { retainDays: 365, appliesTo: 'certified_tables' },
      { retainDays: 90, appliesTo: 'suggested_samples' },
    ],
  })
  await createPolicyPack(workspaceId, {
    name: 'Access request',
    kind: 'access',
    rules: [
      {
        ticketTemplate:
          'Request access to {table} — business justification required',
        approverRole: 'admin',
      },
    ],
  })
  return listPolicyPacks(workspaceId)
}

/** Column names tagged as PII for grid masking. */
export async function loadPiiTaggedColumnNames(workspaceId) {
  const { rows } = await query(
    `SELECT c.name
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     WHERE o.workspace_id = $1
       AND COALESCE(c.meta_json->'piiTags', '[]'::jsonb) <> '[]'::jsonb`,
    [workspaceId],
  )
  return new Set(rows.map((r) => String(r.name || '').toLowerCase()).filter(Boolean))
}

/**
 * Apply PII pack rules to schema columns (persist tags in meta_json).
 */
export async function applyPiiPolicyPack(workspaceId, packId = null) {
  let packs = await listPolicyPacks(workspaceId)
  if (!packs.length) packs = await ensureDefaultPolicyPacks(workspaceId)
  const pack = packId
    ? packs.find((p) => p.id === packId)
    : packs.find((p) => p.kind === 'pii' && p.enabled)
  if (!pack) {
    const err = new Error('No enabled PII policy pack')
    err.status = 404
    throw err
  }

  const { rows: cols } = await query(
    `SELECT c.id, c.name, o.name AS table_name
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     WHERE o.workspace_id = $1
     LIMIT 2000`,
    [workspaceId],
  )

  let tagged = 0
  const preview = []
  for (const col of cols) {
    const n = String(col.name).toLowerCase()
    let colTags = []
    for (const rule of pack.rules) {
      const match = String(rule.match || '')
      const m = match.match(/column_name:~(.+)/)
      if (!m) continue
      const re = new RegExp(m[1], 'i')
      if (re.test(n)) {
        colTags.push(rule.tag)
        break
      }
    }
    if (!colTags.length) continue
    tagged += 1
    if (preview.length < 30) {
      preview.push({
        table: col.table_name,
        column: col.name,
        tag: colTags[0],
      })
    }
    await query(
      `UPDATE schema_columns SET meta_json = COALESCE(meta_json, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [col.id, JSON.stringify({ piiTags: colTags })],
    )
  }

  return {
    packId: pack.id,
    packName: pack.name,
    scannedColumns: cols.length,
    tagged,
    preview,
    note: 'PII tags persisted to schema_columns.meta_json — used for grid masking.',
  }
}
