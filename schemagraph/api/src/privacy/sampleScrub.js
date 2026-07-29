/**
 * Sample scrubbing — hash/tokenize column samples before metadata DB.
 * Default ON for new workspaces (includeSamplesDefault: false OR scrubSamples: true).
 */
import { createHash } from 'node:crypto'

/**
 * @param {unknown} value
 * @param {{ salt?: string }} [opts]
 */
export function scrubSampleValue(value, opts = {}) {
  if (value == null) return null
  const s = String(value)
  if (!s) return ''
  // Keep tiny non-sensitive shapes (bool-like, short enums) readable
  if (/^(true|false|yes|no|null|n\/a)$/i.test(s)) return s.toLowerCase()
  if (/^\d{1,4}$/.test(s)) return s // small ints often categorical
  const salt = opts.salt || process.env.QUE_SAMPLE_SCRUB_SALT || 'que-sample-v1'
  const digest = createHash('sha256')
    .update(salt)
    .update('\0')
    .update(s)
    .digest('hex')
    .slice(0, 12)
  // Preserve rough shape for join heuristics (email-ish, uuid-ish, numeric)
  if (s.includes('@')) return `email_${digest}`
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  ) {
    return `uuid_${digest}`
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return `num_${digest}`
  return `tok_${digest}`
}

/**
 * @param {string[]} samples
 * @param {{ enabled?: boolean, salt?: string }} [opts]
 */
export function scrubSampleList(samples, opts = {}) {
  const list = Array.isArray(samples) ? samples : []
  if (opts.enabled === false) return list.map(String).slice(0, 5)
  return list
    .slice(0, 5)
    .map((v) => scrubSampleValue(v, opts))
    .filter((v) => v != null)
}

/**
 * Apply scrubbing to introspected tables in-place style (returns new structure).
 */
export function scrubIntrospectionResult(result, opts = {}) {
  if (!result || opts.enabled === false) return result
  const tables = (result.tables || []).map((t) => ({
    ...t,
    columns: (t.columns || []).map((c) => ({
      ...c,
      sampleValues: scrubSampleList(c.sampleValues || c.samples || [], opts),
    })),
  }))
  return {
    ...result,
    tables,
    meta: {
      ...(result.meta || {}),
      samplesScrubbed: true,
    },
  }
}
