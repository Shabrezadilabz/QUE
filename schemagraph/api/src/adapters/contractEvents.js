/**
 * Streaming-later adapters: emit contract/drift events to outbox + optional webhook.
 * Not a stream processor — just reliable handoff hooks for Kafka/Flink/etc. later.
 */
import { query } from '../db.js'
import { getWorkspaceSettings } from '../workspaceSettings.js'

/**
 * @param {string} workspaceId
 * @param {string} eventType e.g. contract.frozen | contract.exported | drift.detected
 * @param {object} payload
 */
export async function emitContractEvent(workspaceId, eventType, payload = {}) {
  const envelope = {
    eventType,
    workspaceId,
    emittedAt: new Date().toISOString(),
    brand: 'Que',
    policy: 'schema-only',
    ...payload,
  }

  let outboxId = null
  try {
    const { rows } = await query(
      `INSERT INTO contract_event_outbox (workspace_id, event_type, payload_json)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id`,
      [workspaceId, eventType, JSON.stringify(envelope)],
    )
    outboxId = rows[0]?.id || null
  } catch (err) {
    console.warn('[Que events] outbox insert skipped:', err.message || err)
    return { ok: false, reason: String(err.message || err) }
  }

  // Optional webhook delivery (fire-and-forget after outbox)
  try {
    const ws = await getWorkspaceSettings(workspaceId)
    const settings = ws?.settings || {}
    if (settings.emitContractEvents === false) {
      return { ok: true, outboxId, delivered: false, reason: 'emitContractEvents=false' }
    }
    const url = String(settings.contractWebhookUrl || '').trim()
    if (!url) {
      return { ok: true, outboxId, delivered: false, reason: 'no webhook configured' }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Que-Event': eventType,
      },
      body: JSON.stringify(envelope),
    })
    if (!res.ok) {
      await query(
        `UPDATE contract_event_outbox
         SET delivery_error = $2
         WHERE id = $1`,
        [outboxId, `HTTP ${res.status}`],
      )
      return { ok: true, outboxId, delivered: false, reason: `HTTP ${res.status}` }
    }
    await query(
      `UPDATE contract_event_outbox
       SET delivered = true, delivered_at = now(), delivery_error = NULL
       WHERE id = $1`,
      [outboxId],
    )
    return { ok: true, outboxId, delivered: true }
  } catch (err) {
    if (outboxId) {
      await query(
        `UPDATE contract_event_outbox SET delivery_error = $2 WHERE id = $1`,
        [outboxId, String(err.message || err).slice(0, 500)],
      ).catch(() => {})
    }
    return { ok: true, outboxId, delivered: false, reason: String(err.message || err) }
  }
}

export async function listOutbox(workspaceId, limit = 20) {
  const { rows } = await query(
    `SELECT id, event_type, payload_json, delivered, delivery_error, created_at, delivered_at
     FROM contract_event_outbox
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    payload: r.payload_json,
    delivered: r.delivered,
    deliveryError: r.delivery_error,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
  }))
}
