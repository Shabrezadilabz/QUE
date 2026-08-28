/**
 * S7.1 — Golden eval failure alerts (Slack/webhook + steward ticket).
 */
import { getWorkspaceSettings } from './workspaceSettings.js'
import { createStewardInboxIssue } from './stewardInbox.js'
import { recordAuditEvent } from './auditLog.js'

function isSlackWebhook(url) {
  return /hooks\.slack\.com/i.test(String(url || ''))
}

function formatSlackPayload({ workspaceName, recall, minRecall, pairCount }) {
  const pct = (recall * 100).toFixed(1)
  const minPct = (minRecall * 100).toFixed(1)
  return {
    text: `:warning: Que golden eval failed · ${pct}% recall (min ${minPct}%)`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Que · Golden eval failed',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Recall ${pct}%* is below threshold *${minPct}%* on workspace \`${workspaceName}\`.\n${pairCount} golden pair(s) evaluated — review joins in Steward.`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Open Que → Steward to promote joins and re-run golden eval.',
          },
        ],
      },
    ],
  }
}

/**
 * On golden eval fail: steward inbox ticket + optional Slack/webhook alert.
 */
export async function handleGoldenEvalFailure(
  workspaceId,
  { report, recall, minRecall, userId = null } = {},
) {
  const ws = await getWorkspaceSettings(workspaceId)
  const workspaceName = ws?.workspace?.name || workspaceId
  const pairCount = report?.goldenPairs ?? report?.details?.length ?? 0
  const pct = Number(recall || 0)
  const min = Number(minRecall || 0.35)

  let stewardIssue = null
  try {
    stewardIssue = await createStewardInboxIssue(workspaceId, {
      issueKind: 'golden_eval',
      severity: pct + 0.1 < min ? 'high' : 'medium',
      title: `Golden eval recall ${(pct * 100).toFixed(1)}% below ${(min * 100).toFixed(1)}%`,
      description:
        `${pairCount} golden pair(s) evaluated. Promote missing joins, then re-run golden eval on /eval or wait for the scheduled tick.`,
      proposal: {
        recall: pct,
        minRecall: min,
        hits: report?.hits ?? null,
        promotedHits: report?.promotedHits ?? null,
      },
      userId,
    })
  } catch (err) {
    console.warn('[Que] golden eval steward ticket:', err.message || err)
  }

  const settings = ws?.settings || {}
  const webhookUrl = String(
    settings.driftAlertWebhookUrl ||
      settings.contractWebhookUrl ||
      settings.teamNotifyWebhookUrl ||
      '',
  ).trim()

  let notify = { delivered: false, reason: 'no_webhook' }
  if (webhookUrl) {
    try {
      const body = isSlackWebhook(webhookUrl)
        ? formatSlackPayload({
            workspaceName,
            recall: pct,
            minRecall: min,
            pairCount,
          })
        : {
            eventType: 'golden_eval.fail',
            brand: 'Que',
            workspaceId,
            workspaceName,
            recall: pct,
            minRecall: min,
            pairCount,
            stewardIssueId: stewardIssue?.id || null,
            emittedAt: new Date().toISOString(),
          }
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Que-Event': 'golden_eval.fail',
        },
        body: JSON.stringify(body),
      })
      notify = {
        delivered: res.ok,
        reason: res.ok ? 'webhook' : `HTTP_${res.status}`,
      }
    } catch (err) {
      notify = { delivered: false, reason: String(err.message || err).slice(0, 120) }
    }
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'golden_eval.fail',
    resourceType: 'workspace',
    resourceId: workspaceId,
    summary: `Golden eval failed — recall ${(pct * 100).toFixed(1)}% < ${(min * 100).toFixed(1)}%`,
    meta: {
      recall: pct,
      minRecall: min,
      pairCount,
      stewardIssueId: stewardIssue?.id || null,
      notify,
    },
  })

  return { stewardIssue, notify, passed: false }
}
