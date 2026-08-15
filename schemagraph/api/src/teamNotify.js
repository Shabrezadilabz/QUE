/**
 * Phase 2 / CEO P1 — Slack/Teams notifications for join review + digests.
 * Slack Block Kit includes Approve / Reject action links (signed tokens).
 */
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { recordAuditEvent } from './auditLog.js'
import {
  appPublicUrl,
  joinActionLink,
} from './joinActionTokens.js'

function isSlackWebhook(url) {
  return /hooks\.slack\.com/i.test(String(url || ''))
}

function isTeamsWebhook(url) {
  return /webhook\.office\.com|office365\.com|outlook\.office/i.test(
    String(url || ''),
  )
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
 * @param {object} meta
 * @param {number} [meta.created]
 * @param {number} [meta.pending]
 * @param {{ id: string, label?: string }[]} [meta.joins]
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
  const joins = Array.isArray(meta.joins) ? meta.joins.slice(0, 3) : []
  const primary = joins[0]
  const joinsUrl = `${appPublicUrl()}/joins`
  const outcomeUrl = `${appPublicUrl()}/outcome`
  const text = `Que · Join Review\n*${count} join suggestion(s)* need Promote in workspace *${wsName}*\nOpen Join Review — or Approve/Reject from chat (Yellow/HITL). Schema-first; no lake custody.`

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Que · Approve this stitch', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${count}* suggested join(s) in \`${wsName}\`${
          primary?.label ? `\n• ${primary.label}` : ''
        }`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'HITL · schema-first · Green only auto-Promotes when eval gate allows',
        },
      ],
    },
  ]

  if (primary?.id) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve (Promote)', emoji: true },
          style: 'primary',
          url: joinActionLink('promote', workspaceId, primary.id),
          action_id: 'que_promote',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject', emoji: true },
          style: 'danger',
          url: joinActionLink('reject', workspaceId, primary.id),
          action_id: 'que_reject',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Joins', emoji: true },
          url: joinsUrl,
          action_id: 'que_open_joins',
        },
      ],
    })
  } else {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Join Review', emoji: true },
          url: joinsUrl,
          action_id: 'que_open_joins',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Outcome mode', emoji: true },
          url: outcomeUrl,
          action_id: 'que_outcome',
        },
      ],
    })
  }

  const teamsCard = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '7BD0FF',
    summary: 'Que · Approve this stitch',
    sections: [
      {
        activityTitle: 'Que · Join Review',
        text: `**${count}** suggested join(s) in **${wsName}**${
          primary?.label ? `<br/>${primary.label}` : ''
        }<br/><i>Schema-first · HITL Promote</i>`,
      },
    ],
    potentialAction: primary?.id
      ? [
          {
            '@type': 'OpenUri',
            name: 'Approve (Promote)',
            targets: [
              {
                os: 'default',
                uri: joinActionLink('promote', workspaceId, primary.id),
              },
            ],
          },
          {
            '@type': 'OpenUri',
            name: 'Reject',
            targets: [
              {
                os: 'default',
                uri: joinActionLink('reject', workspaceId, primary.id),
              },
            ],
          },
          {
            '@type': 'OpenUri',
            name: 'Open Joins',
            targets: [{ os: 'default', uri: joinsUrl }],
          },
        ]
      : [
          {
            '@type': 'OpenUri',
            name: 'Open Join Review',
            targets: [{ os: 'default', uri: joinsUrl }],
          },
        ],
  }

  try {
    let payload
    if (isSlackWebhook(url)) {
      payload = { text, blocks }
    } else if (isTeamsWebhook(url)) {
      payload = teamsCard
    } else {
      payload = {
        eventType: 'join.review_pending',
        workspaceId,
        workspaceName: wsName,
        created: count,
        joins,
        approveUrl: primary?.id
          ? joinActionLink('promote', workspaceId, primary.id)
          : null,
        rejectUrl: primary?.id
          ? joinActionLink('reject', workspaceId, primary.id)
          : null,
        joinsUrl,
        emittedAt: new Date().toISOString(),
      }
    }
    await postWebhook(url, payload)
    void recordAuditEvent({
      workspaceId,
      action: 'notify.join_review',
      summary: `Join review notify (${count})`,
      meta: { count, withActions: Boolean(primary?.id) },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}

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

export function roleMeetsMin(role, minRole, ROLE_RANK) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 99)
}
