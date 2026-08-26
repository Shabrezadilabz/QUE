/**
 * Monk Mode certification gate — golden join recall + KPI seed check.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { query } from './db.js'
import { evaluateGoldenSet } from './goldenSetEval.js'
import { getIndustryPack } from './packs/index.js'
import { getPackCertMinRecall } from './packPolicies.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_MIN_RECALL = Number(process.env.QUE_MONK_MIN_RECALL || 0.35)

let cachedSportedgePairs = null

export function loadSportedgeGoldenPairs() {
  if (cachedSportedgePairs) return cachedSportedgePairs
  const path = join(
    __dirname,
    '../../docs/testing/ecommerce/sportedge-golden-pairs.json',
  )
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  cachedSportedgePairs = Array.isArray(raw.pairs) ? raw.pairs : []
  return cachedSportedgePairs
}

/**
 * Evaluate whether workspace passes pack certification gate.
 * @param {string} workspaceId
 * @param {{ packId: string, runId?: string|null, minRecall?: number, pairs?: object[] }} opts
 */
export async function runPackCertificationGate(workspaceId, opts = {}) {
  const packId = opts.packId || 'ecommerce-v1'
  const pack = getIndustryPack(packId)
  const pairs = opts.pairs?.length
    ? opts.pairs
    : pack?.goldenPairSource
      ? loadSportedgeGoldenPairs()
      : []
  const minRecall =
    typeof opts.minRecall === 'number'
      ? opts.minRecall
      : getPackCertMinRecall(pack || { id: packId })

  const report = await evaluateGoldenSet(workspaceId, pairs)
  const passed = pairs.length
    ? report.recall >= minRecall
    : Boolean(opts.requiredOk)

  const { rows: kpiRows } = await query(
    `SELECT COUNT(*)::int AS n FROM metric_definitions
     WHERE workspace_id = $1 AND tags_json @> $2::jsonb`,
    [workspaceId, JSON.stringify(['monk-mode'])],
  )
  const kpiCount = kpiRows[0]?.n ?? 0

  const status = passed ? 'passed' : 'failed'
  const { rows } = await query(
    `INSERT INTO workspace_pack_certifications (
       workspace_id, run_id, pack_id, status,
       golden_recall, promoted_recall, kpi_count, report_json, certified_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     RETURNING *`,
    [
      workspaceId,
      opts.runId ?? null,
      packId,
      status,
      report.recall,
      report.promotedRecall,
      kpiCount,
      JSON.stringify({ ...report, minRecall, passed }),
      passed ? new Date() : null,
    ],
  )

  return {
    passed,
    status,
    minRecall,
    kpiCount,
    report,
    certification: rows[0]
      ? {
          id: rows[0].id,
          status: rows[0].status,
          goldenRecall: Number(rows[0].golden_recall),
          promotedRecall: Number(rows[0].promoted_recall),
          kpiCount: rows[0].kpi_count,
          certifiedAt: rows[0].certified_at,
        }
      : null,
  }
}

export async function getLatestPackCertification(workspaceId, packId) {
  const { rows } = await query(
    `SELECT * FROM workspace_pack_certifications
     WHERE workspace_id = $1 AND pack_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, packId],
  )
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    runId: r.run_id,
    packId: r.pack_id,
    status: r.status,
    goldenRecall: r.golden_recall != null ? Number(r.golden_recall) : null,
    promotedRecall: r.promoted_recall != null ? Number(r.promoted_recall) : null,
    kpiCount: r.kpi_count,
    jobCount: r.job_count,
    report: r.report_json || {},
    certifiedAt: r.certified_at,
    createdAt: r.created_at,
  }
}

/** Seed SportEdge golden pairs into scheduled eval config. */
export async function seedSportedgeGoldenSchedule(workspaceId, userId = null) {
  const pairs = loadSportedgeGoldenPairs()
  const { upsertGoldenEvalSchedule } = await import('./scheduledGoldenEval.js')
  const schedule = await upsertGoldenEvalSchedule(workspaceId, {
    enabled: true,
    intervalHours: 24,
    pairs,
    userId,
  })
  return { pairs: pairs.length, schedule }
}
