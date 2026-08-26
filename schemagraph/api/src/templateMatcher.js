/**
 * Score workspace schema against industry template packs.
 */
import { leafName } from './inferJoins.js'
import { listIndustryPacks, getIndustryPack, listFullIndustryPacks } from './packs/index.js'

export { listIndustryPacks, getIndustryPack }

/**
 * @param {object[]} schemaTables from buildSchemaContextPack
 * @param {object} pack
 */
export function scorePackAgainstSchema(schemaTables, pack) {
  const tables = schemaTables || []
  const matchers = pack.tableMatchers || []
  if (!matchers.length) return { score: 0, matches: [], missing: [] }

  let weightSum = 0
  let hitWeight = 0
  /** @type {{ pattern: string, entity: string, table: string, connection: string|null }[]} */
  const matches = []
  /** @type {string[]} */
  const missing = []

  for (const m of matchers) {
    const w = Number(m.weight) || 0.5
    weightSum += w
    const pat = String(m.pattern || '').toLowerCase()
    const found = tables.find((t) => {
      const n = String(t.name || '').toLowerCase()
      const leaf = leafName(n).toLowerCase()
      return (
        n === pat ||
        leaf === pat ||
        n.includes(pat) ||
        pat.includes(leaf)
      )
    })
    if (found) {
      hitWeight += w
      matches.push({
        pattern: m.pattern,
        entity: m.entity || m.pattern,
        table: found.name,
        connection: found.connection || null,
      })
    } else {
      missing.push(m.pattern)
    }
  }

  const score = weightSum > 0 ? hitWeight / weightSum : 0
  const required = pack.requiredForMonk || []
  const requiredOk = required.every((r) =>
    matches.some((m) => m.pattern === r || leafName(m.table).toLowerCase() === r),
  )

  return {
    score: Math.round(score * 1000) / 1000,
    scorePct: Math.round(score * 100),
    matches,
    missing,
    requiredOk,
    canRunMonk: score >= (pack.minMatchScore ?? 0.55) && requiredOk,
  }
}

/**
 * Rank all packs for a workspace schema.
 * @param {object[]} schemaTables
 */
export function rankPacksForWorkspace(schemaTables) {
  return listFullIndustryPacks()
    .map((pack) => ({
      pack: {
        id: pack.id,
        industry: pack.industry,
        displayName: pack.displayName,
        description: pack.description,
      },
      ...scorePackAgainstSchema(schemaTables, pack),
    }))
    .sort((a, b) => b.score - a.score)
}
