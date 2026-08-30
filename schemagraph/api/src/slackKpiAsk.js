/**
 * Phase 2 — Slack KPI Ask (exec surface).
 * Same cert rules as CEO / viewer chat: answerChat(..., { audience: 'ceo' }).
 *
 * Slash: POST /webhooks/slack/commands  (command /que)
 * Events: POST /webhooks/slack/events   (app_mention, message.im)
 */
import { query } from './db.js'
import { answerChat } from './chatEngine.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { appPublicUrl } from './joinActionTokens.js'
import { postSlackMessage, postSlackResponseUrl } from './slackPost.js'
import { listBiCharts } from './certifiedBi.js'

function parseTeamWorkspaceMap() {
  const raw = String(process.env.QUE_SLACK_TEAM_WORKSPACE_MAP || '').trim()
  /** @type {Map<string, string>} */
  const map = new Map()
  if (!raw) return map
  for (const part of raw.split(/[,;\n]+/)) {
    const [team, ws] = part.split(':').map((s) => s.trim())
    if (team && ws) map.set(team, ws)
  }
  return map
}

/**
 * Resolve Que workspace for a Slack team (and optional channel allowlist).
 * @param {{ teamId?: string, channelId?: string }} opts
 */
export async function resolveWorkspaceFromSlack(opts = {}) {
  const teamId = String(opts.teamId || '').trim()
  const channelId = String(opts.channelId || '').trim()

  const envMap = parseTeamWorkspaceMap()
  let workspaceId = teamId ? envMap.get(teamId) : null

  if (!workspaceId && teamId) {
    const singleTeam = String(process.env.QUE_SLACK_TEAM_ID || '').trim()
    const singleWs = String(process.env.QUE_SLACK_DEFAULT_WORKSPACE_ID || '').trim()
    if (singleTeam && singleWs && singleTeam === teamId) {
      workspaceId = singleWs
    }
  }

  if (!workspaceId && teamId) {
    const { rows } = await query(
      `SELECT id, settings_json
       FROM workspaces
       WHERE coalesce(settings_json->>'slackTeamId', '') = $1
       ORDER BY created_at ASC
       LIMIT 8`,
      [teamId],
    )
    for (const r of rows) {
      const s =
        r.settings_json && typeof r.settings_json === 'object'
          ? r.settings_json
          : {}
      if (s.slackKpiEnabled === false) continue
      workspaceId = r.id
      break
    }
  }

  if (!workspaceId) {
    const fallback = String(process.env.QUE_SLACK_DEFAULT_WORKSPACE_ID || '').trim()
    if (fallback) workspaceId = fallback
  }

  if (!workspaceId) {
    const err = new Error(
      'No Que workspace mapped for this Slack team. Set Settings → Slack Team ID or QUE_SLACK_TEAM_WORKSPACE_MAP.',
    )
    err.status = 404
    throw err
  }

  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  if (settings.slackKpiEnabled === false) {
    const err = new Error('Slack KPI Ask is disabled for this workspace')
    err.status = 403
    throw err
  }

  const allow = String(settings.slackKpiChannelAllowlist || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (allow.length && channelId && !allow.includes(channelId)) {
    const err = new Error(
      'This channel is not allowlisted for Que KPI Ask. Ask a Que admin.',
    )
    err.status = 403
    throw err
  }

  return { workspaceId, settings, workspaceName: ws?.name || 'Workspace' }
}

/**
 * @param {string} text
 */
function stripBotMention(text) {
  return String(text || '')
    .replace(/<@[A-Z0-9]+>/gi, '')
    .replace(/^\/que\b/i, '')
    .trim()
}

/**
 * @param {string} workspaceId
 * @param {string} question
 */
async function findChartLink(workspaceId, question) {
  try {
    const charts = await listBiCharts(workspaceId)
    const certified = (charts || []).filter((c) => c.certified)
    if (!certified.length) return null
    const q = question.toLowerCase()
    const hit =
      certified.find((c) =>
        String(c.title || c.name || '')
          .toLowerCase()
          .split(/\W+/)
          .some((t) => t.length > 3 && q.includes(t)),
      ) || certified[0]
    const id = hit.id || hit.chartId
    if (!id) return null
    return {
      title: hit.title || hit.name || 'Certified chart',
      url: `${appPublicUrl()}/bi?chart=${encodeURIComponent(id)}`,
    }
  } catch {
    return null
  }
}

/**
 * Run CEO/cert chat and build Slack blocks.
 * @param {{ workspaceId: string, question: string, slackUser?: string }} opts
 */
export async function runSlackKpiAsk(opts) {
  const question = stripBotMention(opts.question)
  if (!question || question.length < 2) {
    return {
      ok: false,
      text: 'Ask a KPI question after `/que` — e.g. `/que what was revenue last week?`',
    }
  }

  const helpish = /^(help|\?|commands)$/i.test(question)
  if (helpish) {
    return {
      ok: true,
      text:
        'Que KPI Ask — certified metrics only.\n' +
        '• `/que <question>` — ask from Slack\n' +
        '• `@Que <question>` — mention in a channel\n' +
        'Answers use the same cert rules as Que Ask (viewer / CEO).',
    }
  }

  const answer = await answerChat(
    opts.workspaceId,
    question,
    [],
    null,
    {
      audience: 'ceo',
      sessionId: `slack:${opts.slackUser || 'anon'}`,
      userId: null,
      modelId: undefined,
    },
  )

  const reply = String(answer?.reply || '').trim() || '_No answer._'
  const askUrl = `${appPublicUrl()}/chat`
  const chart = await findChartLink(opts.workspaceId, question)

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: reply.length > 2900 ? `${reply.slice(0, 2900)}…` : reply,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Que · certified KPIs only_${
            answer?.mode ? ` · \`${answer.mode}\`` : ''
          }`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Ask in Que', emoji: true },
          url: askUrl,
        },
        ...(chart
          ? [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: `Chart: ${String(chart.title).slice(0, 40)}`,
                  emoji: true,
                },
                url: chart.url,
              },
            ]
          : [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open BI', emoji: true },
                url: `${appPublicUrl()}/bi`,
              },
            ]),
      ],
    },
  ]

  return {
    ok: true,
    text: reply.slice(0, 500),
    blocks,
    mode: answer?.mode || null,
  }
}

/**
 * Handle slash command payload (after signature verify).
 * Responds fast via ack, then posts final answer to response_url.
 * @param {URLSearchParams|Record<string,string>} params
 * @param {(body: object) => void} ack — call once to ack Slack within 3s
 */
export async function handleSlackSlashCommand(params, ack) {
  const get = (k) =>
    typeof params.get === 'function'
      ? String(params.get(k) || '')
      : String(params[k] || '')

  const text = get('text')
  const teamId = get('team_id')
  const channelId = get('channel_id')
  const userId = get('user_id')
  const responseUrl = get('response_url')
  const command = get('command') || '/que'

  ack({
    response_type: 'ephemeral',
    text: 'Que is checking *certified* KPIs…',
  })

  try {
    const { workspaceId } = await resolveWorkspaceFromSlack({
      teamId,
      channelId,
    })
    const out = await runSlackKpiAsk({
      workspaceId,
      question: text || 'help',
      slackUser: userId,
    })
    const payload = {
      response_type: 'in_channel',
      replace_original: false,
      text: out.text,
      blocks: out.blocks,
    }
    if (responseUrl) {
      await postSlackResponseUrl(responseUrl, payload)
    }
    return { ok: true, command, workspaceId }
  } catch (err) {
    const msg = String(err.message || err)
    if (responseUrl) {
      await postSlackResponseUrl(responseUrl, {
        response_type: 'ephemeral',
        text: `Que KPI Ask failed: ${msg}`,
      })
    }
    return { ok: false, error: msg }
  }
}

/**
 * Handle Events API JSON (url_verification already handled by route).
 * @param {object} body
 */
export async function handleSlackEvent(body) {
  const event = body?.event
  if (!event || event.bot_id || event.subtype === 'bot_message') {
    return { ok: true, skipped: true }
  }

  const type = event.type
  if (type !== 'app_mention' && !(type === 'message' && event.channel_type === 'im')) {
    return { ok: true, skipped: true, reason: type }
  }

  const teamId = body.team_id || event.team
  const channelId = event.channel
  const text = event.text || ''
  const userId = event.user
  const threadTs = event.thread_ts || event.ts

  const { workspaceId } = await resolveWorkspaceFromSlack({
    teamId,
    channelId,
  })
  const out = await runSlackKpiAsk({
    workspaceId,
    question: text,
    slackUser: userId,
  })

  await postSlackMessage({
    channel: channelId,
    text: out.text,
    blocks: out.blocks,
    thread_ts: threadTs,
  })

  return { ok: true, workspaceId }
}
