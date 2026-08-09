/**
 * Production — pinned scrubbed table samples (5–10 rows).
 * Immutable across sync until explicit re-pin.
 * Used for join overlap confidence + optional AI context.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { scrubSampleValue } from './privacy/sampleScrub.js'
import { getWorkspaceSettings } from './workspaceSettings.js'

export const PINNED_SAMPLE_ROWS_DEFAULT = 10
export const PINNED_SAMPLE_ROWS_MIN = 5
export const PINNED_SAMPLE_ROWS_MAX = 10

function mapPin(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    schemaObjectId: r.schema_object_id,
    connectionId: r.connection_id,
    tableName: r.table_name,
    rowCount: r.row_count,
    columns: Array.isArray(r.columns_json) ? r.columns_json : [],
    rows: Array.isArray(r.rows_json) ? r.rows_json : [],
    scrubbed: Boolean(r.scrubbed),
    pinnedAt: r.pinned_at,
    pinnedBy: r.pinned_by,
    sourceSyncAt: r.source_sync_at,
  }
}

export async function getPinnedSampleRowsSetting(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const n = Number(settings.pinnedSampleRows)
  if (!Number.isFinite(n)) return PINNED_SAMPLE_ROWS_DEFAULT
  return Math.min(
    PINNED_SAMPLE_ROWS_MAX,
    Math.max(PINNED_SAMPLE_ROWS_MIN, Math.round(n)),
  )
}

/**
 * Build row-oriented samples from per-column sample_values (zip/cycle).
 */
export function buildRowsFromColumnSamples(columns, maxRows) {
  const cols = (columns || []).map((c) => ({
    name: c.name,
    dataType: c.dataType || c.data_type || null,
    keyKind: c.keyKind || c.key_kind || null,
    samples: Array.isArray(c.sampleValues)
      ? c.sampleValues
      : Array.isArray(c.sample_values)
        ? c.sample_values
        : [],
  }))
  const depth = Math.max(0, ...cols.map((c) => c.samples.length))
  const n = Math.min(maxRows, Math.max(depth, 0))
  const rows = []
  for (let i = 0; i < n; i++) {
    const row = {}
    for (const c of cols) {
      row[c.name] = c.samples.length ? c.samples[i % c.samples.length] : null
    }
    rows.push(row)
  }
  return {
    columns: cols.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      keyKind: c.keyKind,
    })),
    rows,
  }
}

function scrubRows(rows, columns, { enabled = true } = {}) {
  if (!enabled) return rows
  return (rows || []).map((row) => {
    const out = {}
    for (const col of columns || []) {
      const name = col.name
      out[name] = scrubSampleValue(row?.[name])
    }
    return out
  })
}

/**
 * Pin samples for one table from current schema_columns.
 */
export async function pinTableSamples(
  workspaceId,
  schemaObjectId,
  { userId = null, force = false, maxRows = null } = {},
) {
  const limit = maxRows || (await getPinnedSampleRowsSetting(workspaceId))
  const { rows: objs } = await query(
    `SELECT o.id, o.name, o.connection_id
     FROM schema_objects o
     WHERE o.workspace_id = $1 AND o.id = $2`,
    [workspaceId, schemaObjectId],
  )
  if (!objs[0]) {
    const err = new Error('table not found')
    err.status = 404
    throw err
  }
  const obj = objs[0]

  if (!force) {
    const { rows: existing } = await query(
      `SELECT id FROM pinned_table_samples
       WHERE workspace_id = $1 AND schema_object_id = $2`,
      [workspaceId, schemaObjectId],
    )
    if (existing[0]) {
      return getPinnedSample(workspaceId, schemaObjectId)
    }
  }

  const { rows: cols } = await query(
    `SELECT name, data_type, key_kind, sample_values
     FROM schema_columns
     WHERE schema_object_id = $1
     ORDER BY ordinal, name`,
    [schemaObjectId],
  )
  const built = buildRowsFromColumnSamples(
    cols.map((c) => ({
      name: c.name,
      dataType: c.data_type,
      keyKind: c.key_kind,
      sampleValues: c.sample_values,
    })),
    limit,
  )
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const scrubOn = settings.scrubSamples !== false
  const scrubbedRows = scrubRows(built.rows, built.columns, { enabled: scrubOn })

  const id = randomUUID()
  await query(
    `INSERT INTO pinned_table_samples (
       id, workspace_id, schema_object_id, connection_id, table_name,
       row_count, columns_json, rows_json, scrubbed, pinned_by, source_sync_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10, now())
     ON CONFLICT (workspace_id, schema_object_id) DO UPDATE SET
       connection_id = EXCLUDED.connection_id,
       table_name = EXCLUDED.table_name,
       row_count = EXCLUDED.row_count,
       columns_json = EXCLUDED.columns_json,
       rows_json = EXCLUDED.rows_json,
       scrubbed = EXCLUDED.scrubbed,
       pinned_by = EXCLUDED.pinned_by,
       pinned_at = now(),
       source_sync_at = now()`,
    [
      id,
      workspaceId,
      schemaObjectId,
      obj.connection_id,
      obj.name,
      scrubbedRows.length,
      JSON.stringify(built.columns),
      JSON.stringify(scrubbedRows),
      scrubOn,
      userId,
    ],
  )
  return getPinnedSample(workspaceId, schemaObjectId)
}

export async function getPinnedSample(workspaceId, schemaObjectId) {
  const { rows } = await query(
    `SELECT * FROM pinned_table_samples
     WHERE workspace_id = $1 AND schema_object_id = $2`,
    [workspaceId, schemaObjectId],
  )
  return rows[0] ? mapPin(rows[0]) : null
}

export async function listPinnedSamples(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM pinned_table_samples
     WHERE workspace_id = $1
     ORDER BY table_name`,
    [workspaceId],
  )
  return rows.map(mapPin)
}

/**
 * After sync: pin any table that has no pin yet (does not overwrite).
 */
export async function ensurePinnedSamplesForConnection(
  workspaceId,
  connectionId,
  { userId = null } = {},
) {
  const { rows } = await query(
    `SELECT o.id
     FROM schema_objects o
     LEFT JOIN pinned_table_samples p
       ON p.schema_object_id = o.id AND p.workspace_id = o.workspace_id
     WHERE o.workspace_id = $1 AND o.connection_id = $2 AND p.id IS NULL`,
    [workspaceId, connectionId],
  )
  let created = 0
  for (const r of rows) {
    await pinTableSamples(workspaceId, r.id, { userId, force: false })
    created += 1
  }
  return { created, scanned: rows.length }
}

/**
 * Column values from pinned rows (for overlap scoring).
 */
export async function getPinnedColumnValues(
  workspaceId,
  tableName,
  columnName,
) {
  const { rows } = await query(
    `SELECT rows_json FROM pinned_table_samples
     WHERE workspace_id = $1 AND lower(table_name) = lower($2)
     LIMIT 1`,
    [workspaceId, tableName],
  )
  if (!rows[0]) return []
  const data = Array.isArray(rows[0].rows_json) ? rows[0].rows_json : []
  return data
    .map((row) => row?.[columnName])
    .filter((v) => v != null && String(v).trim() !== '')
    .map(String)
}

/**
 * Batch: Map `table\0column` → string[] from all workspace pins.
 */
export async function loadPinnedColumnValueMap(workspaceId) {
  const pins = await listPinnedSamples(workspaceId)
  const map = new Map()
  for (const p of pins) {
    for (const row of p.rows || []) {
      for (const [col, val] of Object.entries(row || {})) {
        if (val == null || String(val).trim() === '') continue
        const key = `${p.tableName}\0${col}`
        if (!map.has(key)) map.set(key, [])
        const arr = map.get(key)
        if (arr.length < 10) arr.push(String(val))
      }
    }
  }
  return map
}

/**
 * Overlap ratio between two pinned columns (0–1) + band label.
 */
export function scorePinnedOverlap(aValues, bValues) {
  const a = new Set(
    (aValues || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean),
  )
  const b = new Set(
    (bValues || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean),
  )
  if (!a.size || !b.size) {
    return {
      ratio: null,
      inter: 0,
      band: 'unknown',
      confidenceHint: null,
      label: 'No pinned sample overlap available',
    }
  }
  let inter = 0
  for (const v of a) if (b.has(v)) inter += 1
  const union = a.size + b.size - inter
  const ratio = union === 0 ? 0 : inter / union
  let band = 'low'
  let confidenceHint = 0.55
  if (ratio >= 0.66) {
    band = 'high'
    confidenceHint = 0.88 + Math.min(0.07, ratio * 0.08)
  } else if (ratio >= 0.33) {
    band = 'medium'
    confidenceHint = 0.72 + ratio * 0.15
  } else if (ratio > 0) {
    band = 'low'
    confidenceHint = 0.55 + ratio * 0.2
  } else {
    band = 'none'
    confidenceHint = 0.35
  }
  return {
    ratio,
    inter,
    union,
    aSize: a.size,
    bSize: b.size,
    band,
    confidenceHint: Math.min(0.95, confidenceHint),
    label: `Pinned sample overlap ${(ratio * 100).toFixed(0)}% (${inter}/${union}) · ${band}`,
  }
}

/**
 * Pack for AI: compact pinned samples (only when allowed).
 */
export async function buildPinnedSamplesAiPack(workspaceId, { maxTables = 24 } = {}) {
  const pins = await listPinnedSamples(workspaceId)
  return pins.slice(0, maxTables).map((p) => ({
    table: p.tableName,
    columns: p.columns.map((c) => c.name),
    rows: (p.rows || []).slice(0, 10),
    scrubbed: p.scrubbed,
    pinnedAt: p.pinnedAt,
  }))
}
