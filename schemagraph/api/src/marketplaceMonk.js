/**
 * S6 — Marketplace → Monk one-click (install template + start Monk run).
 */
import { getIndustryTemplatePack } from './industryTemplates.js'
import { applyIndustryTemplatePack } from './industryTemplates.js'
import { getIndustryPack } from './packs/index.js'
import { startMonkModeRun } from './monkMode.js'
import { recordAuditEvent } from './auditLog.js'

/** Map marketplace template id or monk pack id → monk pack id. */
export function resolveMonkPackId(packOrTemplateId) {
  const id = String(packOrTemplateId || '').trim()
  if (!id) return null

  const monk = getIndustryPack(id)
  if (monk) return monk.id

  const template = getIndustryTemplatePack(id)
  if (template?.monkPackId) return template.monkPackId

  return null
}

/**
 * Install marketplace template (optional) and start Monk Mode with pack pre-selected.
 */
export async function installAndStartMonk(
  workspaceId,
  packOrTemplateId,
  { userId = null, installTemplate = true } = {},
) {
  const monkPackId = resolveMonkPackId(packOrTemplateId)
  if (!monkPackId) {
    const err = new Error('No Monk pack linked to this marketplace item')
    err.status = 404
    throw err
  }

  const monkPack = getIndustryPack(monkPackId)
  let install = null
  const templateId =
    getIndustryTemplatePack(packOrTemplateId)?.id ||
    monkPack?.templatePackId ||
    null

  if (installTemplate && templateId) {
    install = await applyIndustryTemplatePack(workspaceId, templateId, { userId })
  }

  const run = await startMonkModeRun(workspaceId, {
    packId: monkPackId,
    userId,
  })

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'marketplace.start_monk',
    resourceType: 'monk_run',
    resourceId: run.id,
    summary: `Marketplace → Monk: ${monkPack?.displayName || monkPackId}`,
    meta: {
      templateId,
      monkPackId,
      installJobId: install?.job?.id || null,
    },
  })

  return {
    monkPackId,
    monkPack: monkPack
      ? {
          id: monkPack.id,
          displayName: monkPack.displayName,
          industry: monkPack.industry,
        }
      : null,
    run,
    install,
    href: `/monk?pack=${encodeURIComponent(monkPackId)}&run=${encodeURIComponent(run.id)}`,
    hint: 'Monk Mode started — review join suggestions and promote before cert',
  }
}
