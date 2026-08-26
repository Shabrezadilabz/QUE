/**
 * Pack policy gates — HIPAA, finance ledger, audit evidence (Phase 4).
 */

/**
 * @param {object} pack
 * @param {{ matches: object[], canRunMonk?: boolean }} matchResult
 */
export function validatePackPoliciesForMonk(pack, matchResult) {
  const policies = pack?.policies || {}
  const warnings = []
  const blocks = []

  if (policies.hipaaStrict) {
    warnings.push(
      'HIPAA strict mode: PHI scrub mandatory; no PHI in LLM context; join promote requires 95% confidence.',
    )
    if (policies.noAutoPromoteJoins) {
      warnings.push('Auto-promote joins disabled — all healthcare joins require human review.')
    }
  }

  if (policies.noAutoMaterialize) {
    warnings.push(
      'Finance pack: materialization is plan-only — human confirm required before production ledger writes.',
    )
  }

  if (policies.noAutoFixApply) {
    warnings.push('Finance pack: fix proposals require steward approval before apply.')
  }

  if (policies.immutableMonkLog) {
    warnings.push('Audit pack: Monk Mode events are immutable evidence — export from Compliance.')
  }

  if (!matchResult?.canRunMonk && (pack?.requiredForMonk || []).length) {
    blocks.push(
      `Missing required tables: ${(matchResult?.missing || []).join(', ') || 'sync schema first'}`,
    )
  }

  return {
    ok: blocks.length === 0,
    warnings,
    blocks,
    policies,
  }
}

export function getPackCertMinRecall(pack) {
  const p = pack?.policies?.minCertRecall
  if (typeof p === 'number') return p
  if (pack?.id === 'healthcare-v1') return 0.5
  if (pack?.id === 'finance-v1') return 0.45
  return Number(process.env.QUE_MONK_MIN_RECALL || 0.35)
}

export function shouldSkipMartMaterialize(pack) {
  return Boolean(pack?.policies?.noAutoMaterialize)
}

export function shouldUseTemplateFallback(pack) {
  return pack?.templatePackId || null
}
