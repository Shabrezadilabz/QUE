/**
 * Phase 4 — QueExpr (DAX-like measures for BI Studio visuals).
 * Reuses grid formula compiler; outputs warehouse SQL fragments.
 */
import { compileGridFormula } from './gridExplore.js'
import { sanitizeSqlIdent } from './boardFilters.js'

export { compileGridFormula as compileQueExpr }

/**
 * Build grouped chart SQL from dimension + QueExpr measure.
 * @param {object} opts
 */
export function buildChartMeasureSql(opts = {}) {
  const table = String(opts.table || 'que_marts.certified_mart').trim()
  const xField = opts.xField ? String(opts.xField).trim() : null
  const yExpr = opts.yExpr ? String(opts.yExpr).trim() : null
  const yField = opts.yField ? String(opts.yField).trim() : null
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 500)

  if (yExpr) {
    const compiled = compileGridFormula(yExpr)
    if (compiled.mode === 'sql') {
      return {
        sql: String(compiled.sql),
        measureAlias: 'measure_value',
        fields: xField ? [xField] : [],
        note: 'Full SQL from QueExpr',
      }
    }
    const measureExpr = compiled.expr
    const alias = 'measure_value'
    if (xField) {
      const x = sanitizeSqlIdent(xField)
      return {
        sql: `SELECT ${x},\n       ${measureExpr} AS ${alias}\nFROM ${table}\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT ${limit}`,
        measureAlias: alias,
        fields: [xField, alias],
        note: 'QueExpr measure with dimension',
      }
    }
    return {
      sql: `SELECT ${measureExpr} AS ${alias}\nFROM ${table}\nLIMIT ${limit}`,
      measureAlias: alias,
      fields: [alias],
      note: 'QueExpr scalar measure',
    }
  }

  if (xField && yField) {
    const x = sanitizeSqlIdent(xField)
    const y = sanitizeSqlIdent(yField)
    return {
      sql: `SELECT ${x},\n       SUM(${y}) AS ${y}\nFROM ${table}\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT ${limit}`,
      measureAlias: yField,
      fields: [xField, yField],
      note: 'Default SUM measure',
    }
  }

  return {
    sql: `SELECT *\nFROM ${table}\nLIMIT 100`,
    measureAlias: null,
    fields: [],
    note: 'Fallback table preview',
  }
}
