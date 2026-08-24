/**
 * Scrub grid / preview rows before human display (defense in depth).
 * Uses column-name heuristics + sample scrub tokenization.
 */
import { scrubSampleValue } from './sampleScrub.js'

const PII_COL =
  /\b(email|e_mail|mail|phone|mobile|ssn|social|password|passwd|secret|token|api_key|credit|card|cvv|address|street|zip|postal|dob|birth|salary|iban|account_num)\b/i

/**
 * @param {string} colName
 * @param {Set<string>} [taggedNames]
 */
export function columnLooksSensitive(colName, taggedNames = null) {
  const key = String(colName || '').toLowerCase()
  if (taggedNames?.has(key)) return true
  return PII_COL.test(String(colName || ''))
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string[] | { name: string }[]} columns
 * @param {{ forceAll?: boolean, taggedNames?: Set<string> }} [opts]
 */
export function scrubGridRows(rows, columns = [], opts = {}) {
  const list = Array.isArray(rows) ? rows : []
  const colNames = (columns || []).map((c) =>
    typeof c === 'string' ? c : c?.name,
  ).filter(Boolean)
  if (!colNames.length && list[0] && typeof list[0] === 'object') {
    colNames.push(...Object.keys(list[0]))
  }
  const tagged = opts.taggedNames || null
  const sensitive = new Set(
    colNames.filter((n) =>
      opts.forceAll || columnLooksSensitive(n, tagged),
    ),
  )

  return list.map((row) => {
    if (!row || typeof row !== 'object') return row
    const out = { ...row }
    for (const col of colNames) {
      if (!sensitive.has(col)) continue
      const v = out[col]
      if (v == null) continue
      out[col] = scrubSampleValue(v)
    }
    return out
  })
}
