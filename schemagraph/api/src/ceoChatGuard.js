/**
 * S2.2 — CEO / Genie guardrail: certified marts + glossary only.
 */
import { query } from './db.js'
import { listBiCharts } from './certifiedBi.js'
import { listGlossaryTerms } from './glossary.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { leafName, norm } from './inferJoins.js'
import { extractSqlTableRefs } from './chatSqlGuard.js'

function addTableName(set, name) {
  const n = String(name || '').trim()
  if (!n) return
  set.add(n.toLowerCase())
  set.add(leafName(n).toLowerCase())
  if (n.includes('.')) set.add(n.split('.').pop().toLowerCase())
}

/**
 * Certified tables + glossary terms CEO chat may reference.
 * @param {string} workspaceId
 */
export async function getCertifiedChatScope(workspaceId) {
  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  const certifiedOnly = settings.ceoChatCertifiedOnly !== false

  /** @type {Set<string>} */
  const tableNames = new Set()

  const { rows: datasets } = await query(
    `SELECT name, source_object_id FROM managed_datasets
     WHERE workspace_id = $1 AND certified = true`,
    [workspaceId],
  )
  for (const d of datasets) {
    addTableName(tableNames, d.name)
    if (d.source_object_id) {
      const { rows: objs } = await query(
        `SELECT name FROM schema_objects WHERE id = $1`,
        [d.source_object_id],
      )
      if (objs[0]?.name) addTableName(tableNames, objs[0].name)
    }
  }

  const charts = await listBiCharts(workspaceId).catch(() => [])
  for (const ch of charts) {
    if (!ch.certified) continue
    addTableName(tableNames, ch.datasetRef || ch.tableName || ch.title)
  }

  const { rows: metrics } = await query(
    `SELECT m.source_object_id, o.name AS object_name
     FROM metric_definitions m
     LEFT JOIN schema_objects o ON o.id = m.source_object_id
     WHERE m.workspace_id = $1 AND m.certified = true`,
    [workspaceId],
  )
  for (const m of metrics) {
    if (m.object_name) addTableName(tableNames, m.object_name)
  }

  const { rows: certRows } = await query(
    `SELECT pack_id FROM workspace_pack_certifications
     WHERE workspace_id = $1 AND status = 'passed'
     ORDER BY certified_at DESC NULLS LAST
     LIMIT 1`,
    [workspaceId],
  )
  if (certRows.length) {
    const { rows: martObjs } = await query(
      `SELECT DISTINCT o.name
       FROM schema_objects o
       JOIN jobs j ON j.workspace_id = o.workspace_id
       WHERE o.workspace_id = $1 AND j.title LIKE '[Monk]%'`,
      [workspaceId],
    )
    for (const o of martObjs) {
      if (o.name) addTableName(tableNames, o.name)
    }
  }

  const glossary = await listGlossaryTerms(workspaceId, { status: 'approved' }).catch(
    () => listGlossaryTerms(workspaceId, { status: 'all' }).catch(() => []),
  )

  return {
    certifiedOnly,
    hasCertifiedTables: tableNames.size > 0,
    tableNames: [...tableNames],
    glossaryTerms: (glossary || []).map((t) => ({
      name: t.name,
      definition: t.definition,
    })),
  }
}

/**
 * @param {object} pack
 * @param {{ tableNames: string[] }} scope
 */
export function filterPackForCeoAudience(pack, scope) {
  const allowed = new Set((scope.tableNames || []).map((n) => n.toLowerCase()))
  if (!allowed.size) {
    return {
      ...pack,
      tables: [],
      relationships: [],
      stats: {
        ...pack.stats,
        tableCount: 0,
        relationshipCount: 0,
        ceoCertifiedFilter: true,
      },
    }
  }

  const tableAllowed = (t) => {
    const full = String(t.name || '').toLowerCase()
    const leaf = leafName(full).toLowerCase()
    return allowed.has(full) || allowed.has(leaf)
  }

  const tables = (pack.tables || []).filter(tableAllowed)
  const names = new Set(tables.map((t) => t.name))
  const leaves = new Set(tables.map((t) => leafName(t.name)))
  const tableFromEdge = (edge) => {
    const s = String(edge || '')
    const dot = s.indexOf('.')
    return dot > 0 ? s.slice(0, dot) : s
  }
  const relationships = (pack.relationships || []).filter((r) => {
    const a = tableFromEdge(r.from)
    const b = tableFromEdge(r.to)
    return names.has(a) || names.has(b) || leaves.has(a) || leaves.has(b)
  })

  return {
    ...pack,
    tables,
    relationships,
    stats: {
      ...pack.stats,
      tableCount: tables.length,
      relationshipCount: relationships.length,
      ceoCertifiedFilter: true,
    },
  }
}

export function formatGlossaryBlock(terms) {
  if (!terms?.length) return ''
  const lines = terms
    .slice(0, 24)
    .map((t) => `- **${t.name}**: ${String(t.definition || '').slice(0, 200)}`)
  return `\n## Certified glossary (CEO-safe)\n${lines.join('\n')}\n`
}

/**
 * @param {string} sql
 * @param {{ tableNames: string[] }} scope
 */
export function validateCeoSqlAgainstCertified(sql, scope) {
  const allowed = new Set((scope.tableNames || []).map((n) => n.toLowerCase()))
  const refs = extractSqlTableRefs(sql)
  const unknown = refs.filter((ref) => {
    const r = ref.toLowerCase()
    const leaf = leafName(r).toLowerCase()
    return !allowed.has(r) && !allowed.has(leaf)
  })
  return { ok: unknown.length === 0, unknown, refs }
}

export function buildCeoUncertifiedReply(scope) {
  if (!scope.hasCertifiedTables) {
    return (
      'I can only answer KPI questions on **certified** data. ' +
      'Run **Monk Mode** to certify a mart first (Joins → Monk → cert badge), then ask again.'
    )
  }
  return (
    'That question would use tables that are not **certified** yet. ' +
    'Ask about a certified KPI or metric, or complete Monk certification for that mart.'
  )
}

export function isGlossaryOnlyQuestion(message, scope) {
  const q = norm(String(message || ''))
  if (!q) return false
  if (/\b(what is|what's|define|meaning of|explain)\b/.test(q)) {
    return (scope.glossaryTerms || []).some((t) =>
      q.includes(norm(t.name)),
    )
  }
  return false
}
