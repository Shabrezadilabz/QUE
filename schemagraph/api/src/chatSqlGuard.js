/**
 * Guard live chat SQL against schema hallucinations — only tables in the
 * workspace graph (optionally scoped to the live connection) may appear in SQL.
 */
import { leafName } from './inferJoins.js'

const SQL_KEYWORDS = new Set([
  'select',
  'where',
  'on',
  'and',
  'or',
  'as',
  'with',
  'lateral',
  'only',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'natural',
  'outer',
  'join',
  'group',
  'order',
  'by',
  'having',
  'limit',
  'offset',
  'union',
  'all',
  'distinct',
  'case',
  'when',
  'then',
  'else',
  'end',
  'true',
  'false',
  'null',
  'not',
  'in',
  'exists',
  'between',
  'like',
  'ilike',
  'is',
  'from',
])

/**
 * @param {string} sql
 * @returns {string[]}
 */
export function extractSqlTableRefs(sql) {
  const refs = new Set()
  const cleaned = String(sql || '')
    .replace(/'[^']*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
  const re =
    /\b(?:FROM|JOIN)\s+(?:ONLY\s+)?(?:LATERAL\s+)?(?:(\w+)\.)?(?:"([^"]+)"|(\w+))/gi
  let m
  while ((m = re.exec(cleaned))) {
    const schema = m[1]?.toLowerCase()
    const table = (m[2] || m[3] || '').toLowerCase()
    if (!table || SQL_KEYWORDS.has(table)) continue
    refs.add(schema ? `${schema}.${table}` : table)
  }
  return [...refs]
}

/**
 * @param {object} pack
 * @param {string|null} [connectionName]
 */
export function buildAllowedTableSet(pack, connectionName = null) {
  /** @type {Set<string>} */
  const allowed = new Set()
  for (const t of pack.tables || []) {
    if (connectionName && t.connection !== connectionName) continue
    const full = String(t.name || '').toLowerCase()
    allowed.add(full)
    allowed.add(leafName(full).toLowerCase())
    if (full.includes('.')) {
      allowed.add(full.split('.').pop())
    }
  }
  return allowed
}

/**
 * @param {string} ref
 * @param {Set<string>} allowed
 */
function refIsAllowed(ref, allowed) {
  const r = String(ref || '').toLowerCase()
  if (allowed.has(r)) return true
  const leaf = leafName(r).toLowerCase()
  if (allowed.has(leaf)) return true
  if (r.includes('.')) {
    const short = r.split('.').pop()
    if (allowed.has(short)) return true
  }
  return false
}

/**
 * @param {string} sql
 * @param {object} pack
 * @param {string|null} [connectionName]
 */
export function validateSqlAgainstSchema(sql, pack, connectionName = null) {
  const refs = extractSqlTableRefs(sql)
  const allowed = buildAllowedTableSet(pack, connectionName)
  const unknown = refs.filter((r) => !refIsAllowed(r, allowed))
  return {
    ok: unknown.length === 0,
    unknown,
    refs,
    allowedNames: [...allowed].filter((n) => !n.includes('.')).slice(0, 80),
  }
}

/**
 * Filter schema pack to one live connection before graph/SQL generation.
 * @param {object} pack
 * @param {string|null} connectionName
 */
export function filterPackForConnection(pack, connectionName) {
  if (!connectionName) return pack
  const tables = (pack.tables || []).filter((t) => t.connection === connectionName)
  if (!tables.length) return pack
  const names = new Set(tables.map((t) => t.name))
  const leafNames = new Set(tables.map((t) => leafName(t.name)))
  const tableFromEdge = (edge) => {
    const s = String(edge || '')
    const dot = s.indexOf('.')
    return dot > 0 ? s.slice(0, dot) : s
  }
  const relationships = (pack.relationships || []).filter((r) => {
    const a = tableFromEdge(r.from)
    const b = tableFromEdge(r.to)
    return names.has(a) || names.has(b) || leafNames.has(a) || leafNames.has(b)
  })
  return {
    ...pack,
    tables,
    relationships,
    stats: {
      ...pack.stats,
      tableCount: tables.length,
      relationshipCount: relationships.length,
    },
  }
}

/**
 * Deterministic revenue-by-brand SQL from schema graph (no LLM).
 * @param {string} question
 * @param {object} pack
 */
export function heuristicBrandRevenueSql(question, pack) {
  const q = String(question || '').toLowerCase()
  if (!/\b(revenue|sales|turnover|total|amount)\b/.test(q)) return null

  const brands = (pack.tables || []).find((t) =>
    /\bbrands?\b/i.test(leafName(t.name)),
  )
  const orders = (pack.tables || []).find((t) =>
    /\borders?\b/i.test(leafName(t.name)),
  )
  if (!brands || !orders) return null

  const brandToken = extractBrandToken(question)
  const ordersTbl = quoteTable(orders.name)
  const brandsTbl = quoteTable(brands.name)
  const oAlias = 'o'
  const bAlias = 'b'

  const totalCol =
    (orders.columns || []).find((c) => /order_total|total_amount|revenue|amount/i.test(c.name)) ||
    (orders.columns || []).find((c) => /total|amount/i.test(c.name))
  const brandIdOrders =
    (orders.columns || []).find((c) => /brand_id/i.test(c.name)) ||
    (orders.columns || []).find((c) => c.keyKind === 'fk' && /brand/i.test(c.name || ''))
  const brandIdBrands =
    (brands.columns || []).find((c) => /brand_id/i.test(c.name)) ||
    (brands.columns || []).find((c) => c.keyKind === 'pk')
  const brandNameCol =
    (brands.columns || []).find((c) => /^name$/i.test(c.name)) ||
    (brands.columns || []).find((c) => /name/i.test(c.name))

  const sumExpr = totalCol
    ? `SUM(${oAlias}.${totalCol.name})`
    : `SUM(${oAlias}.order_total)`
  const joinOn =
    brandIdOrders && brandIdBrands
      ? `${oAlias}.${brandIdOrders.name} = ${bAlias}.${brandIdBrands.name}`
      : `${oAlias}.brand_id = ${bAlias}.brand_id`

  let where = ''
  if (brandToken && brandNameCol) {
    where = `\nWHERE LOWER(${bAlias}.${brandNameCol.name}) LIKE '%${escapeLike(brandToken)}%'`
  } else if (brandToken && (brands.columns || []).some((c) => /brand_code/i.test(c.name))) {
    where = `\nWHERE LOWER(${bAlias}.brand_code) LIKE '%${escapeLike(brandToken)}%'`
  }

  const sql =
    `SELECT ${sumExpr} AS revenue,\n` +
    `       ${bAlias}.${brandNameCol?.name || 'name'} AS brand\n` +
    `FROM ${ordersTbl} ${oAlias}\n` +
    `JOIN ${brandsTbl} ${bAlias} ON ${joinOn}` +
    where +
    `\nGROUP BY ${bAlias}.${brandNameCol?.name || 'name'}`

  return {
    sql,
    explanation: brandToken
      ? `Total revenue for **${brandToken}** from **${leafName(orders.name)}** × **${leafName(brands.name)}**.`
      : `Revenue by brand from **${leafName(orders.name)}** joined to **${leafName(brands.name)}**.`,
  }
}

function quoteTable(name) {
  const n = String(name || '')
  if (/^[a-z_][\w]*$/i.test(n)) return n
  return `"${n.replace(/"/g, '""')}"`
}

function escapeLike(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[%_\\]/g, '\\$&')
    .slice(0, 40)
}

/** Pull brand name token from natural language (PUMA, Nike, etc.). */
function extractBrandToken(question) {
  const q = String(question || '')
  const known = q.match(
    /\b(puma|nike|adidas|reebok|under armour|new balance|asics|skechers)\b/i,
  )
  if (known) return known[1]

  const brandOf = q.match(/\b(?:of|for)\s+([A-Za-z][A-Za-z0-9\s&-]{1,24}?)(?:\s+brand|\s+till|\s+until|\s+now|\?|$)/i)
  if (brandOf) return brandOf[1].trim()

  const cap = q.match(/\b([A-Z][A-Z0-9&-]{2,})\b/)
  if (cap) return cap[1]

  return null
}

export function isMissingRelationError(message) {
  return /relation\s+["']?[\w.]+["']?\s+does not exist/i.test(String(message || ''))
}
