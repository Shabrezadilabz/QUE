/**
 * Column profiling on synced schema metadata (Phase 1 — no full table scans).
 */
import { query } from './db.js'
import { buildSchemaContextPack } from './schemaContext.js'
import { leafName } from './inferJoins.js'

function mapProfileRow(r) {
  return {
    id: r.id,
    tableName: r.table_name,
    columnName: r.column_name,
    dataType: r.data_type,
    nullRate: r.null_rate != null ? Number(r.null_rate) : null,
    distinctCount: r.distinct_count != null ? Number(r.distinct_count) : null,
    sampleValues: Array.isArray(r.sample_values) ? r.sample_values : [],
    profiledAt: r.profiled_at,
  }
}

/**
 * Build profiles from schema column metadata (sample_values, types).
 * @param {string} workspaceId
 * @param {{ maxTables?: number }} [opts]
 */
export async function profileWorkspaceColumns(workspaceId, opts = {}) {
  const pack = await buildSchemaContextPack(workspaceId)
  const maxTables = opts.maxTables ?? 40
  const tables = (pack.tables || []).slice(0, maxTables)
  let profiled = 0

  for (const t of tables) {
    for (const c of t.columns || []) {
      const samples = Array.isArray(c.samples) ? c.samples : []
      const distinctCount = samples.length ? new Set(samples.map(String)).size : null
      const nullRate = null
      await query(
        `INSERT INTO column_profiles (
           workspace_id, schema_object_id, table_name, column_name,
           data_type, null_rate, distinct_count, sample_values, profile_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (workspace_id, table_name, column_name)
         DO UPDATE SET
           schema_object_id = EXCLUDED.schema_object_id,
           data_type = EXCLUDED.data_type,
           null_rate = EXCLUDED.null_rate,
           distinct_count = EXCLUDED.distinct_count,
           sample_values = EXCLUDED.sample_values,
           profile_json = EXCLUDED.profile_json,
           profiled_at = now()`,
        [
          workspaceId,
          t.id,
          t.name,
          c.name,
          c.dataType || null,
          nullRate,
          distinctCount,
          JSON.stringify(samples.slice(0, 5)),
          JSON.stringify({
            keyKind: c.keyKind,
            references: c.references || null,
            sourceType: t.sourceType,
            connection: t.connection,
          }),
        ],
      )
      profiled += 1
    }
  }

  return {
    ok: true,
    tableCount: tables.length,
    columnCount: profiled,
    profiledAt: new Date().toISOString(),
  }
}

export async function listColumnProfiles(workspaceId, opts = {}) {
  const limit = Math.min(Number(opts.limit) || 200, 500)
  const table = opts.tableName
    ? String(opts.tableName).trim()
    : null
  const params = [workspaceId]
  let sql = `SELECT * FROM column_profiles WHERE workspace_id = $1`
  if (table) {
    params.push(table)
    sql += ` AND (table_name = $2 OR table_name ILIKE $2)`
  }
  sql += ` ORDER BY table_name, column_name LIMIT ${limit}`
  const { rows } = await query(sql, params)
  return rows.map(mapProfileRow)
}

/**
 * Seed steward inbox from ecommerce pack quality hints + profile gaps.
 * @param {string} workspaceId
 * @param {string|null} runId
 * @param {object} pack
 * @param {object} matchResult from scorePackAgainstSchema
 */
export async function seedQualityIssuesFromPack(
  workspaceId,
  runId,
  pack,
  matchResult,
) {
  const created = []
  for (const m of matchResult.missing || []) {
    const { rows } = await query(
      `INSERT INTO steward_inbox_issues (
         workspace_id, run_id, issue_kind, severity, status,
         title, description, table_name, proposal_json
       ) VALUES ($1,$2,'mapping','high','open',$3,$4,$5,$6)
       RETURNING id`,
      [
        workspaceId,
        runId,
        `Missing table: ${m}`,
        `Template expects a table matching "${m}". Sync Sources or run SportEdge bootstrap.`,
        m,
        JSON.stringify({ pattern: m, packId: pack.id }),
      ],
    )
    if (rows[0]) created.push(rows[0].id)
  }

  for (const rule of pack.qualityRules || []) {
    const { rows } = await query(
      `INSERT INTO steward_inbox_issues (
         workspace_id, run_id, issue_kind, severity, status,
         title, description, proposal_json
       ) VALUES ($1,$2,'quality',$3,'open',$4,$5,$6)
       RETURNING id`,
      [
        workspaceId,
        runId,
        rule.severity || 'medium',
        rule.title,
        rule.description,
        JSON.stringify({ ruleId: rule.id, packId: pack.id }),
      ],
    )
    if (rows[0]) created.push(rows[0].id)
  }

  return { created: created.length, ids: created }
}

export function tableProfileSummary(profiles, tableName) {
  const n = String(tableName || '').toLowerCase()
  return (profiles || []).filter(
    (p) =>
      p.tableName.toLowerCase() === n ||
      leafName(p.tableName).toLowerCase() === n,
  )
}
