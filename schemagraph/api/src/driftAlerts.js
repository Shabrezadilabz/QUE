/**
 * Wave 2.3 — Drift alerts (Slack webhook / generic webhook / email list).
 * Soft delivery: never fails the sync. Tracks notified_at on the event.
 */
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { recordAuditEvent } from './auditLog.js'

function isSlackWebhook(url) {
  return /hooks\.slack\.com/i.test(url)
}

function formatSlackPayload({ workspaceName, connectionId, drift, eventId }) {
  const severity = String(drift.severity || 'info').toUpperCase()
  const emoji =
    severity === 'HIGH' ? ':rotating_light:' : severity === 'WARN' ? ':warning:' : ':information_source:'
  const text = `${emoji} Que drift · ${severity}\n*${drift.summary || 'Schema drift'}*\nWorkspace: ${workspaceName}\nConnection: ${connectionId || '—'}\nEvent: ${eventId}`
  return {
    text,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Que drift · ${severity}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${drift.summary || 'Schema drift detected'}*\nWorkspace \`${workspaceName}\` · connection \`${connectionId || '—'}\``,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Export may be blocked until acknowledged · event \`${eventId}\` · schema-only (no raw rows)`,
          },
        ],
      },
    ],
  }
}

function formatGenericPayload({
  workspaceId,
  workspaceName,
  connectionId,
  drift,
  eventId,
  emails,
}) {
  return {
    eventType: 'drift.alert',
    brand: 'Que',
    policy: 'schema-only',
    workspaceId,
    workspaceName,
    connectionId,
    eventId,
    severity: drift.severity,
    summary: drift.summary,
    code: drift.code || null,
    emails,
    drift,
    emittedAt: new Date().toISOString(),
    claim:
      'Que drift alert: schema metadata change only — no warehouse row payload.',
  }
}

/**
 * Best-effort email via optional QUE_DRIFT_EMAIL_WEBHOOK (Zapier/Make/SMTP bridge).
 * Body: { to: string[], subject, text, html? }
 */
async function deliverEmails({ emails, subject, text, html }) {
  const url = String(process.env.QUE_DRIFT_EMAIL_WEBHOOK || '').trim()
  if (!url || !emails.length) {
    if (emails.length) {
      console.info(
        '[Que drift alert] emails (no QUE_DRIFT_EMAIL_WEBHOOK):',
        emails.join(', '),
        '·',
        subject,
      )
    }
    return { ok: true, delivered: false, reason: emails.length ? 'no_email_webhook' : 'no_emails' }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Que-Event': 'drift.email' },
    body: JSON.stringify({ to: emails, subject, text, html }),
  })
  if (!res.ok) {
    return { ok: false, delivered: false, reason: `email_webhook_HTTP_${res.status}` }
  }
  return { ok: true, delivered: true, reason: 'email_webhook' }
}

/**
 * @param {object} input
 * @param {string} input.workspaceId
 * @param {string} input.eventId
 * @param {string} [input.connectionId]
 * @param {object} input.drift
 * @param {boolean} [input.force]  test alerts ignore severity gate / re-notify
 */
export async function notifyDriftAlert({
  workspaceId,
  eventId,
  connectionId = null,
  drift,
  force = false,
}) {
  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  const workspaceName = ws?.workspace?.name || workspaceId

  if (!force && settings.driftAlertsEnabled === false) {
    return markNotify(eventId, 'skipped:disabled')
  }

  const severity = String(drift?.severity || '').toLowerCase()
  const onlyHigh = settings.driftAlertOnHigh !== false
  if (!force && onlyHigh && severity !== 'high') {
    return markNotify(eventId, 'skipped:not_high')
  }

  if (!force) {
    const { rows } = await query(
      `SELECT notified_at FROM workspace_drift_events
       WHERE id = $1 AND workspace_id = $2`,
      [eventId, workspaceId],
    )
    if (rows[0]?.notified_at) {
      return { ok: true, delivered: false, reason: 'already_notified' }
    }
  }

  const webhookUrl = String(
    settings.driftAlertWebhookUrl || settings.contractWebhookUrl || '',
  ).trim()
  const emails = String(settings.driftAlertEmails || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'))

  if (!webhookUrl && !emails.length && !String(process.env.QUE_DRIFT_EMAIL_WEBHOOK || '').trim()) {
    return markNotify(eventId, 'skipped:no_channel')
  }

  const channels = []
  const errors = []

  if (webhookUrl) {
    try {
      const body = isSlackWebhook(webhookUrl)
        ? formatSlackPayload({
            workspaceName,
            connectionId,
            drift: { ...drift, code: drift.code },
            eventId,
          })
        : formatGenericPayload({
            workspaceId,
            workspaceName,
            connectionId,
            drift,
            eventId,
            emails,
          })
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Que-Event': 'drift.alert',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        errors.push(`webhook_HTTP_${res.status}`)
      } else {
        channels.push(isSlackWebhook(webhookUrl) ? 'slack' : 'webhook')
      }
    } catch (err) {
      errors.push(`webhook:${String(err.message || err).slice(0, 120)}`)
    }
  }

  const subject = `[Que] Drift ${String(drift.severity || '').toUpperCase()}: ${drift.summary || 'schema change'}`
  const text = [
    `Que drift alert (${drift.severity || 'info'})`,
    drift.summary || '',
    `Workspace: ${workspaceName}`,
    `Connection: ${connectionId || '—'}`,
    `Event: ${eventId}`,
    '',
    'Acknowledge in Que → Jobs Deploy or Settings → Drift alerts.',
    'Schema-only — no raw warehouse rows in this alert.',
  ].join('\n')

  try {
    const emailResult = await deliverEmails({ emails, subject, text })
    if (emailResult.delivered) channels.push('email')
    else if (emailResult.reason && emailResult.reason !== 'no_emails') {
      if (emails.length) channels.push('email_logged')
    }
  } catch (err) {
    errors.push(`email:${String(err.message || err).slice(0, 120)}`)
  }

  const status =
    channels.length > 0
      ? `delivered:${channels.join('+')}${errors.length ? `|err:${errors.join(',')}` : ''}`
      : `failed:${errors.join(',') || 'unknown'}`

  await markNotify(eventId, status)

  void recordAuditEvent({
    workspaceId,
    action: 'drift.alert',
    resourceType: 'drift_event',
    resourceId: eventId,
    summary: `Drift alert ${status}`,
    meta: {
      severity: drift.severity,
      channels,
      errors,
      force: Boolean(force),
    },
  })

  return {
    ok: channels.length > 0,
    delivered: channels.length > 0,
    channels,
    errors,
    status,
  }
}

async function markNotify(eventId, status) {
  try {
    await query(
      `UPDATE workspace_drift_events
       SET notified_at = COALESCE(notified_at, now()),
           notify_status = $2
       WHERE id = $1`,
      [eventId, String(status).slice(0, 240)],
    )
  } catch (err) {
    console.warn('[Que drift alert] mark notify skipped:', err.message || err)
  }
  return { ok: true, delivered: String(status).startsWith('delivered'), reason: status }
}

/**
 * Insert high/warn drift then notify (used by tests + optional manual path).
 */
export async function createDriftEventAndAlert({
  workspaceId,
  connectionId = null,
  severity = 'high',
  code = 'manual_test',
  summary,
  detail = {},
  forceNotify = false,
}) {
  const { rows } = await query(
    `INSERT INTO workspace_drift_events (
       workspace_id, connection_id, severity, code, summary, detail_json
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, severity, code, summary, created_at`,
    [
      workspaceId,
      connectionId,
      severity,
      code,
      summary,
      JSON.stringify(detail),
    ],
  )
  const row = rows[0]
  const notify = await notifyDriftAlert({
    workspaceId,
    eventId: row.id,
    connectionId,
    drift: {
      severity: row.severity,
      code: row.code,
      summary: row.summary,
      ...detail,
    },
    force: forceNotify || severity === 'high',
  })
  return { event: row, notify }
}
