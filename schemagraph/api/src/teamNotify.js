/**
 * Phase 2 — Slack/Teams (or generic) notifications for join review + digests.
 */
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { recordAuditEvent } from './auditLog.js'

function isSlackWebhook(url) {
  return /hooks\.slack\.com/i.test(String(url || ''))
}

async function postWebhook(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`webhook ${res.status}: ${text.slice(0, 200)}`)
  }
}

function slackText(text) {
  return { text }
}

/**
 * Notify when a join is suggested (infer) or needs review.
 */
export async function notifyJoinReviewPending(workspaceId, meta = {}) {
  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings || {}
  if (settings.joinReviewNotifyEnabled === false) return { skipped: true }
  const url = String(
    settings.joinReviewWebhookUrl || settings.driftAlertWebhookUrl || '',
  ).trim()
  if (!url) return { skipped: 'no_webhook' }

  const wsName = settingsPayload?.workspace?.name || workspaceId
  const count = Number(meta.created || meta.pending || 0)
  const text = `Que · Join Review\n*${count} join suggestion(s)* need Promote in workspace *${wsName}*\nOpen Join Review to approve — Que never auto-accepts.`

  try {
    await postWebhook(
      url,
      isSlackWebhook(url)
        ? {
            text,
            blocks: [
              {
                type: 'header',
                text: { type: 'plain_text', text: 'Que · Join Review', emoji: true },
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${count}* suggested join(s) waiting for human Promote in \`${wsName}\`.`,
                },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: 'HITL required · schema-only · /joins',
                  },
                ],
              },
            ],
          }
        : {
            eventType: 'join.review_pending',
            workspaceId,
            workspaceName: wsName,
            created: count,
            emittedAt: new Date().toISOString(),
          },
    )
    void recordAuditEvent({
      workspaceId,
      action: 'notify.join_review',
      summary: `Join review notify (${count})`,
      meta: { count },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}

/**
 * Notify when someone promotes a join (optional team awareness).
 */
export async function notifyJoinPromoted(workspaceId, meta = {}) {
  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings || {}
  if (settings.joinReviewNotifyEnabled === false) return { skipped: true }
  const url = String(
    settings.joinReviewWebhookUrl || settings.driftAlertWebhookUrl || '',
  ).trim()
  if (!url || settings.joinPromoteNotify !== true) return { skipped: true }

  const wsName = settingsPayload?.workspace?.name || workspaceId
  const text = `Que · Join promoted in *${wsName}*\n${meta.summary || 'A suggested join was accepted.'}`
  try {
    await postWebhook(url, isSlackWebhook(url) ? slackText(text) : {
      eventType: 'join.promoted',
      workspaceId,
      workspaceName: wsName,
      ...meta,
      emittedAt: new Date().toISOString(),
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}

/**
 * Drift digest — summarize open high/warn events since last digest.
 */
export async function sendDriftDigest(workspaceId, { force = false } = {}) {
  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings || {}
  if (!force && settings.driftDigestEnabled === false) {
    return { skipped: 'disabled' }
  }
  const url = String(
    settings.driftDigestWebhookUrl ||
      settings.driftAlertWebhookUrl ||
      settings.joinReviewWebhookUrl ||
      '',
  ).trim()
  if (!url) return { skipped: 'no_webhook' }

  const { rows: stateRows } = await query(
    `SELECT last_drift_digest_at FROM workspace_digest_state WHERE workspace_id = $1`,
    [workspaceId],
  )
  const since =
    stateRows[0]?.last_drift_digest_at ||
    new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  let events = []
  try {
    const { rows } = await query(
      `SELECT id, severity, summary, created_at, acknowledged
       FROM workspace_drift_events
       WHERE workspace_id = $1
         AND created_at >= $2::timestamptz
         AND lower(coalesce(severity,'')) IN ('high','warn')
       ORDER BY created_at DESC
       LIMIT 40`,
      [workspaceId, since],
    )
    events = rows
  } catch {
    events = []
  }

  const open = events.filter((e) => !e.acknowledged)
  const wsName = settingsPayload?.workspace?.name || workspaceId
  const lines = open
    .slice(0, 12)
    .map(
      (e) =>
        `• [${String(e.severity || '').toUpperCase()}] ${e.summary || e.id}`,
    )
    .join('\n')

  const text = `Que · Drift digest · ${wsName}\nOpen alerts since last digest: *${open.length}*\n${lines || '_None_'}`

  try {
    await postWebhook(
      url,
      isSlackWebhook(url)
        ? {
            text,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `Que drift digest · ${wsName}`,
                  emoji: true,
                },
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${open.length}* open high/warn alert(s)\n${lines || '_None_'}`,
                },
              },
            ],
          }
        : {
            eventType: 'drift.digest',
            workspaceId,
            workspaceName: wsName,
            openCount: open.length,
            events: open,
            emittedAt: new Date().toISOString(),
          },
    )

    await query(
      `INSERT INTO workspace_digest_state (workspace_id, last_drift_digest_at, updated_at)
       VALUES ($1, now(), now())
       ON CONFLICT (workspace_id) DO UPDATE
       SET last_drift_digest_at = now(), updated_at = now()`,
      [workspaceId],
    )

    void recordAuditEvent({
      workspaceId,
      action: 'notify.drift_digest',
      summary: `Drift digest (${open.length} open)`,
      meta: { openCount: open.length },
    })
    return { ok: true, openCount: open.length }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}

/** Role helpers for propose vs promote */
export function roleMeetsMin(role, minRole, ROLE_RANK) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 99)
}
