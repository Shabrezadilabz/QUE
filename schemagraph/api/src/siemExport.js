/**
 * Phase 5 — SIEM export (JSONL + optional webhook push).
 */
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'

export async function getSiemConfig(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM siem_export_state WHERE workspace_id = $1`,
    [workspaceId],
  )
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const row = rows[0]
  return {
    enabled: row ? Boolean(row.enabled) : Boolean(settings.siemExportEnabled),
    webhookUrl: row?.webhook_url || settings.siemWebhookUrl || '',
    lastExportedAt: row?.last_exported_at || null,
    lastEventId: row?.last_event_id || null,
  }
}

export async function updateSiemConfig(workspaceId, patch = {}) {
  const cur = await getSiemConfig(workspaceId)
  const enabled =
    patch.enabled != null ? Boolean(patch.enabled) : cur.enabled
  const webhookUrl =
    patch.webhookUrl != null
      ? String(patch.webhookUrl).trim().slice(0, 500)
      : cur.webhookUrl
  await query(
    `INSERT INTO siem_export_state (workspace_id, enabled, webhook_url, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (workspace_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       webhook_url = EXCLUDED.webhook_url,
       updated_at = now()`,
    [workspaceId, enabled, webhookUrl || null],
  )
  return getSiemConfig(workspaceId)
}

/**
 * Export audit events as JSONL lines since cursor.
 */
export async function exportSiemEvents(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000)
  const since = opts.since || null
  const params = [workspaceId]
  let where = 'e.workspace_id = $1'
  if (since) {
    params.push(since)
    where += ` AND e.created_at > $${params.length}`
  }
  params.push(limit)
  const { rows } = await query(
    `SELECT e.id, e.action, e.resource_type, e.resource_id, e.summary,
            e.meta_json, e.created_at, e.actor_user_id, u.email AS actor_email
     FROM workspace_audit_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE ${where}
     ORDER BY e.created_at ASC
     LIMIT $${params.length}`,
    params,
  )

  const events = rows.map((r) => ({
    ts: r.created_at,
    workspaceId,
    eventId: r.id,
    action: r.action,
    actor: r.actor_email || r.actor_user_id,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    summary: r.summary,
    meta: r.meta_json || {},
  }))

  const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '')

  if (events.length) {
    const last = events[events.length - 1]
    await query(
      `INSERT INTO siem_export_state (workspace_id, last_exported_at, last_event_id, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         last_exported_at = EXCLUDED.last_exported_at,
         last_event_id = EXCLUDED.last_event_id,
         updated_at = now()`,
      [workspaceId, last.ts, last.eventId],
    )
  }

  return { count: events.length, events, jsonl }
}

/**
 * Push pending events to SIEM webhook (best-effort).
 */
export async function pushSiemWebhook(workspaceId) {
  const cfg = await getSiemConfig(workspaceId)
  if (!cfg.enabled || !cfg.webhookUrl) {
    const err = new Error('SIEM webhook not enabled/configured')
    err.status = 400
    throw err
  }
  const pack = await exportSiemEvents(workspaceId, {
    since: cfg.lastExportedAt,
    limit: 200,
  })
  if (!pack.count) {
    return { pushed: 0, ok: true }
  }
  const res = await fetch(cfg.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-ndjson',
      'User-Agent': 'Que-SIEM/5.0',
    },
    body: pack.jsonl,
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const err = new Error(`SIEM webhook HTTP ${res.status}`)
    err.status = 502
    throw err
  }
  return { pushed: pack.count, ok: true }
}
