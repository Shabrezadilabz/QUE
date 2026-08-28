/**
 * Sprint 8 — Multi-source Monk: one cert path across Postgres/BQ + Salesforce.
 */
import { buildSchemaContextPack } from './schemaContext.js'
import { getIndustryPack, scorePackAgainstSchema } from './templateMatcher.js'

export const MULTI_SOURCE_PROFILES = [
  {
    id: 'postgres-salesforce',
    label: 'Postgres + Salesforce',
    sourceTypes: ['postgresql', 'salesforce'],
    minSources: 2,
  },
  {
    id: 'bigquery-salesforce',
    label: 'BigQuery + Salesforce',
    sourceTypes: ['bigquery', 'salesforce'],
    minSources: 2,
  },
  {
    id: 'mongodb-postgresql',
    label: 'MongoDB + Postgres',
    sourceTypes: ['mongodb', 'postgresql'],
    minSources: 2,
  },
  {
    id: 'mongodb-bigquery',
    label: 'MongoDB + BigQuery',
    sourceTypes: ['mongodb', 'bigquery'],
    minSources: 2,
  },
]

/** @param {object[]} tables from buildSchemaContextPack */
export function groupTablesBySource(tables) {
  /** @type {Map<string, object[]>} */
  const bySource = new Map()
  for (const t of tables || []) {
    const st = String(t.sourceType || 'unknown').toLowerCase()
    const list = bySource.get(st) || []
    list.push(t)
    bySource.set(st, list)
  }
  return bySource
}

/** @param {object[]} tables */
export function detectMultiSourceProfile(tables) {
  const bySource = groupTablesBySource(tables)
  const present = [...bySource.keys()]
  for (const profile of MULTI_SOURCE_PROFILES) {
    const hits = profile.sourceTypes.filter((s) => present.includes(s))
    if (hits.length >= profile.minSources) {
      return {
        profile,
        presentSources: hits,
        bySource,
        connectionCount: new Set(
          (tables || []).map((t) => t.connection).filter(Boolean),
        ).size,
      }
    }
  }
  return null
}

/** Cross-connection join hints from promoted/suggested graph edges. */
export function buildCrossSourceJoinHints(tables, relationships = []) {
  const tableSource = new Map(
    (tables || []).map((t) => [t.name, String(t.sourceType || '').toLowerCase()]),
  )
  const hints = []
  for (const r of relationships || []) {
    const fromTable = String(r.from || '').split('.')[0]
    const toTable = String(r.to || '').split('.')[0]
    const fromSrc = tableSource.get(fromTable)
    const toSrc = tableSource.get(toTable)
    if (fromSrc && toSrc && fromSrc !== toSrc) {
      hints.push({
        from: r.from,
        to: r.to,
        fromSource: fromSrc,
        toSource: toSrc,
        status: r.status,
        confidence: r.confidence,
      })
    }
  }
  return hints.slice(0, 24)
}

/**
 * Pure analysis — usable in unit tests without DB.
 * @param {object[]} tables
 * @param {object} matchResult from scorePackAgainstSchema
 */
export function buildMultiSourceAnalysis(tables, matchResult, pack = null) {
  const detected = detectMultiSourceProfile(tables)
  if (!detected) {
    return {
      ready: false,
      profile: null,
      label: null,
      sources: [],
      matchesBySource: {},
      crossSourceJoinHints: [],
      canCertMultiSource: false,
      connectionCount: new Set((tables || []).map((t) => t.connection)).size,
      message: 'Connect Postgres or BigQuery plus Salesforce for multi-source Monk.',
    }
  }

  /** @type {Record<string, object[]>} */
  const matchesBySource = {}
  for (const m of matchResult?.matches || []) {
    const table = (tables || []).find((t) => t.name === m.table)
    const st = String(table?.sourceType || 'unknown').toLowerCase()
    matchesBySource[st] = matchesBySource[st] || []
    matchesBySource[st].push({
      ...m,
      sourceType: st,
      connection: table?.connection || m.connection,
    })
  }

  const sourcesWithMatches = Object.keys(matchesBySource).filter(
    (k) => matchesBySource[k].length > 0,
  )
  const profileSourcesPresent = detected.profile.sourceTypes.filter((s) =>
    sourcesWithMatches.includes(s),
  )
  const canCertMultiSource = Boolean(
    matchResult?.canRunMonk &&
      profileSourcesPresent.length >= detected.profile.minSources,
  )

  const sources = detected.profile.sourceTypes.map((st) => ({
    sourceType: st,
    tableCount: detected.bySource.get(st)?.length || 0,
    matchedEntities: (matchesBySource[st] || []).map((m) => m.entity),
    connectionNames: [
      ...new Set(
        (detected.bySource.get(st) || []).map((t) => t.connection).filter(Boolean),
      ),
    ],
  }))

  return {
    ready: true,
    profile: detected.profile.id,
    label: detected.profile.label,
    packId: pack?.id || null,
    sources,
    matchesBySource,
    crossSourceJoinHints: [],
    canCertMultiSource,
    connectionCount: detected.connectionCount,
    matchScorePct: matchResult?.scorePct ?? 0,
    requiredOk: matchResult?.requiredOk ?? false,
    message: canCertMultiSource
      ? `${detected.profile.label}: single cert path across ${profileSourcesPresent.join(' + ')}`
      : `Profile detected (${detected.profile.label}) — promote cross-source joins and sync missing entities`,
  }
}

export async function analyzeMultiSourceMonk(workspaceId, packId = 'ecommerce-v1') {
  const pack = getIndustryPack(packId)
  const packCtx = await buildSchemaContextPack(workspaceId)
  const matchResult = scorePackAgainstSchema(packCtx.tables, pack)
  const analysis = buildMultiSourceAnalysis(packCtx.tables, matchResult, pack)
  analysis.crossSourceJoinHints = buildCrossSourceJoinHints(
    packCtx.tables,
    packCtx.relationships,
  )
  return analysis
}
