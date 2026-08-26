/**
 * Seed KPI registry from industry pack definitions (Phase 2).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { applyTablePlaceholders } from './templateMapper.js'
import { recordAuditEvent } from './auditLog.js'

function slugify(name) {
  return (
    String(name || 'metric')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'metric'
  )
}

/**
 * Build KPI SQL from pack template + table matches (pure, testable).
 * @param {object} kpi
 * @param {object[]} matches
 */
export function buildKpiSqlFromPack(kpi, matches) {
  const template =
    kpi.sqlTemplate ||
    kpi.expressionSql ||
    `-- ${kpi.label || kpi.id}\nSELECT 1 AS value`
  return applyTablePlaceholders(template, matches)
}

/**
 * Idempotent seed of metric_definitions from pack KPIs.
 * @param {string} workspaceId
 * @param {object} pack
 * @param {{ matches: object[] }} matchResult
 * @param {{ userId?: string|null }} [opts]
 */
export async function seedMetricsFromPack(
  workspaceId,
  pack,
  matchResult,
  opts = {},
) {
  const matches = matchResult?.matches || []
  const kpis = pack.kpis || []
  const created = []
  const updated = []

  for (const kpi of kpis) {
    const slug = slugify(`pack-${pack.id}-${kpi.id}`)
    const expressionSql = buildKpiSqlFromPack(kpi, matches)
    const name = kpi.label || kpi.id
    const description =
      kpi.ceoQuestion ||
      kpi.description ||
      `KPI from ${pack.displayName || pack.id}`

    const { rows: existing } = await query(
      `SELECT id FROM metric_definitions WHERE workspace_id = $1 AND slug = $2`,
      [workspaceId, slug],
    )

    if (existing[0]) {
      await query(
        `UPDATE metric_definitions SET
           name = $3, description = $4, expression_sql = $5,
           tags_json = $6::jsonb, lineage_json = $7::jsonb, updated_at = now()
         WHERE workspace_id = $1 AND id = $2`,
        [
          workspaceId,
          existing[0].id,
          name.slice(0, 200),
          String(description).slice(0, 2000),
          expressionSql.slice(0, 8000),
          JSON.stringify(['monk-mode', pack.id, kpi.id]),
          JSON.stringify({
            packId: pack.id,
            kpiId: kpi.id,
            source: 'monk_mode',
            tables: matches.map((m) => m.table),
          }),
        ],
      )
      updated.push(existing[0].id)
      continue
    }

    const id = randomUUID()
    await query(
      `INSERT INTO metric_definitions (
         id, workspace_id, name, slug, description, expression_sql,
         dataset_id, dimensions_json, certified, created_by,
         source_object_id, source_column_name, lineage_json, tags_json, owner_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,null,'[]'::jsonb,false,$7,null,'',$8::jsonb,$9::jsonb,$7)`,
      [
        id,
        workspaceId,
        name.slice(0, 200),
        slug,
        String(description).slice(0, 2000),
        expressionSql.slice(0, 8000),
        opts.userId ?? null,
        JSON.stringify({
          packId: pack.id,
          kpiId: kpi.id,
          source: 'monk_mode',
          tables: matches.map((m) => m.table),
        }),
        JSON.stringify(['monk-mode', pack.id, kpi.id]),
      ],
    )
    created.push(id)
  }

  if (created.length) {
    void recordAuditEvent({
      workspaceId,
      actorUserId: opts.userId ?? null,
      action: 'metric.seed_pack',
      resourceType: 'metric',
      resourceId: pack.id,
      summary: `Seeded ${created.length} KPIs from ${pack.displayName || pack.id}`,
    })
  }

  return {
    created: created.length,
    updated: updated.length,
    total: kpis.length,
    ids: [...created, ...updated],
  }
}
