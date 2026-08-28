/**
 * Phase 4.4 — Report Studio board filters, parameters, cross-filter SQL.
 * Safe identifier-only injection — values escaped as string literals.
 */

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/** @param {string} name */
export function sanitizeSqlIdent(name) {
  const id = String(name || '').trim()
  if (!IDENT_RE.test(id)) {
    const err = new Error(`Invalid SQL identifier: ${id.slice(0, 40)}`)
    err.status = 400
    throw err
  }
  return id
}

/** @param {unknown} value */
export function escapeSqlLiteral(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

/**
 * Normalize filter objects from UI/API.
 * @param {object[]} raw
 */
export function normalizeBoardFilters(raw = []) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const f of raw) {
    if (!f || !f.field) continue
    const field = String(f.field).trim()
    const value = f.value
    if (value == null || String(value).trim() === '') continue
    const op = String(f.op || 'eq').toLowerCase()
    out.push({
      field,
      op: ['eq', 'contains', 'gte', 'lte'].includes(op) ? op : 'eq',
      value: String(value).trim(),
      source: f.source || 'board',
    })
  }
  return out.slice(0, 12)
}

/**
 * Build filters from board parameters + overrides.
 * @param {object[]} parameters
 * @param {Record<string, string>} overrides
 */
export function filtersFromParameters(parameters = [], overrides = {}) {
  const filters = []
  for (const p of parameters || []) {
    const bind = p.bindField || p.id
    const val =
      overrides[p.id] ??
      overrides[bind] ??
      p.defaultValue ??
      ''
    if (!bind || String(val).trim() === '') continue
    filters.push({
      field: bind,
      op: p.type === 'date' ? 'gte' : 'contains',
      value: String(val).trim(),
      source: 'parameter',
    })
  }
  return filters
}

/**
 * Merge board filters + cross-filter (cross wins on same field).
 * @param {object[]} boardFilters
 * @param {object|null} crossFilter
 */
export function mergeBoardFilters(boardFilters = [], crossFilter = null) {
  const merged = [...normalizeBoardFilters(boardFilters)]
  if (crossFilter?.field && crossFilter.value != null) {
    const field = String(crossFilter.field)
    const filtered = merged.filter((f) => f.field !== field)
    filtered.push({
      field,
      op: 'eq',
      value: String(crossFilter.value),
      source: 'cross',
    })
    return filtered
  }
  return merged
}

/**
 * Wrap base SQL with filter WHERE clause (subquery pattern).
 * @param {string} sql
 * @param {object[]} filters
 */
export function applyFiltersToSql(sql, filters = []) {
  const base = String(sql || '').trim().replace(/;+\s*$/, '')
  if (!base || !filters.length) return base

  const clauses = []
  for (const f of filters) {
    const col = sanitizeSqlIdent(f.field)
    const lit = escapeSqlLiteral(f.value)
    if (f.op === 'contains') {
      clauses.push(`${col}::text ILIKE '%' || ${lit.slice(1, -1)} || '%'`)
    } else if (f.op === 'gte') {
      clauses.push(`${col}::text >= ${lit}`)
    } else if (f.op === 'lte') {
      clauses.push(`${col}::text <= ${lit}`)
    } else {
      clauses.push(`${col}::text = ${lit}`)
    }
  }

  if (!clauses.length) return base
  return `SELECT * FROM (\n${base}\n) AS _que_board WHERE ${clauses.join(' AND ')}`
}

/**
 * Drill filter — narrow to one dimension value from clicked segment.
 * @param {string} sql
 * @param {{ field: string, value: unknown }} drill
 */
export function applyDrillFilter(sql, drill) {
  if (!drill?.field || drill.value == null) return sql
  return applyFiltersToSql(sql, [
    { field: drill.field, op: 'eq', value: String(drill.value) },
  ])
}
