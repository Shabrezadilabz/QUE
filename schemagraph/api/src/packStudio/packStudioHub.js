/**
 * Pack Studio hub — readiness summary for blend, maps, golden pairs, replication, exports.
 */
import { suggestBlendedPack, listCustomPacks } from '../customPacks.js'
import { listLearnedGoldenPairs } from '../learnGoldenPairs.js'
import { listReplicationPipelines } from '../connectionReplication.js'
import { getLatestPackCertification } from '../packCertification.js'

export const PACK_STUDIO_EXPORT_TARGETS = [
  { id: 'looker', label: 'Looker / LookML', route: 'looker' },
  { id: 'metabase', label: 'Metabase', route: 'metabase' },
  { id: 'powerbi', label: 'Power BI', route: 'powerbi' },
  { id: 'tableau', label: 'Tableau', route: 'tableau' },
  { id: 'dbt', label: 'dbt bundle', route: 'monk' },
]

/**
 * Pure readiness rollup for Pack Studio dashboard cards.
 * @param {object} input
 */
export function summarizePackStudioReadiness(input = {}) {
  const ranked = input.ranked || []
  const topScore = ranked[0]?.scorePct ?? 0
  const goldenCount = input.goldenPairCount ?? 0
  const pipelineCount = input.pipelineCount ?? 0
  const failedPipelines = input.failedPipelineCount ?? 0
  const customCount = input.customPackCount ?? 0
  const mappingCount = input.mappingCount ?? 0
  const certStatus = input.certificationStatus ?? null

  let status = 'empty'
  if (topScore >= 70 && goldenCount >= 3 && pipelineCount > 0) {
    status = 'ready'
  } else if (topScore >= 40 || goldenCount > 0 || customCount > 0) {
    status = 'review'
  }

  return {
    status,
    topPackScore: topScore,
    topPackId: ranked[0]?.packId ?? null,
    topPackName: ranked[0]?.displayName ?? null,
    goldenPairCount: goldenCount,
    pipelineCount,
    failedPipelineCount: failedPipelines,
    customPackCount: customCount,
    mappingCount,
    certificationStatus: certStatus,
    exportTargets: PACK_STUDIO_EXPORT_TARGETS.length,
    label:
      status === 'ready'
        ? 'Pack Studio ready'
        : status === 'review'
          ? 'Needs pack tuning'
          : 'Start with AI blend',
  }
}

/**
 * @param {string} workspaceId
 */
export async function buildPackStudioSummary(workspaceId) {
  const packId = 'ecommerce-v1'
  const [suggest, goldenPairs, pipelines, customPacks, cert] = await Promise.all([
    suggestBlendedPack(workspaceId, { minScorePct: 35 }).catch(() => ({
      ranked: [],
      blended: null,
    })),
    listLearnedGoldenPairs(workspaceId).catch(() => []),
    listReplicationPipelines(workspaceId).catch(() => []),
    listCustomPacks(workspaceId).catch(() => []),
    getLatestPackCertification(workspaceId, packId).catch(() => null),
  ])

  const failedPipelines = (pipelines || []).filter(
    (p) => p.lastStatus === 'failed' || p.lastStatus === 'error',
  ).length

  const readiness = summarizePackStudioReadiness({
    ranked: suggest.ranked || [],
    goldenPairCount: goldenPairs.length,
    pipelineCount: pipelines.length,
    failedPipelineCount: failedPipelines,
    customPackCount: customPacks.length,
    mappingCount: 0,
    certificationStatus: cert?.status ?? null,
  })

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    ranked: suggest.ranked || [],
    blended: suggest.blended || null,
    goldenPairs: goldenPairs.slice(0, 12),
    goldenPairCount: goldenPairs.length,
    pipelines: (pipelines || []).map((p) => ({
      id: p.id,
      tableNames: p.tableNames || [],
      lastStatus: p.lastStatus,
      lastRowCount: p.lastRowCount,
      lastRunAt: p.lastRunAt,
    })),
    customPackCount: customPacks.length,
    certification: cert,
    exportTargets: PACK_STUDIO_EXPORT_TARGETS,
    readiness,
  }
}
