/**
 * CEO P0 — Join risk tiers: green | yellow | red.
 * Green may auto-Promote only when settings + golden recall allow.
 * Yellow = one-click Promote with explanation.
 * Red = DE/admin only.
 */
import { getWorkspaceSettings } from './workspaceSettings.js'

export const RISK_TIERS = /** @type {const} */ (['green', 'yellow', 'red'])

/**
 * @param {object|null} evidence
 * @param {number|null|undefined} confidence
 * @param {{ crossSource?: boolean, lastGoldenRecall?: number|null, autoPromoteMinRecall?: number }} [ctx]
 */
export function classifyRiskTier(evidence, confidence, ctx = {}) {
  const conf = Number(confidence)
  const ev = evidence && typeof evidence === 'object' ? evidence : {}
  const reasons = [
    ...(Array.isArray(ev.reasons) ? ev.reasons : []),
    ...(Array.isArray(ev.signals)
      ? ev.signals.map((s) =>
          typeof s === 'string' ? s : `${s?.code || ''} ${s?.label || ''}`,
        )
      : []),
    String(ev.reason || ''),
    String(ev.method || ''),
    String(ev.summary || ''),
  ]
    .join(' ')
    .toLowerCase()

  const hasSafeSignal =
    /exact|name.?match|fk|primary.?key|foreign.?key|same.?name|query.?history/.test(
      reasons,
    ) ||
    ev.nameMatch === true ||
    ev.fk === true ||
    Number(ev.nameSimilarity) >= 0.95

  const pinnedBand = String(ev.pinnedOverlap?.band || '').toLowerCase()
  const highPin = pinnedBand === 'high'
  const lowPin = pinnedBand === 'low' || pinnedBand === 'none'

  const minRecall = Number(ctx.autoPromoteMinRecall)
  const recallOk =
    !Number.isFinite(minRecall) ||
    minRecall <= 0 ||
    (ctx.lastGoldenRecall != null &&
      Number(ctx.lastGoldenRecall) >= minRecall)

  // Red: weak confidence, conflicting/low pin, or opaque AI-only
  if (
    !Number.isFinite(conf) ||
    conf < 0.7 ||
    lowPin ||
    (!hasSafeSignal && conf < 0.85)
  ) {
    return {
      tier: 'red',
      rationale:
        'Needs DE/admin review — weak or opaque evidence (confidence/pins/signals).',
      greenEligible: false,
    }
  }

  // Green candidate: high conf + safe signal (+ optional high pin)
  if (conf >= 0.92 && hasSafeSignal && (!ctx.crossSource || highPin || conf >= 0.96)) {
    return {
      tier: 'green',
      rationale: recallOk
        ? 'Low-risk: strong name/FK/history evidence; eligible for auto-Promote when enabled.'
        : 'Looks low-risk, but golden-set recall is below threshold — treat as Yellow until eval passes.',
      greenEligible: recallOk,
      effectiveTier: recallOk ? 'green' : 'yellow',
    }
  }

  return {
    tier: 'yellow',
    rationale:
      'One-click Promote with explanation — decent evidence, still needs a human gate.',
    greenEligible: false,
  }
}

/** Resolve effective tier after golden-set gate. */
export function effectiveTier(classified) {
  if (!classified) return 'yellow'
  if (classified.tier === 'green' && classified.greenEligible === false) {
    return 'yellow'
  }
  return classified.effectiveTier || classified.tier || 'yellow'
}

export async function riskContextForWorkspace(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  return {
    autoPromoteMinRecall: Number(settings.autoPromoteMinRecall ?? 0.9),
    lastGoldenRecall:
      settings.lastGoldenEval?.recall != null
        ? Number(settings.lastGoldenEval.recall)
        : null,
    enableAutoPromoteLowRisk: settings.enableAutoPromoteLowRisk === true,
    yellowPromoteMinRole: settings.yellowPromoteMinRole || 'member',
    redPromoteMinRole: settings.redPromoteMinRole || 'admin',
  }
}
