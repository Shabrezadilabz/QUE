/**
 * Monk post-cert deliverables — dbt export, BI ship, replication, golden pairs.
 */
import { findPackJobs } from './packMartMaterialize.js'
import { exportJob } from './jobs.js'
import { learnAndSyncGoldenPairs } from './learnGoldenPairs.js'
import {
  seedReplicationFromPackTables,
  runReplicationPipeline,
} from './connectionReplication.js'
import {
  exportLookerPack,
  exportMetabasePack,
  formatBiExportMarkdown,
} from './biPlatformExport.js'
import { createShipDraft, approveShip } from './shipToBi.js'
import { resolveLiveTarget } from './liveExec.js'

/**
 * Run after Monk certification passes.
 */
export async function runMonkPostCertDeliverables(
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
    const golden = await learnAndSyncGoldenPairs(workspaceId, {
      connectionId: opts.connectionId,
    })
    steps.push({
      id: 'learn_golden_pairs',
      ok: true,
      message: `Learned ${golden.learnedCount} golden pair(s) from joins + query history`,
      detail: golden,
    })
  } catch (err) {
    steps.push({
      id: 'learn_golden_pairs',
      ok: false,
      message: err.message || String(err),
    })
  }

  try {
    const connection = await resolveLiveTarget(workspaceId, {}, null)
    const matches = opts.matchResult?.matches || []
    const tables = matches.map((m) => m.table).filter(Boolean)
    if (connection?.id && tables.length) {
      const pipeline = await seedReplicationFromPackTables(
        workspaceId,
        connection.id,
        tables,
        opts.userId ?? null,
      )
      if (!pipeline.skipped) {
        const run = await runReplicationPipeline(
          workspaceId,
          pipeline.id,
          opts.userId ?? null,
        ).catch((e) => ({ error: e.message }))
        steps.push({
          id: 'replication_pipeline',
          ok: !run.error,
          message: run.error
            ? `Replication queued; first run: ${run.error}`
            : `Replicated ${run.totalRows ?? 0} rows to que_replica`,
          detail: { pipeline, run },
        })
      }
    }
  } catch (err) {
    steps.push({
      id: 'replication_pipeline',
      ok: false,
      message: err.message || String(err),
    })
  }

  const packJobs = await findPackJobs(workspaceId, pack.id)
  const dbtExports = []
  for (const pj of packJobs.slice(0, 5)) {
    try {
      const out = await exportJob(workspaceId, pj.id, 'dbt', {
        actorUserId: opts.userId ?? null,
        force: Boolean(opts.forceDbt),
      })
      dbtExports.push({
        jobId: pj.id,
        recipeId: pj.recipeId,
        modelName: out.export?.modelName || out.export?.files?.[0]?.path,
      })
    } catch (err) {
      dbtExports.push({
        jobId: pj.id,
        error: String(err.message || err).slice(0, 200),
      })
    }
  }
  steps.push({
    id: 'dbt_export',
    ok: dbtExports.some((d) => !d.error),
    message: dbtExports.some((d) => !d.error)
      ? `dbt bundle: ${dbtExports.filter((d) => !d.error).length} job(s) exported`
      : 'dbt export skipped — promote joins and re-run Monk',
    detail: dbtExports,
  })

  try {
    const looker = await exportLookerPack(workspaceId, {
      reportId: pack.dashboards?.[0]?.id || 'ceo-revenue',
      packId: pack.id,
    })
    const metabase = await exportMetabasePack(workspaceId, {
      reportId: pack.dashboards?.[0]?.id || 'ceo-revenue',
    })
    steps.push({
      id: 'bi_platform_export',
      ok: true,
      message: `Looker (${looker.files?.length || 0} views) + Metabase dashboard JSON ready`,
      detail: {
        lookerFileCount: looker.files?.length || 0,
        metabaseCardCount: metabase.dashboard?.cards?.length || 0,
        lookerMarkdown: formatBiExportMarkdown(looker).slice(0, 4000),
      },
    })

    if (opts.userId) {
      try {
        const draft = await createShipDraft(workspaceId, {
          title: `${pack.displayName} — CEO dashboard`,
          userId: opts.userId,
        })
        await approveShip(workspaceId, draft.id, opts.userId)
        steps.push({
          id: 'bi_ship',
          ok: true,
          message: 'CEO dashboard ship draft approved with embed token',
          detail: { shipId: draft.id },
        })
      } catch {
        /* ship optional */
      }
    }
  } catch (err) {
    steps.push({
      id: 'bi_platform_export',
      ok: false,
      message: err.message || String(err),
    })
  }

  return { steps, dbtExports }
}
