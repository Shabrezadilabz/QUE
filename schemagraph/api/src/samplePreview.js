/**
 * Build schema-level sample row grids from capped column samples.
 * Never queries the warehouse — reconstructs up to N illustrative rows
 * from metadata samples captured at sync (schema-only policy).
 * Product default: up to 10 rows for schema / dry-run previews.
 */

export const SCHEMA_SAMPLE_MAX_ROWS = 10

/**
 * @param {{ name: string, connection?: string, sourceType?: string, columns?: { name: string, dataType?: string, keyKind?: string, samples?: unknown[] }[] }} table
 * @param {number} [maxRows=10]
 */
export function buildSamplePreview(table, maxRows = SCHEMA_SAMPLE_MAX_ROWS) {
  if (!table?.name || !Array.isArray(table.columns) || table.columns.length === 0) {
    return null
  }

  const cap = Math.min(
    Math.max(Number(maxRows) || SCHEMA_SAMPLE_MAX_ROWS, 1),
    SCHEMA_SAMPLE_MAX_ROWS,
  )
  const cols = table.columns.slice(0, 12)
  const depth = Math.min(
    cap,
    Math.max(1, ...cols.map((c) => (c.samples?.length ? c.samples.length : 0)), 1),
  )

  // If no samples at all, still show schema header row with type placeholders
  const hasAnySample = cols.some((c) => c.samples && c.samples.length > 0)
  const rows = []
  for (let i = 0; i < (hasAnySample ? depth : Math.min(2, cap)); i++) {
    const row = {}
    for (const c of cols) {
      const samples = Array.isArray(c.samples) ? c.samples : []
      if (samples.length > 0) {
        row[c.name] = samples[i % samples.length]
      } else {
        row[c.name] = null
      }
    }
    rows.push(row)
  }

  return {
    table: table.name,
    connection: table.connection || null,
    sourceType: table.sourceType || null,
    policy: 'schema-samples-only',
    note: hasAnySample
      ? `Up to ${rows.length} illustrative row(s) from capped sync samples (max ${SCHEMA_SAMPLE_MAX_ROWS}) — not a live warehouse query.`
      : 'No column samples stored yet — sync with “Include column samples” to populate previews.',
    columns: cols.map((c) => ({
      name: c.name,
      dataType: c.dataType || 'unknown',
      keyKind: c.keyKind || 'none',
    })),
    rows,
    rowCount: rows.length,
  }
}

/**
 * Attach samplePreviews for referenced tables using full pack (richer samples).
 * @param {object} result - chat answer
 * @param {object} pack - schema context pack
 * @param {number} [maxTables=3]
 * @param {number} [maxRows=10]
 */
export function attachSamplePreviews(
  result,
  pack,
  maxTables = 3,
  maxRows = SCHEMA_SAMPLE_MAX_ROWS,
) {
  if (!result || !pack) return result
  const refs = result.referencedTables || []
  if (!refs.length) {
    return { ...result, samplePreviews: result.samplePreviews || [] }
  }

  const byName = new Map(
    (pack.tables || []).map((t) => [String(t.name).toLowerCase(), t]),
  )

  const previews = []
  for (const ref of refs.slice(0, maxTables)) {
    const full = byName.get(String(ref.name).toLowerCase()) || ref
    // Prefer pack columns (may have more samples than compact)
    const preview = buildSamplePreview(
      {
        name: full.name,
        connection: full.connection || ref.connection,
        sourceType: full.sourceType || ref.sourceType,
        columns: (full.columns || ref.columns || []).map((c) => ({
          name: c.name,
          dataType: c.dataType,
          keyKind: c.keyKind,
          samples: c.samples || [],
        })),
      },
      maxRows,
    )
    if (preview) previews.push(preview)
  }

  return { ...result, samplePreviews: previews }
}
