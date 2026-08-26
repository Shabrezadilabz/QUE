/**
 * Blend multiple industry packs from schema match scores (Pack Studio).
 */
import { getIndustryPack } from './packs/index.js'

/**
 * @param {object[]} packs full pack objects
 * @param {{ packId: string, weight: number }[]} weights
 */
export function mergePackVariants(packs, weights = []) {
  const weightById = new Map(weights.map((w) => [w.packId, w.weight]))
  const tableMatchers = []
  const kpis = []
  const jobs = []
  const qualityRules = []
  const capabilities = []
  const seenKpi = new Set()
  const seenJob = new Set()
  let policies = {}

  for (const pack of packs) {
    const w = weightById.get(pack.id) ?? 1 / packs.length
    for (const m of pack.tableMatchers || []) {
      tableMatchers.push({ ...m, weight: (Number(m.weight) || 0.5) * w })
    }
    for (const k of pack.kpis || []) {
      if (!seenKpi.has(k.id)) {
        seenKpi.add(k.id)
        kpis.push(k)
      }
    }
    for (const j of pack.jobs || []) {
      if (!seenJob.has(j.id)) {
        seenJob.add(j.id)
        jobs.push(j)
      }
    }
    for (const q of pack.qualityRules || []) {
      if (!qualityRules.find((x) => x.id === q.id)) qualityRules.push(q)
    }
    for (const c of pack.capabilities || []) {
      if (!capabilities.find((x) => x.id === c.id)) capabilities.push(c)
    }
    policies = mergeStrictPolicies(policies, pack.policies || {})
  }

  const industries = [...new Set(packs.map((p) => p.industry))]
  const blendLabel = industries.slice(0, 2).join(' + ') || 'Blended'

  return {
    id: `blend-${packs.map((p) => p.id.replace(/-v1$/, '')).join('-')}`,
    industry: blendLabel,
    displayName: `${blendLabel} (blended)`,
    description: `AI-blended pack from ${packs.map((p) => p.displayName).join(', ')}`,
    minMatchScore: Math.min(...packs.map((p) => p.minMatchScore ?? 0.55)),
    tableMatchers,
    requiredForMonk: [...new Set(packs.flatMap((p) => p.requiredForMonk || []))],
    kpis,
    jobs,
    qualityRules,
    capabilities,
    dashboards: packs.find((p) => p.dashboards?.length)?.dashboards || [],
    goldenPairSource: packs.find((p) => p.goldenPairSource)?.goldenPairSource || null,
    policies,
    blendedFrom: packs.map((p) => p.id),
    blendWeights: Object.fromEntries(weightById),
  }
}

function mergeStrictPolicies(a, b) {
  return {
    hipaaStrict: Boolean(a.hipaaStrict || b.hipaaStrict),
    noAutoMaterialize: Boolean(a.noAutoMaterialize || b.noAutoMaterialize),
    noAutoFixApply: Boolean(a.noAutoFixApply || b.noAutoFixApply),
    immutableMonkLog: Boolean(a.immutableMonkLog || b.immutableMonkLog),
    noAutoPromoteJoins: Boolean(a.noAutoPromoteJoins || b.noAutoPromoteJoins),
    minJoinPromoteConfidence: Math.max(
      a.minJoinPromoteConfidence ?? 0,
      b.minJoinPromoteConfidence ?? 0,
      a.hipaaStrict || b.hipaaStrict ? 0.95 : 0.92,
    ),
    minCertRecall: Math.max(a.minCertRecall ?? 0, b.minCertRecall ?? 0, 0.35),
  }
}

/**
 * Build blended pack from rankPacksForWorkspace output.
 * @param {{ pack: { id: string }, score: number, scorePct: number }[]} ranked
 * @param {{ minScorePct?: number, maxPacks?: number }} opts
 */
export function buildBlendedPackFromRanked(ranked, opts = {}) {
  const minPct = opts.minScorePct ?? 35
  const maxPacks = opts.maxPacks ?? 3
  const eligible = (ranked || [])
    .filter((r) => r.scorePct >= minPct && r.pack?.id)
    .slice(0, maxPacks)
  if (eligible.length < 2) {
    const one = eligible[0]?.pack?.id
    return one ? getIndustryPack(one) : null
  }
  const total = eligible.reduce((s, r) => s + (r.score || 0), 0) || 1
  const weights = eligible.map((r) => ({
    packId: r.pack.id,
    weight: (r.score || 0) / total,
  }))
  const packs = eligible
    .map((r) => getIndustryPack(r.pack.id))
    .filter(Boolean)
  if (!packs.length) return null
  return mergePackVariants(packs, weights)
}
