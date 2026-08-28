/**
 * Phase 5.2 — duplicate / quality profile per synced table (metadata + samples).
 * No full table scans — uses schema PK hints + column profiles + capped samples.
 */
import { buildSchemaContextPack } from './schemaContext.js'
import { listColumnProfiles, tableProfileSummary } from './columnProfiling.js'
import { leafName } from './inferJoins.js'

/**
 * Estimate dup/null metrics for one table from metadata (pure — unit testable).
 * @param {object} table schema pack table
 * @param {object[]} columnProfiles
 */
export function computeTableDuplicateMetrics(table, columnProfiles = []) {
  const columns = table.columns || []
  const pkCols = columns.filter(
    (c) => c.keyKind === 'pk' || c.keyKind === 'unique',
  )
  const fkCols = columns.filter((c) => c.keyKind === 'fk')

  let dupKeyPct = null
  let dupRowPct = null
  let nullPct = null

  if (pkCols.length) {
    const pk = pkCols[0]
    const samples = (pk.samples || []).map(String).filter(Boolean)
    if (samples.length >= 3) {
      const unique = new Set(samples)
      dupKeyPct =
        Math.round((1 - unique.size / samples.length) * 1000) / 10
    }
  }

  const sampleCols = columns.filter((c) => (c.samples || []).length >= 3)
  if (sampleCols.length) {
    const depth = Math.max(...sampleCols.map((c) => c.samples.length))
    const keys = []
    for (let i = 0; i < depth; i++) {
      keys.push(
        sampleCols.map((c) => String(c.samples[i] ?? '')).join('\0'),
      )
    }
    const uniqueRows = new Set(keys)
    dupRowPct =
      Math.round((1 - uniqueRows.size / keys.length) * 1000) / 10
  }

  const nullRates = columnProfiles
    .map((p) => p.nullRate)
    .filter((n) => n != null && Number.isFinite(Number(n)))
  if (nullRates.length) {
    nullPct =
      Math.round(
        (nullRates.reduce((a, b) => a + Number(b), 0) / nullRates.length) *
          1000,
      ) / 10
  } else {
    const nullSamples = columns.flatMap((c) => c.samples || [])
    if (nullSamples.length >= 5) {
      const nulls = nullSamples.filter(
        (v) => v == null || String(v).trim() === '',
      ).length
      nullPct = Math.round((nulls / nullSamples.length) * 1000) / 10
    }
  }

  let severity = 'low'
  if ((dupKeyPct ?? 0) > 5 || (dupRowPct ?? 0) > 5) severity = 'high'
  else if ((dupKeyPct ?? 0) > 0 || (dupRowPct ?? 0) > 0) severity = 'medium'
  else if ((nullPct ?? 0) > 25) severity = 'medium'

  let suggestedAction = 'none'
  if ((dupKeyPct ?? 0) > 5 || (dupRowPct ?? 0) > 5) {
    suggestedAction = 'monk_dedupe'
  } else if ((nullPct ?? 0) > 20) {
    suggestedAction = 'steward_nulls'
  } else if (fkCols.length && severity !== 'low') {
    suggestedAction = 'review_joins'
  }

  return {
    dupKeyPct,
    dupRowPct,
    nullPct,
    pkColumn: pkCols[0]?.name ?? null,
    fkCount: fkCols.length,
    severity,
    suggestedAction,
  }
}

/**
 * Cross-table orphan hint — FK column with low distinct ratio in samples.
 * @param {object} table
 * @param {object[]} relationships
 */
export function estimateOrphanFkHints(table, relationships = []) {
  const name = table.name
  const hints = []
  for (const r of relationships || []) {
    const fromTable = String(r.from || '').split('.')[0]
    const toTable = String(r.to || '').split('.')[0]
    if (fromTable !== name && toTable !== name) continue
    hints.push({
      edge: `${r.from} → ${r.to}`,
      type: r.type,
      status: r.status,
      confidence: r.confidence,
    })
  }
  return hints.slice(0, 6)
}

/**
 * Full workspace duplicate profile.
 * @param {string} workspaceId
 */
export async function computeDuplicateProfile(workspaceId) {
  const pack = await buildSchemaContextPack(workspaceId)
  const profiles = await listColumnProfiles(workspaceId, { limit: 500 })

  const tables = (pack.tables || []).map((t) => {
    const tableProfiles = tableProfileSummary(profiles, t.name)
    const metrics = computeTableDuplicateMetrics(t, tableProfiles)
    const orphanHints = estimateOrphanFkHints(t, pack.relationships)
    return {
      tableName: t.name,
      connection: t.connection,
      sourceType: t.sourceType,
      entityKind: t.entityKind,
      ...metrics,
      orphanHints,
    }
  })

  tables.sort((a, b) => {
    const score = (x) =>
      (x.dupKeyPct ?? 0) * 2 + (x.dupRowPct ?? 0) * 2 + (x.nullPct ?? 0)
    return score(b) - score(a)
  })

  const highRisk = tables.filter((t) => t.severity === 'high').length
  const mediumRisk = tables.filter((t) => t.severity === 'medium').length

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    tableCount: tables.length,
    highRisk,
    mediumRisk,
    tables,
    note: 'Heuristic profile from schema samples — run column profiling for richer metrics',
  }
}

/** SLA badge for Load pipelines (connection sync row). */
export function computeLoadSlaStatus(conn) {
  if (conn.lastSyncErrorKind || conn.status === 'error') {
    return { badge: 'error', label: 'Failed', tone: 'red' }
  }
  if (conn.syncNextAt) {
    const due = new Date(conn.syncNextAt)
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
      return { badge: 'overdue', label: 'Overdue', tone: 'amber' }
    }
  }
  if (conn.lastSyncAt || conn.lastScheduledSyncAt) {
    return { badge: 'healthy', label: 'On track', tone: 'green' }
  }
  if (conn.syncSchedule && conn.syncSchedule !== 'off') {
    return { badge: 'pending', label: 'Scheduled', tone: 'blue' }
  }
  return { badge: 'unknown', label: 'No schedule', tone: 'gray' }
}
