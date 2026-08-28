/**
 * Phase 2 — unified context pack validation + strict LLM anchor prompt.
 */
import {
  validateSqlAgainstSchema,
  buildAllowedTableSet,
} from '../chatSqlGuard.js'
import {
  PINNED_SAMPLE_ROWS_MIN,
  PINNED_SAMPLE_ROWS_MAX,
} from '../pinnedSamples.js'

export const SSM_SYSTEM_PROMPT_ANCHOR = [
  'You may ONLY use tables, columns, and joins present in contextPack.',
  'Do not invent objects. Output executable SQL or JSON specs.',
  'Never fabricate row values — live row data is executed server-side.',
  'If a table or column is not listed, it does NOT exist.',
].join(' ')

/**
 * @param {object} contextPack unified pack or { focusedPack, pack }
 * @param {string|null} [connectionName]
 */
export function validateAgainstContextPack(sql, contextPack, connectionName = null) {
  const pack =
    contextPack?.focusedPack ||
    contextPack?.pack ||
    contextPack
  return validateSqlAgainstSchema(sql, pack, connectionName)
}

/**
 * @param {object} contextPack
 */
export function listAllowedTableNames(contextPack) {
  const pack =
    contextPack?.focusedPack ||
    contextPack?.pack ||
    contextPack
  return [...buildAllowedTableSet(pack)].filter((n) => !n.includes('.'))
}

/**
 * Validate pack structure — mandatory 5–10 scrubbed samples per focus table.
 * @param {object} params
 */
export function validateContextPackStructure({
  pack,
  focusedPack,
  pinnedSamples = [],
  minSamples = PINNED_SAMPLE_ROWS_MIN,
  maxSamples = PINNED_SAMPLE_ROWS_MAX,
} = {}) {
  const focus = focusedPack?.tables || pack?.tables || []
  const pinByTable = new Map(
    (pinnedSamples || []).map((p) => [String(p.table || '').toLowerCase(), p]),
  )
  const warnings = []
  let tablesWithSamples = 0

  for (const t of focus) {
    const pin = pinByTable.get(String(t.name || '').toLowerCase())
    const pinRows = pin?.rows?.length || 0
    const colSampleDepth = Math.max(
      0,
      ...(t.columns || []).map((c) => (c.samples || []).length),
    )
    const depth = Math.max(pinRows, colSampleDepth)
    if (depth >= minSamples) {
      tablesWithSamples += 1
    } else if (depth > 0) {
      warnings.push(
        `${t.name}: only ${depth} sample value(s) (need ${minSamples}–${maxSamples})`,
      )
    } else {
      warnings.push(`${t.name}: no scrubbed samples available`)
    }
  }

  return {
    ok: focus.length === 0 || warnings.length === 0,
    tablesWithSamples,
    tableCount: focus.length,
    warnings,
    minSamples,
    maxSamples,
    requiredTables: focus.length,
  }
}

/**
 * @param {object} contextPack
 * @param {{ rulesBlock?: string }} [opts]
 */
export function formatSsmSystemPrompt(contextPack, opts = {}) {
  const intent = contextPack?.intent || contextPack?.ssmRoute?.intent || 'question'
  const allowed = listAllowedTableNames(contextPack).slice(0, 60)
  const lines = [
    SSM_SYSTEM_PROMPT_ANCHOR,
    `Intent: ${intent}`,
    allowed.length
      ? `Allowed tables (${allowed.length}): ${allowed.join(', ')}`
      : 'Allowed tables: (none synced)',
  ]
  if (contextPack?.ssmRoute?.workspaceStateSummary) {
    lines.push(`Workspace state: ${contextPack.ssmRoute.workspaceStateSummary}`)
  }
  if (opts.rulesBlock) {
    lines.push('', opts.rulesBlock)
  }
  return lines.join('\n')
}
