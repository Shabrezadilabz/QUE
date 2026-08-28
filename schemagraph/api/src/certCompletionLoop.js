/**
 * S3 — Certified KPI completion loop after Monk cert passes.
 */
import { query } from './db.js'
import { seedDashboardsFromPack } from './dashboardTemplates.js'
import { seedSportedgeGoldenSchedule } from './packCertification.js'
import { runMonkPostCertDeliverables } from './monkDeliverables.js'
import { exportSemanticLayerBundle } from './semanticLayerExport.js'
import { getCertChecklist } from './certChecklist.js'
import { listManagedDatasets, certifyManagedDataset } from './managedDataPlane.js'
import { updateBiChart } from './certifiedBi.js'

/**
 * @param {string} workspaceId
 * @param {object} pack
 * @param {object} certResult
 * @param {object} [opts]
 */
export async function runCertifiedKpiCompletion(
  workspaceId,
  pack,
  certResult,
  opts = {},
) {
  const steps = []
  if (!certResult?.passed) {
    return { skipped: true, reason: 'cert_not_passed', steps }
  }

  try {
    const { rows } = await query(
      `UPDATE metric_definitions
       SET certified = true, updated_at = now()
       WHERE workspace_id = $1
         AND (tags_json @> $2::jsonb OR tags_json @> $3::jsonb)
       RETURNING id`,
      [
        workspaceId,
        JSON.stringify(['monk-mode']),
        JSON.stringify(['pack']),
      ],
    )
    steps.push({
      id: 'certify_metrics',
      ok: true,
      message: `Certified ${rows.length} pack KPI metric(s)`,
    })
  } catch (err) {
    steps.push({
      id: 'certify_metrics',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const datasets = await listManagedDatasets(workspaceId)
    const mart =
      datasets.find((d) => d.slug?.includes('brand-revenue')) ||
      datasets.find((d) => d.name?.toLowerCase().includes('brand')) ||
      datasets[0]
    if (mart && !mart.certified) {
      await certifyManagedDataset(workspaceId, mart.id, opts.userId ?? null)
      steps.push({
        id: 'certify_mart',
        ok: true,
        message: `Certified mart “${mart.name}”`,
      })
    } else if (mart?.certified) {
      steps.push({
        id: 'certify_mart',
        ok: true,
        message: `Mart “${mart.name}” already certified`,
      })
    }
  } catch (err) {
    steps.push({
      id: 'certify_mart',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const dash = await seedDashboardsFromPack(workspaceId, pack, {
      userId: opts.userId ?? null,
      certify: true,
    })
    steps.push({
      id: 'report_studio_rs1',
      ok: (dash.created + dash.updated) >= 3 || dash.charts?.length >= 3,
      message: `Report Studio: ${dash.created} new, ${dash.updated} updated widgets`,
      detail: dash,
    })
  } catch (err) {
    steps.push({
      id: 'report_studio_rs1',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const golden = await seedSportedgeGoldenSchedule(
      workspaceId,
      opts.userId ?? null,
    )
    steps.push({
      id: 'golden_schedule',
      ok: true,
      message: `Golden eval scheduled — ${golden.pairs} pairs`,
      detail: golden,
    })
  } catch (err) {
    steps.push({
      id: 'golden_schedule',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const semantic = await exportSemanticLayerBundle(workspaceId, {
      packId: pack.id,
      certifiedOnly: true,
    })
    steps.push({
      id: 'semantic_export',
      ok: semantic.metricCount > 0,
      message: `Semantic layer: ${semantic.metricCount} metric(s) exported`,
      detail: { files: semantic.files.map((f) => f.path) },
    })
  } catch (err) {
    steps.push({
      id: 'semantic_export',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const deliverables = await runMonkPostCertDeliverables(
      workspaceId,
      pack,
      certResult,
      {
        userId: opts.userId ?? null,
        connectionId: opts.connectionId ?? null,
        matchResult: opts.matchResult ?? null,
        forceDbt: true,
      },
    )
    for (const step of deliverables.steps || []) {
      steps.push({ id: `ship_${step.id}`, ...step })
    }
  } catch (err) {
    steps.push({
      id: 'ship_deliverables',
      ok: false,
      message: err.message || String(err),
    })
  }

  const checklist = await getCertChecklist(workspaceId, { packId: pack.id })

  return {
    steps,
    checklist,
    passed: certResult.passed,
  }
}
