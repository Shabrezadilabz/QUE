/**
 * Phase 2 — mandatory 5–10 scrubbed samples gate for AI surfaces.
 */
import { PINNED_SAMPLE_ROWS_MIN, PINNED_SAMPLE_ROWS_MAX } from '../pinnedSamples.js'

/**
 * @param {object} input
 */
export function evaluateSampleGate(input = {}) {
  const settings = input.settings || {}
  const enforce = settings.enforceMandatorySamples !== false
  const tableCount = input.tableCount ?? 0
  const validation = input.validation || {}
  const sampleWarnings = input.sampleWarnings || []

  if (!enforce) {
    return {
      blocked: false,
      enforced: false,
      code: 'gate_disabled',
      warnings: [...(validation.warnings || []), ...sampleWarnings],
    }
  }

  if (tableCount === 0) {
    return {
      blocked: false,
      enforced: true,
      code: 'no_tables',
      warnings: [],
    }
  }

  const warnings = [
    ...(validation.warnings || []),
    ...sampleWarnings.filter(
      (w) => !(validation.warnings || []).includes(w),
    ),
  ]

  const blocked = validation.ok === false || warnings.length > 0

  return {
    blocked,
    enforced: true,
    code: blocked ? 'samples_insufficient' : 'samples_ok',
    warnings,
    minSamples: validation.minSamples ?? PINNED_SAMPLE_ROWS_MIN,
    maxSamples: validation.maxSamples ?? PINNED_SAMPLE_ROWS_MAX,
    tablesWithSamples: validation.tablesWithSamples ?? 0,
    tableCount: validation.tableCount ?? tableCount,
  }
}

/**
 * User-facing block message when mandatory samples are missing.
 * @param {object} gate
 */
export function formatSampleGateBlockMessage(gate = {}) {
  const min = gate.minSamples ?? PINNED_SAMPLE_ROWS_MIN
  const max = gate.maxSamples ?? PINNED_SAMPLE_ROWS_MAX
  const lines = [
    `**Sample gate** — AI is paused until every focus table has **${min}–${max} scrubbed sample values**.`,
    '',
    'Sync your sources (samples are pinned automatically) or re-pin tables under Join Review.',
    '',
  ]
  for (const w of (gate.warnings || []).slice(0, 8)) {
    lines.push(`- ${w}`)
  }
  if ((gate.warnings || []).length > 8) {
    lines.push(`- …and ${gate.warnings.length - 8} more`)
  }
  lines.push(
    '',
    '_Row payloads never enter the model — only scrubbed samples in the context pack._',
  )
  return lines.join('\n')
}

/**
 * Throws when gate blocks (for API handlers that prefer exceptions).
 */
export function assertSampleGateOpen(gate) {
  if (!gate?.blocked) return
  const err = new Error(formatSampleGateBlockMessage(gate))
  err.status = 422
  err.code = gate.code || 'samples_insufficient'
  err.sampleGate = gate
  throw err
}
