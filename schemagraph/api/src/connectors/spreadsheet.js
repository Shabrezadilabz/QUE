/**
 * Excel / CSV connector — schema inference from files (no full data copy).
 * CSV is zero-dep; .xlsx/.xls use the `xlsx` package when present.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '../..')
const require = createRequire(import.meta.url)

/**
 * @typedef {object} FileSpec
 * @property {string} path
 * @property {string} [tableName]
 * @property {string} [sheet]
 */

/**
 * @typedef {object} SpreadsheetConfig
 * @property {string} [path]          // single file shortcut
 * @property {string} [tableName]
 * @property {string} [sheet]
 * @property {FileSpec[]} [files]
 * @property {boolean} [includeSamples]
 * @property {number} [sampleLimit]
 * @property {boolean} [headerRow]    // default true
 */

/**
 * Resolve connection config → list of absolute files to parse.
 * @param {SpreadsheetConfig} config
 * @returns {FileSpec[]}
 */
export function resolveFileSpecs(config = {}) {
  /** @type {FileSpec[]} */
  const specs = []
  if (Array.isArray(config.files) && config.files.length) {
    for (const f of config.files) {
      if (!f?.path) continue
      specs.push({
        path: resolvePath(f.path),
        tableName: f.tableName,
        sheet: f.sheet,
      })
    }
  } else if (config.path) {
    specs.push({
      path: resolvePath(config.path),
      tableName: config.tableName,
      sheet: config.sheet,
    })
  }
  return specs
}

function resolvePath(p) {
  if (!p) return p
  if (p.match(/^[a-zA-Z]:[\\/]/) || p.startsWith('/')) return p
  return resolve(API_ROOT, p)
}

/**
 * Introspect Excel/CSV files into the shared connector table shape.
 * @param {SpreadsheetConfig} config
 */
export async function introspectSpreadsheet(config = {}) {
  const specs = resolveFileSpecs(config)
  if (specs.length === 0) {
    throw new Error(
      'excel/csv config requires path or files[] (relative to api/ or absolute)',
    )
  }

  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)
  const headerRow = config.headerRow !== false

  const tables = []
  for (const spec of specs) {
    if (!existsSync(spec.path)) {
      throw new Error(`file not found: ${spec.path}`)
    }
    const ext = extname(spec.path).toLowerCase()
    const tableName =
      spec.tableName ||
      basename(spec.path, extname(spec.path))
        .replace(/[^\w]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() ||
      'sheet'

    let matrix
    if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
      const text = readFileSync(spec.path, 'utf8')
      matrix = parseDelimited(text, ext === '.tsv' ? '\t' : ',')
    } else if (ext === '.xlsx' || ext === '.xls') {
      matrix = readExcelSheet(spec.path, spec.sheet)
    } else {
      throw new Error(`unsupported spreadsheet extension: ${ext}`)
    }

    if (!matrix.length) {
      tables.push({ name: tableName, entityKind: 'TABLE', columns: [] })
      continue
    }

    const { headers, rows } = splitHeader(matrix, headerRow)
    const columns = headers.map((name, ordinal) => {
      const values = rows
        .map((r) => r[ordinal])
        .filter((v) => v != null && String(v).trim() !== '')
      const dataType = inferType(values)
      const keyKind = guessKeyKind(name, dataType, ordinal)
      return {
        name,
        dataType,
        keyKind,
        isNullable: values.length < rows.length,
        ordinal,
        referencesLabel: null,
        sampleValues: includeSamples
          ? uniqueSamples(values, sampleLimit)
          : [],
      }
    })

    tables.push({ name: tableName, entityKind: 'TABLE', columns })
  }

  return {
    schema: 'file',
    tables,
    foreignKeys: [],
  }
}

function readExcelSheet(filePath, sheetName) {
  let XLSX
  try {
    XLSX = require('xlsx')
  } catch {
    throw new Error(
      'xlsx package required for .xlsx/.xls — run: npm install xlsx',
    )
  }
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const name = sheetName && wb.SheetNames.includes(sheetName)
    ? sheetName
    : wb.SheetNames[0]
  if (!name) return []
  const sheet = wb.Sheets[name]
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })
  return aoa.map((row) =>
    (Array.isArray(row) ? row : []).map((c) =>
      c == null ? '' : String(c),
    ),
  )
}

/** Minimal RFC4180-ish CSV/TSV parser */
export function parseDelimited(text, delimiter = ',') {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  const input = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const next = input[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n' || (ch === '\r' && next === '\n')) {
      if (ch === '\r') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => String(c).trim() !== '')) rows.push(row)
      row = []
      continue
    }
    if (ch === '\r') {
      row.push(cell)
      cell = ''
      if (row.some((c) => String(c).trim() !== '')) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some((c) => String(c).trim() !== '')) rows.push(row)
  return rows
}

function splitHeader(matrix, headerRow) {
  if (!headerRow) {
    const width = Math.max(...matrix.map((r) => r.length), 0)
    return {
      headers: Array.from({ length: width }, (_, i) => `column_${i + 1}`),
      rows: matrix,
    }
  }
  const rawHeaders = matrix[0] ?? []
  const headers = rawHeaders.map((h, i) => {
    const cleaned = String(h ?? '')
      .trim()
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
    return cleaned || `column_${i + 1}`
  })
  // de-dupe header names
  const seen = new Map()
  const unique = headers.map((h) => {
    const n = (seen.get(h) ?? 0) + 1
    seen.set(h, n)
    return n === 1 ? h : `${h}_${n}`
  })
  return { headers: unique, rows: matrix.slice(1) }
}

function inferType(values) {
  if (values.length === 0) return 'TEXT'
  let intCount = 0
  let numCount = 0
  let boolCount = 0
  let dateCount = 0
  for (const v of values) {
    const s = String(v).trim()
    if (/^(true|false|yes|no)$/i.test(s)) {
      boolCount++
      continue
    }
    if (/^-?\d+$/.test(s)) {
      intCount++
      numCount++
      continue
    }
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      numCount++
      continue
    }
    if (!Number.isNaN(Date.parse(s)) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(s)) {
      dateCount++
    }
  }
  const n = values.length
  if (intCount / n >= 0.9) return 'INTEGER'
  if (numCount / n >= 0.9) return 'NUMERIC'
  if (boolCount / n >= 0.9) return 'BOOLEAN'
  if (dateCount / n >= 0.8) return 'TIMESTAMP'
  return 'TEXT'
}

function guessKeyKind(name, dataType, ordinal) {
  const n = name.toLowerCase()
  if (n === 'id' || n === '_id' || n.endsWith('_id') || n.endsWith('id')) {
    if (ordinal === 0 || n === 'id' || n === '_id') return 'pk'
    return 'fk'
  }
  if (n.includes('email') && dataType === 'TEXT') return 'unique'
  return 'none'
}

function uniqueSamples(values, limit) {
  const out = []
  const seen = new Set()
  for (const v of values) {
    const s = String(v)
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}
