/**
 * Sprint 8 — SOC 2 Type II audit kickoff (evidence freeze + observation clock).
 * Does NOT claim certification — tracks diligence milestones only.
 */
import { createHash } from 'node:crypto'
import { getWorkspaceSettings, patchWorkspaceSettingsJson } from './workspaceSettings.js'
import { buildSoc2EvidencePack } from './soc2Evidence.js'
import { recordAuditEvent } from './auditLog.js'

export function defaultSoc2Kickoff() {
  return {
    phase: 'pre_kickoff',
    auditorEngaged: false,
    auditorName: null,
    penTestScheduledAt: null,
    penTestVendor: null,
    observationStartedAt: null,
    evidenceFrozenAt: null,
    evidenceFrozenHash: null,
    note: 'Engage auditor and schedule pen test to start Type II observation period.',
  }
}

export async function getSoc2KickoffStatus(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  return {
    ...defaultSoc2Kickoff(),
    ...(settings.soc2Kickoff && typeof settings.soc2Kickoff === 'object'
      ? settings.soc2Kickoff
      : {}),
    evidenceFrozen: settings.soc2EvidenceFrozen || null,
  }
}

export async function updateSoc2Kickoff(workspaceId, patch = {}, userId = null) {
  const current = await getSoc2KickoffStatus(workspaceId)
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  delete next.evidenceFrozen
  if (next.auditorEngaged && !next.observationStartedAt) {
    next.phase = 'observation'
    next.observationStartedAt =
      next.observationStartedAt || new Date().toISOString()
  }
  await patchWorkspaceSettingsJson(workspaceId, { soc2Kickoff: next })
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'soc2.kickoff_update',
    resourceType: 'compliance',
    summary: `SOC2 kickoff updated — phase=${next.phase}`,
  })
  return getSoc2KickoffStatus(workspaceId)
}

export async function kickoffSoc2TypeII(workspaceId, body = {}, userId = null) {
  const patch = {
    auditorEngaged: body.auditorEngaged !== false,
    auditorName: String(body.auditorName || 'TBD').slice(0, 120),
    penTestScheduledAt: body.penTestScheduledAt || null,
    penTestVendor: body.penTestVendor
      ? String(body.penTestVendor).slice(0, 120)
      : null,
    observationStartedAt: body.observationStartedAt || new Date().toISOString(),
    phase: 'observation',
    note: 'Type II observation period started — evidence pack should be frozen.',
  }
  return updateSoc2Kickoff(workspaceId, patch, userId)
}

export async function freezeSoc2EvidencePack(workspaceId, userId = null) {
  const { pack, markdown } = await buildSoc2EvidencePack(workspaceId)
  const hash = createHash('sha256')
    .update(JSON.stringify(pack))
    .digest('hex')
    .slice(0, 16)
  const frozenAt = new Date().toISOString()
  const frozen = {
    ...pack,
    frozen: true,
    frozenAt,
    frozenHash: hash,
  }

  const kickoff = await getSoc2KickoffStatus(workspaceId)
  const nextKickoff = {
    ...kickoff,
    evidenceFrozenAt: frozenAt,
    evidenceFrozenHash: hash,
    phase: kickoff.phase === 'pre_kickoff' ? 'observation' : kickoff.phase,
    observationStartedAt:
      kickoff.observationStartedAt || frozenAt,
  }
  delete nextKickoff.evidenceFrozen

  await patchWorkspaceSettingsJson(workspaceId, {
    soc2EvidenceFrozen: frozen,
    soc2Kickoff: nextKickoff,
  })

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'soc2.evidence_freeze',
    resourceType: 'compliance',
    summary: `SOC2 evidence pack frozen — hash ${hash}`,
  })

  return { pack: frozen, markdown, hash, kickoff: nextKickoff }
}

/** S12.6 — Track observation completion (external auditor letter still required). */
export async function markSoc2ObservationComplete(workspaceId, body = {}, userId = null) {
  const current = await getSoc2KickoffStatus(workspaceId)
  if (!current.observationStartedAt) {
    const err = new Error('Start observation before marking complete')
    err.status = 400
    throw err
  }
  const next = {
    phase: 'report_pending',
    observationCompletedAt: body.completedAt || new Date().toISOString(),
    reportLetterExpectedAt: body.reportLetterExpectedAt || null,
    note:
      'Observation window closed — Type II report letter issued by external auditor (not Que API).',
  }
  await patchWorkspaceSettingsJson(workspaceId, {
    soc2Kickoff: { ...current, ...next, updatedAt: new Date().toISOString() },
  })
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'soc2.observation_complete',
    resourceType: 'compliance',
    summary: 'SOC2 Type II observation marked complete — await auditor letter',
  })
  return getSoc2KickoffStatus(workspaceId)
}
