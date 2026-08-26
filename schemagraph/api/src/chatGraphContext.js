/**
 * GraphRAG-style schema context for Que chat.
 *
 * Hybrid retrieval: @mentions + keyword tables + vector RAG hits → 1-hop graph
 * expansion → join-path BFS between focus tables → compact prompt block injected
 * on every turn (DIN-SQL / MAC-SQL style query plan for live SQL).
 *
 * Row payloads never enter this module — schema metadata only.
 */
import { findTablesMentioned, formatContextForPrompt } from './schemaContext.js'

const METRIC_PLAN_RE =
  /\b(revenue|sales|total|amount|profit|margin|cost|price|orders?|customers?|units|inventory|stock|spend|budget|kpi|metric|performance|growth|turnover|earnings|avg|average|sum|count)\b/i

const JOIN_KEYWORD_RE =
  /\b(join|relate|relationship|link|across|between|via|through)\b/i

/** @param {string} edge e.g. "orders.id" */
function tableFromEdge(edge) {
  const s = String(edge || '').trim()
  const dot = s.indexOf('.')
  return dot > 0 ? s.slice(0, dot) : s
}

/** @param {import('./schemaContext.js').buildSchemaContextPack extends (...args: any) => Promise<infer R> ? R : never} pack */
function tableByName(pack) {
  const map = new Map()
  for (const t of pack.tables || []) {
    map.set(t.name.toLowerCase(), t)
  }
  return map
}

/** @param {ReturnType<typeof tableByName>} byName */
function idForTable(byName, name) {
  const t = byName.get(String(name || '').toLowerCase())
  return t?.id ?? null
}

/**
 * Build undirected adjacency from relationship edges.
 * @param {object} pack
 */
export function buildSchemaAdjacency(pack) {
  /** @type {Map<string, Set<string>>} */
  const adj = new Map()
  const add = (a, b) => {
    if (!a || !b || a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a).add(b)
    adj.get(b).add(a)
  }
  for (const r of pack.relationships || []) {
    add(tableFromEdge(r.from), tableFromEdge(r.to))
  }
  return adj
}

/**
 * BFS shortest paths between two table names (max hops).
 * @returns {{ from: string, to: string, path: string[], hops: number }[]}
 */
export function findJoinPaths(pack, tableNames, opts = {}) {
  const maxHops = opts.maxHops ?? 3
  const maxPaths = opts.maxPaths ?? 6
  const names = [...new Set((tableNames || []).map((n) => String(n).trim()).filter(Boolean))]
  if (names.length < 2) return []

  const adj = buildSchemaAdjacency(pack)
  const paths = []

  for (let i = 0; i < names.length && paths.length < maxPaths; i++) {
    for (let j = i + 1; j < names.length && paths.length < maxPaths; j++) {
      const start = names[i]
      const goal = names[j]
      if (!adj.has(start) || !adj.has(goal)) continue

      /** @type {Map<string, { prev: string|null, depth: number }>} */
      const seen = new Map([[start, { prev: null, depth: 0 }]])
      /** @type {string[]} */
      const queue = [start]
      let found = null

      while (queue.length) {
        const cur = queue.shift()
        const { depth } = seen.get(cur)
        if (depth >= maxHops) continue
        for (const nxt of adj.get(cur) || []) {
          if (seen.has(nxt)) continue
          seen.set(nxt, { prev: cur, depth: depth + 1 })
          if (nxt === goal) {
            found = nxt
            queue.length = 0
            break
          }
          queue.push(nxt)
        }
      }

      if (!found) continue
      const path = []
      let walk = goal
      while (walk) {
        path.unshift(walk)
        walk = seen.get(walk)?.prev ?? null
      }
      paths.push({ from: start, to: goal, path, hops: path.length - 1 })
    }
  }
  return paths
}

/**
 * Expand seed table ids by N hops on the relationship graph.
 * @param {object} pack
 * @param {Set<string>} seedIds
 * @param {number} [hops]
 */
export function expandGraphNeighborhood(pack, seedIds, hops = 1) {
  const byName = tableByName(pack)
  const adj = buildSchemaAdjacency(pack)
  const names = new Set()
  for (const id of seedIds) {
    const t = pack.tables.find((x) => x.id === id)
    if (t) names.add(t.name)
  }

  let frontier = new Set(names)
  for (let h = 0; h < hops; h++) {
    const next = new Set()
    for (const n of frontier) {
      for (const neighbor of adj.get(n) || []) {
        if (!names.has(neighbor)) {
          names.add(neighbor)
          next.add(neighbor)
        }
      }
    }
    frontier = next
    if (!frontier.size) break
  }

  const ids = new Set(seedIds)
  for (const n of names) {
    const id = idForTable(byName, n)
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Extract table names referenced in RAG chunk metadata / titles.
 * @param {object[]} ragChunks
 * @param {object} pack
 */
export function tablesFromRagChunks(ragChunks, pack) {
  const byName = tableByName(pack)
  const out = new Set()
  for (const c of ragChunks || []) {
    const metaTable = c.metadata?.table
    if (metaTable && byName.has(String(metaTable).toLowerCase())) {
      out.add(String(metaTable).toLowerCase())
    }
    const title = String(c.title || '').split('.')[0]
    if (title && byName.has(title.toLowerCase())) {
      out.add(title.toLowerCase())
    }
    if (c.sourceKind === 'relationship') {
      const from = c.metadata?.from || c.title
      const to = c.metadata?.to || ''
      for (const edge of [from, to]) {
        const tbl = tableFromEdge(String(edge))
        if (byName.has(tbl.toLowerCase())) out.add(tbl.toLowerCase())
      }
    }
  }
  return [...out]
    .map((n) => byName.get(n))
    .filter(Boolean)
}

/**
 * DIN-SQL / MAC-SQL style heuristic query decomposition (no extra LLM call).
 * @param {string} question
 * @param {'ceo'|'engineer'} [audience]
 */
export function analyzeQueryPlan(question, audience = 'ceo') {
  const q = String(question || '').toLowerCase().trim()
  let intent = 'lookup'
  if (/\b(count|how many)\b/.test(q)) intent = 'count'
  else if (/\b(sum|total|revenue|sales|profit|margin|avg|average|turnover)\b/.test(q))
    intent = 'aggregate'
  else if (/\b(list|show me|show all|what are|which)\b/.test(q)) intent = 'list'
  else if (/\b(join|relate|relationship|link)\b/.test(q)) intent = 'join_explain'
  else if (/\b(describe|schema|columns?|fields?)\b/.test(q)) intent = 'schema'

  /** @type {string[]} */
  const metrics = []
  for (const m of [
    'revenue',
    'sales',
    'profit',
    'margin',
    'orders',
    'customers',
    'units',
    'inventory',
    'cost',
    'price',
  ]) {
    if (new RegExp(`\\b${m}\\b`).test(q)) metrics.push(m)
  }

  /** @type {string[]} */
  const filters = []
  const brandMatch = q.match(
    /\b(puma|nike|adidas|reebok|apple|samsung|google|amazon)\b/gi,
  )
  if (brandMatch) filters.push(...brandMatch.map((b) => `brand:${b}`))
  if (/\b(last|past|this)\s+(week|month|quarter|year)\b/.test(q)) {
    filters.push('time:recent')
  }
  if (/\b20\d{2}\b/.test(q)) {
    const yr = q.match(/\b20\d{2}\b/)?.[0]
    if (yr) filters.push(`year:${yr}`)
  }

  const needsJoins =
    METRIC_PLAN_RE.test(q) ||
    JOIN_KEYWORD_RE.test(q) ||
    metrics.some((m) => /revenue|sales|profit|margin/.test(m)) ||
    filters.some((f) => f.startsWith('brand:'))

  const complexity =
    needsJoins && metrics.length ? 'high' : needsJoins ? 'medium' : 'low'

  return {
    intent,
    metrics,
    filters,
    needsJoins,
    complexity,
    audience,
    sqlHint:
      intent === 'aggregate'
        ? 'Prefer SUM/COUNT/AVG with GROUP BY; JOIN via FK paths in graph.'
        : intent === 'count'
          ? 'Prefer COUNT(*) or COUNT(DISTINCT …).'
          : null,
  }
}

/**
 * Slice pack to focused tables + relationships touching them.
 * @param {object} pack
 * @param {Set<string>} tableIds
 * @param {number} [maxTables]
 */
export function buildFocusedPack(pack, tableIds, maxTables = 35) {
  const idSet = new Set(tableIds)
  let tables = pack.tables.filter((t) => idSet.has(t.id))
  if (tables.length > maxTables) {
    tables = tables.slice(0, maxTables)
    for (const t of tables) idSet.add(t.id)
  }
  const nameSet = new Set(tables.map((t) => t.name))
  const relationships = (pack.relationships || []).filter((r) => {
    const a = tableFromEdge(r.from)
    const b = tableFromEdge(r.to)
    return nameSet.has(a) || nameSet.has(b)
  })
  const relNames = new Set()
  for (const r of relationships) {
    relNames.add(tableFromEdge(r.from))
    relNames.add(tableFromEdge(r.to))
  }
  for (const t of pack.tables) {
    if (relNames.has(t.name) && !nameSet.has(t.name) && tables.length < maxTables) {
      tables.push(t)
      nameSet.add(t.name)
    }
  }
  return {
    ...pack,
    tables,
    relationships: relationships.slice(0, 40),
    rejectedJoins: (pack.rejectedJoins || []).slice(0, 12),
  }
}

/**
 * @param {object} focusedPack
 * @param {ReturnType<typeof findJoinPaths>} joinPaths
 * @param {ReturnType<typeof analyzeQueryPlan>} plan
 * @param {object[]} [ragChunks]
 */
export function formatGraphContextBlock(focusedPack, joinPaths, plan, ragChunks = []) {
  const lines = [
    '## Query plan (decomposed — use for SQL and grounding)',
    `Intent: ${plan.intent}`,
    plan.metrics.length ? `Metrics: ${plan.metrics.join(', ')}` : 'Metrics: (none detected)',
    plan.filters.length ? `Filters: ${plan.filters.join(', ')}` : 'Filters: (none detected)',
    `Needs joins: ${plan.needsJoins ? 'yes' : 'no'} · Complexity: ${plan.complexity}`,
    plan.sqlHint ? `SQL hint: ${plan.sqlHint}` : '',
    '',
    '## Focus schema graph (workspace slice — metadata only)',
    `Focus tables: ${focusedPack.tables.length} · Relationships in slice: ${focusedPack.relationships.length}`,
  ].filter((l) => l !== '')

  if (joinPaths.length) {
    lines.push('', '### Join paths between focus tables')
    for (const p of joinPaths) {
      lines.push(`- ${p.path.join(' → ')} (${p.hops} hop${p.hops === 1 ? '' : 's'})`)
    }
  } else if (plan.needsJoins && focusedPack.tables.length >= 2) {
    lines.push(
      '',
      '### Join paths',
      '(No single path found in graph — check suggested relationships or infer via shared keys.)',
    )
  }

  lines.push('', formatContextForPrompt(focusedPack))

  const relHits = (ragChunks || []).filter((c) => c.sourceKind === 'relationship')
  if (relHits.length) {
    lines.push('', '## RAG relationship snippets')
    for (const c of relHits.slice(0, 4)) {
      lines.push(`- ${c.title}: ${String(c.content || '').slice(0, 280)}`)
    }
  }

  return lines.join('\n')
}

/**
 * Main entry — build graph context for one chat turn.
 * @param {object} pack
 * @param {string} question
 * @param {object[]} mentionedTables from findTablesMentioned
 * @param {object[]} [ragChunks]
 * @param {{ graphHops?: number, maxTables?: number }} [opts]
 */
export function buildChatGraphContext(
  pack,
  question,
  mentionedTables = [],
  ragChunks = [],
  opts = {},
) {
  const explicit = mentionedTables.map((t) => t.id)
  const keyword = findTablesMentioned(pack, question, [])
  const fromRag = tablesFromRagChunks(ragChunks, pack)

  const seedIds = new Set([
    ...explicit,
    ...keyword.map((t) => t.id),
    ...fromRag.map((t) => t.id),
  ])

  if (!seedIds.size && pack.tables?.length) {
    seedIds.add(pack.tables[0].id)
  }

  const expandedIds = expandGraphNeighborhood(
    pack,
    seedIds,
    opts.graphHops ?? 1,
  )

  const focusTables = pack.tables.filter((t) => expandedIds.has(t.id))
  const focusNames = focusTables.map((t) => t.name)
  const joinPaths = findJoinPaths(pack, focusNames, {
    maxHops: 3,
    maxPaths: 6,
  })

  for (const p of joinPaths) {
    for (const n of p.path) {
      const t = pack.tables.find((x) => x.name === n)
      if (t) expandedIds.add(t.id)
    }
  }

  const focusedPack = buildFocusedPack(pack, expandedIds, opts.maxTables ?? 35)
  const plan = analyzeQueryPlan(question, opts.audience ?? 'ceo')
  const promptBlock = formatGraphContextBlock(
    focusedPack,
    joinPaths,
    plan,
    ragChunks,
  )

  return {
    plan,
    joinPaths,
    focusTables: focusedPack.tables,
    focusedPack,
    promptBlock,
    seedTableCount: seedIds.size,
    expandedTableCount: expandedIds.size,
  }
}
