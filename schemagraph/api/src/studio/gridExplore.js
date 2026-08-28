/**
 * Phase 4.5 / P3.5 — Sigma-class grid explore on Que Warehouse.
 * Formula bar → SQL; grid column picks → SELECT; warehouse executes (read-only).
 */
import { pool } from '../db.js'
import {
  ensureQueWarehouse,
  listWarehouseTables,
  quoteIdent,
  executeWarehouseReadonlySql,
} from '../queWarehouse.js'
import {
  applyFiltersToSql,
  normalizeBoardFilters,
  sanitizeSqlIdent,
} from './boardFilters.js'

const TABLE_REF_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const FORMULA_EXPR_RE = /^[a-zA-Z0-9_+\-*/().,\s'"%]+$/i
const AGG_FNS = new Set(['sum', 'count', 'avg', 'min', 'max'])

/** @param {string} table */
export function sanitizeTableRef(table) {
  const raw = String(table || '').trim()
  if (!raw) {
    const err = new Error('table required')
    err.status = 400
    throw err
  }
  const parts = raw.split('.')
  for (const p of parts) {
    if (!TABLE_REF_RE.test(p)) {
      const err = new Error(`Invalid table reference: ${raw.slice(0, 60)}`)
      err.status = 400
      throw err
    }
  }
  return parts.length === 1 ? parts[0] : `${parts[0]}.${parts[1]}`
}

/**
 * Compile Sigma-style formula bar input to SQL expression or full query.
 * @param {string} formula
 */
export function compileGridFormula(formula) {
  let text = String(formula || '').trim()
  if (!text) {
    const err = new Error('Formula is empty')
    err.status = 400
    throw err
  }
  if (text.startsWith('=')) text = text.slice(1).trim()

  if (/^\s*(with|select)\b/i.test(text)) {
    return { mode: 'sql', sql: text, expr: null }
  }

  const fnMatch = text.match(
    /^(sum|count|avg|min|max)\s*\(\s*(\*|[a-zA-Z_][\w]*)\s*\)$/i,
  )
  if (fnMatch) {
    const fn = fnMatch[1].toUpperCase()
    const arg =
      fnMatch[2] === '*' ? '*' : sanitizeSqlIdent(fnMatch[2])
    return { mode: 'expr', expr: `${fn}(${arg})`, sql: null }
  }

  if (!FORMULA_EXPR_RE.test(text)) {
    const err = new Error('Formula contains unsupported characters')
    err.status = 400
    throw err
  }

  // Bare identifier → column ref
  if (TABLE_REF_RE.test(text)) {
    return { mode: 'expr', expr: sanitizeSqlIdent(text), sql: null }
  }

  return { mode: 'expr', expr: text, sql: null }
}

/**
 * Build warehouse SELECT from grid spec (columns, filters, sort, formulas).
 * @param {object} spec
 */
export function buildGridSelectSql(spec = {}) {
  const table = sanitizeTableRef(spec.table)
  const columns = Array.isArray(spec.columns) ? spec.columns : []
  const formulas = Array.isArray(spec.formulas) ? spec.formulas : []
  const filters = normalizeBoardFilters(spec.filters)
  const limit = Math.min(Math.max(Number(spec.limit) || 200, 1), 500)

  if (spec.sql && String(spec.sql).trim()) {
    let sql = String(spec.sql).trim()
    if (filters.length) sql = applyFiltersToSql(sql, filters)
    return sql
  }

  const selectParts = []
  const groupBy = []
  let hasAgg = false

  for (const col of columns.slice(0, 24)) {
    const field = sanitizeSqlIdent(String(col.field || col.id || '').trim())
    const alias = col.alias
      ? sanitizeSqlIdent(String(col.alias))
      : field
    const agg = String(col.agg || '').toLowerCase()

    if (agg && AGG_FNS.has(agg)) {
      hasAgg = true
      const fn = agg.toUpperCase()
      const inner = fn === 'COUNT' && field === '*' ? '*' : field
      selectParts.push(`${fn}(${inner}) AS ${quoteIdent(alias)}`)
    } else {
      selectParts.push(`${field} AS ${quoteIdent(alias)}`)
      groupBy.push(field)
    }
  }

  for (const f of formulas.slice(0, 8)) {
    const alias = sanitizeSqlIdent(String(f.alias || f.id || 'calc'))
    const compiled = compileGridFormula(f.expr || f.formula || '')
    if (compiled.mode === 'expr' && compiled.expr) {
      const isAgg = /\b(sum|count|avg|min|max)\s*\(/i.test(compiled.expr)
      if (isAgg) hasAgg = true
      else groupBy.push(compiled.expr)
      selectParts.push(`(${compiled.expr}) AS ${quoteIdent(alias)}`)
    }
  }

  if (!selectParts.length) {
    selectParts.push('*')
  }

  let sql = `SELECT ${selectParts.join(', ')} FROM ${table}`
  if (hasAgg && groupBy.length) {
    sql += ` GROUP BY ${groupBy.join(', ')}`
  }

  const orderBy = spec.orderBy
  if (orderBy?.field) {
    const obField = sanitizeSqlIdent(orderBy.field)
    const dir = String(orderBy.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    sql += ` ORDER BY ${obField} ${dir}`
  }

  if (filters.length) {
    sql = applyFiltersToSql(sql, filters)
  }

  if (!/\blimit\s+\d+/i.test(sql)) {
    sql += ` LIMIT ${limit}`
  }

  return sql
}

/** List warehouse tables + optional column metadata for grid picker. */
export async function listGridExploreTables(workspaceId, { describe = false } = {}) {
  const tables = await listWarehouseTables(workspaceId)
  const items = []
  for (const t of tables.slice(0, 80)) {
    const entry = {
      name: t.rawTableName,
      sourceTable: t.sourceTable,
      rowCount: t.rowCount,
      connectionId: t.connectionId,
    }
    if (describe) {
      entry.columns = await describeGridTable(workspaceId, t.rawTableName)
    }
    items.push(entry)
  }
  return items
}

/** Column list for a warehouse table. */
export async function describeGridTable(workspaceId, tableName) {
  const reg = await ensureQueWarehouse(workspaceId)
  const safe = sanitizeTableRef(tableName)
  const bare = safe.includes('.') ? safe.split('.').pop() : safe
  const client = await pool.connect()
  try {
    await client.query(
      `SET search_path TO ${quoteIdent(reg.schemaName)}, public`,
    )
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position
       LIMIT 120`,
      [reg.schemaName, bare],
    )
    return rows.map((r) => ({
      name: r.column_name,
      dataType: r.data_type,
      nullable: r.is_nullable === 'YES',
    }))
  } finally {
    client.release()
  }
}

/**
 * Execute grid explore on Que Warehouse.
 * @param {string} workspaceId
 * @param {object} spec
 */
export async function executeGridExplore(workspaceId, spec = {}) {
  const compiled =
    spec.formula && !spec.sql
      ? compileGridFormula(spec.formula)
      : null

  let sql
  if (compiled?.mode === 'sql') {
    sql = compiled.sql
  } else if (compiled?.mode === 'expr' && spec.table) {
    const alias = sanitizeSqlIdent(spec.formulaAlias || 'value')
    const table = sanitizeTableRef(spec.table)
    sql = `SELECT (${compiled.expr}) AS ${quoteIdent(alias)} FROM ${table} LIMIT ${Math.min(Number(spec.limit) || 200, 500)}`
  } else {
    sql = buildGridSelectSql(spec)
  }

  const maxRows = Math.min(Number(spec.limit) || 200, 500)
  if (spec.biAccess) {
    const { applyBiAccessToSql, maskBiAccessColumns } = await import(
      './biAccessGroups.js'
    )
    sql = applyBiAccessToSql(sql, spec.biAccess)
  }

  const exec = await executeWarehouseReadonlySql(workspaceId, sql, {
    biWidget: true,
    maxRows,
  })

  let rows = exec.rows || []
  let columns = (exec.columns || []).map((c) => c.name)
  if (spec.biAccess) {
    const { maskBiAccessColumns } = await import('./biAccessGroups.js')
    const masked = maskBiAccessColumns(rows, columns, spec.biAccess)
    rows = masked.rows
    columns = masked.columns
  }

  return {
    sql,
    rows,
    columns,
    rowCount: exec.rowCount ?? rows.length,
    durationMs: exec.durationMs,
    engine: exec.engine,
    source: 'que_warehouse',
    truncated: exec.truncated,
  }
}
