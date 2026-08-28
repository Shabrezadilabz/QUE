/**
 * S2.1 — Post-sync automation: top joins summary, optional Monk queue, webhook.
 */
import { listJoinReviews } from './joinReviews.js'
import { getWorkspaceSettings, patchWorkspaceSettingsJson } from './workspaceSettings.js'
import { startMonkModeRun } from './monkMode.js'

function compactJoin(item) {
  return {
    id: item.id,
    label: item.label || `${item.from?.table}.${item.from?.column} → ${item.to?.table}.${item.to?.column}`,
    confidence: item.confidence ?? null,
    fromTable: item.from?.table,
    toTable: item.to?.table,
    crossSource: Boolean(item.crossSource),
  }
}

async function firePostSyncWebhook(url, payload) {
  const target = String(url || '').trim()
  if (!target.startsWith('http')) return { sent: false, reason: 'invalid_url' }
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  return { sent: res.ok, status: res.status }
}

/**
 * @param {string} workspaceId
 * @param {string} connectionId
 * @param {object} syncResult
 * @param {{ userId?: string|null, connectionConfig?: object }} [opts]
 */
export async function runPostSyncAutomation(
  workspaceId,
  connectionId,
  syncResult = {},
  opts = {},
) {
  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  const connCfg = opts.connectionConfig || {}

  const inferEnabled =
    connCfg.postSyncInferJoins != null
      ? Boolean(connCfg.postSyncInferJoins)
      : settings.inferJoinsOnSync !== false

  const monkEnabled =
    connCfg.postSyncQueueMonk != null
      ? Boolean(connCfg.postSyncQueueMonk)
      : settings.postSyncQueueMonk === true

  const inbox = await listJoinReviews(workspaceId, {
    status: 'suggested',
    limit: 5,
  })
  const topJoins = (inbox.items || []).slice(0, 5).map(compactJoin)

  let monkRun = null
  if (monkEnabled && inferEnabled) {
    try {
      monkRun = await startMonkModeRun(workspaceId, {
        packId:
          connCfg.postSyncMonkPackId ||
          settings.postSyncMonkPackId ||
          'ecommerce-v1',
        userId: opts.userId ?? null,
        async: true,
      })
    } catch (err) {
      monkRun = { error: String(err.message || err).slice(0, 240) }
    }
  }

  let webhook = { sent: false }
  const webhookUrl =
    String(connCfg.postSyncWebhookUrl || '').trim() ||
    String(settings.postSyncWebhookUrl || '').trim()
  if (webhookUrl) {
    try {
      webhook = await firePostSyncWebhook(webhookUrl, {
        event: 'que.connection.sync_complete',
        workspaceId,
        connectionId,
        at: new Date().toISOString(),
        tablesSynced: syncResult.tablesSynced ?? null,
        suggestedJoins: syncResult.suggestedJoins ?? topJoins.length,
        topJoins,
        monkRunId: monkRun?.id ?? null,
      })
    } catch (err) {
      webhook = { sent: false, error: String(err.message || err).slice(0, 200) }
    }
  }

  try {
    await patchWorkspaceSettingsJson(workspaceId, {
      lastPostSync: {
        connectionId,
        at: new Date().toISOString(),
        suggestedJoins: syncResult.suggestedJoins ?? topJoins.length,
        topJoins,
        monkQueued: Boolean(monkRun?.id),
        monkRunId: monkRun?.id ?? null,
      },
    })
  } catch {
    /* banner hint optional */
  }

  return {
    postSync: {
      inferJoins: inferEnabled,
      monkQueued: Boolean(monkRun?.id),
      monkRunId: monkRun?.id ?? null,
      monkError: monkRun?.error ?? null,
      topJoins,
      webhook,
    },
  }
}
