/**
 * Sprint 10 — Airbyte / Fivetran / Hevo post-sync ingest hook.
 */
import { runPostSyncAutomation } from './postSyncAutomation.js'
import { recordAuditEvent } from './auditLog.js'

export const PARTNER_INGEST_SOURCES = ['airbyte', 'fivetran', 'hevo']

/**
 * @param {string} workspaceId
 * @param {object} body
 */
export async function handlePartnerIngestHook(workspaceId, body = {}, userId = null) {
  const source = String(body.source || body.partner || 'generic').toLowerCase()
  if (!PARTNER_INGEST_SOURCES.includes(source) && source !== 'generic') {
    const err = new Error(
      `source must be one of: ${PARTNER_INGEST_SOURCES.join(', ')}`,
    )
    err.status = 400
    throw err
  }

  const connectionId = body.connectionId || body.connection_id
  if (!connectionId) {
    const err = new Error('connectionId required')
    err.status = 400
    throw err
  }

  const status = String(body.status || 'succeeded').toLowerCase()
  const syncResult = {
    tablesSynced: body.tablesSynced ?? body.records ?? null,
    suggestedJoins: body.suggestedJoins ?? null,
    partner: source,
    externalSyncId: body.syncId || body.job_id || null,
  }

  const connectionConfig = {
    postSyncQueueMonk: body.queueMonk === true,
    postSyncMonkPackId: body.packId || 'ecommerce-v1',
    postSyncInferJoins: body.inferJoins !== false,
    postSyncWebhookUrl: body.forwardWebhookUrl || null,
  }

  const out = await runPostSyncAutomation(
    workspaceId,
    connectionId,
    syncResult,
    { userId, connectionConfig },
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'integrations.ingest_hook',
    resourceType: 'connection',
    resourceId: connectionId,
    summary: `${source} ingest hook — status=${status}`,
    meta: { partner: source, status, monkRunId: out.postSync?.monkRunId },
  })

  return {
    ok: true,
    partner: source,
    status,
    ...out,
    pattern: 'stack_on_ingest',
    note: 'Que post-ingest intelligence — does not replace Airbyte/Fivetran',
  }
}
