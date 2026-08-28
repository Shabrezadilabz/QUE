/**
 * Sprint 12 — Pack Studio fork / diff / merge variants (pure, testable).
 */
import { mergePackVariants } from './packVariantMerger.js'

function clonePack(pack) {
  return JSON.parse(JSON.stringify(pack))
}

/**
 * Fork a pack definition with optional overrides (Pack Studio UX).
 */
export function forkPackDefinition(basePack, opts = {}) {
  if (!basePack?.id) {
    const err = new Error('base pack required')
    err.status = 400
    throw err
  }
  const suffix = String(opts.suffix || 'fork').replace(/[^a-z0-9-]/gi, '-').slice(0, 24)
  const fork = clonePack(basePack)
  fork.id = opts.packId || `${basePack.id.replace(/-v1$/, '')}-${suffix}-v1`
  fork.displayName = opts.displayName || `${basePack.displayName || basePack.id} (fork)`
  fork.description =
    opts.description ||
    `Forked from ${basePack.id} — customize KPIs/jobs without editing built-in registry.`
  fork.forkedFrom = basePack.id
  fork.forkedAt = new Date().toISOString()
  if (opts.kpis) fork.kpis = opts.kpis
  if (opts.jobs) fork.jobs = opts.jobs
  if (opts.tableMatchers) fork.tableMatchers = opts.tableMatchers
  if (opts.policies) fork.policies = { ...(fork.policies || {}), ...opts.policies }
  return fork
}

function idSet(items, key = 'id') {
  return new Set((items || []).map((x) => x[key]).filter(Boolean))
}

/**
 * Diff two pack definitions for Pack Studio merge review.
 */
export function diffPackDefinitions(left, right) {
  const lKpis = idSet(left?.kpis)
  const rKpis = idSet(right?.kpis)
  const lJobs = idSet(left?.jobs)
  const rJobs = idSet(right?.jobs)
  const lMatchers = (left?.tableMatchers || []).map((m) => m.pattern || m.entity)
  const rMatchers = (right?.tableMatchers || []).map((m) => m.pattern || m.entity)

  return {
    leftId: left?.id || null,
    rightId: right?.id || null,
    kpis: {
      added: [...rKpis].filter((id) => !lKpis.has(id)),
      removed: [...lKpis].filter((id) => !rKpis.has(id)),
      unchanged: [...lKpis].filter((id) => rKpis.has(id)),
    },
    jobs: {
      added: [...rJobs].filter((id) => !lJobs.has(id)),
      removed: [...lJobs].filter((id) => !rJobs.has(id)),
      unchanged: [...lJobs].filter((id) => rJobs.has(id)),
    },
    tableMatchers: {
      added: rMatchers.filter((p) => !lMatchers.includes(p)),
      removed: lMatchers.filter((p) => !rMatchers.includes(p)),
    },
    policyStrictnessIncreased: Boolean(
      (right?.policies?.hipaaStrict && !left?.policies?.hipaaStrict) ||
        (right?.policies?.noAutoPromoteJoins && !left?.policies?.noAutoPromoteJoins),
    ),
    summary: buildDiffSummary(left, right),
  }
}

function buildDiffSummary(left, right) {
  const parts = []
  const kpiAdded = (right?.kpis || []).length - (left?.kpis || []).length
  if (kpiAdded > 0) parts.push(`+${kpiAdded} KPIs`)
  if (kpiAdded < 0) parts.push(`${kpiAdded} KPIs`)
  const jobAdded = (right?.jobs || []).length - (left?.jobs || []).length
  if (jobAdded !== 0) parts.push(`${jobAdded > 0 ? '+' : ''}${jobAdded} jobs`)
  return parts.length ? parts.join(' · ') : 'No structural changes'
}

/**
 * Merge fork back into base using packVariantMerger weights.
 */
export function mergePackForkVariants(basePack, forkPack, weights = {}) {
  const wBase = Number(weights.base ?? 0.6)
  const wFork = Number(weights.fork ?? 0.4)
  return mergePackVariants([basePack, forkPack], [
    { packId: basePack.id, weight: wBase },
    { packId: forkPack.id, weight: wFork },
  ])
}

/**
 * API helper: fork built-in pack by id string.
 */
export function forkPackById(getPackFn, packId, opts = {}) {
  const base = getPackFn(packId)
  if (!base) {
    const err = new Error('pack not found')
    err.status = 404
    throw err
  }
  return forkPackDefinition(base, opts)
}
