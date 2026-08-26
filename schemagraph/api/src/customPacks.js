/**
 * Pack Studio — custom / blended industry packs per workspace.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getIndustryPack, listIndustryPacks } from './packs/index.js'
import { buildBlendedPackFromRanked } from './packVariantMerger.js'
import { rankPacksForWorkspace } from './templateMatcher.js'
import { buildSchemaContextPack } from './schemaContext.js'

function mapCustomRow(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    packId: r.pack_id,
    displayName: r.display_name,
    industry: r.industry,
    description: r.description,
    basePackIds: r.base_pack_ids || [],
    blendWeights: r.blend_weights || {},
    definition: r.definition_json || {},
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listCustomPacks(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM custom_pack_definitions
     WHERE workspace_id = $1 AND status <> 'archived'
     ORDER BY updated_at DESC`,
    [workspaceId],
  )
  return rows.map(mapCustomRow)
}

export async function getCustomPack(workspaceId, packId) {
  const { rows } = await query(
    `SELECT * FROM custom_pack_definitions
     WHERE workspace_id = $1 AND pack_id = $2`,
    [workspaceId, packId],
  )
  return rows[0] ? mapCustomRow(rows[0]) : null
}

/** Resolve pack: custom workspace pack or built-in registry. */
export function resolvePackDefinition(packId, customRecord = null) {
  if (customRecord?.definition && Object.keys(customRecord.definition).length) {
    return { ...customRecord.definition, id: customRecord.packId }
  }
  return getIndustryPack(packId)
}

export async function resolveWorkspacePack(workspaceId, packId) {
  const custom = await getCustomPack(workspaceId, packId)
  if (custom) return resolvePackDefinition(packId, custom)
  return getIndustryPack(packId)
}

/**
 * Create or update a custom pack from user definition (no code).
 */
export async function upsertCustomPack(workspaceId, body, userId = null) {
  const packId =
    body.packId ||
    `custom-${String(body.displayName || 'pack')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)}-${randomUUID().slice(0, 8)}`

  const definition = {
    id: packId,
    industry: body.industry || 'Custom',
    displayName: body.displayName || 'Custom pack',
    description: body.description || '',
    minMatchScore: Number(body.minMatchScore) || 0.5,
    tableMatchers: body.tableMatchers || body.entities?.map((e) => ({
      pattern: e.pattern || e.entity,
      weight: Number(e.weight) || 0.8,
      entity: e.entity || e.pattern,
    })) || [],
    requiredForMonk: body.requiredForMonk || [],
    kpis: body.kpis || [],
    jobs: body.jobs || [],
    qualityRules: body.qualityRules || [],
    capabilities: body.capabilities || [],
    policies: body.policies || {},
  }

  const { rows } = await query(
    `INSERT INTO custom_pack_definitions (
       workspace_id, pack_id, display_name, industry, description,
       base_pack_ids, blend_weights, definition_json, status, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)
     ON CONFLICT (workspace_id, pack_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       industry = EXCLUDED.industry,
       description = EXCLUDED.description,
       base_pack_ids = EXCLUDED.base_pack_ids,
       blend_weights = EXCLUDED.blend_weights,
       definition_json = EXCLUDED.definition_json,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING *`,
    [
      workspaceId,
      packId,
      definition.displayName,
      definition.industry,
      definition.description,
      JSON.stringify(body.basePackIds || []),
      JSON.stringify(body.blendWeights || {}),
      JSON.stringify(definition),
      body.status || 'active',
      userId,
    ],
  )
  return mapCustomRow(rows[0])
}

/** AI-suggest blended pack from current schema. */
export async function suggestBlendedPack(workspaceId, opts = {}) {
  const packCtx = await buildSchemaContextPack(workspaceId)
  const ranked = rankPacksForWorkspace(packCtx.tables)
  const blended = buildBlendedPackFromRanked(ranked, {
    minScorePct: opts.minScorePct ?? 35,
    maxPacks: opts.maxPacks ?? 3,
  })
  return {
    ranked: ranked.map((r) => ({
      packId: r.pack.id,
      displayName: r.pack.displayName,
      scorePct: r.scorePct,
      canRunMonk: r.canRunMonk,
    })),
    blended,
    builtIn: listIndustryPacks(),
  }
}

export async function saveBlendedPackAsCustom(workspaceId, blended, userId = null) {
  if (!blended) {
    const err = new Error('no blended pack to save')
    err.status = 400
    throw err
  }
  return upsertCustomPack(
    workspaceId,
    {
      packId: blended.id,
      displayName: blended.displayName,
      industry: blended.industry,
      description: blended.description,
      basePackIds: blended.blendedFrom || [],
      blendWeights: blended.blendWeights || {},
      tableMatchers: blended.tableMatchers,
      requiredForMonk: blended.requiredForMonk,
      kpis: blended.kpis,
      jobs: blended.jobs,
      qualityRules: blended.qualityRules,
      capabilities: blended.capabilities,
      policies: blended.policies,
      status: 'active',
    },
    userId,
  )
}
