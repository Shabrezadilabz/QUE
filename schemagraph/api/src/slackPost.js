/**
 * Slack chat.postMessage when SLACK_BOT_TOKEN is set (interactive Block Kit).
 * Incoming webhooks alone cannot use value= buttons — only URL buttons.
 */

export function slackBotToken() {
  return String(process.env.SLACK_BOT_TOKEN || '').trim()
}

/**
 * @param {{ channel: string, text: string, blocks?: object[] }} opts
 */
export async function postSlackMessage(opts) {
  const token = slackBotToken()
  if (!token) {
    const err = new Error('SLACK_BOT_TOKEN not configured')
    err.status = 503
    throw err
  }
  const channel = String(opts.channel || '').trim()
  if (!channel) {
    const err = new Error('Slack channel required')
    err.status = 400
    throw err
  }
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel,
      text: opts.text,
      blocks: opts.blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    throw new Error(
      `Slack chat.postMessage: ${body.error || res.status || 'failed'}`,
    )
  }
  return body
}

/**
 * Update original interactive message via Slack response_url.
 */
export async function postSlackResponseUrl(responseUrl, payload) {
  if (!responseUrl) return { skipped: true }
  const res = await fetch(String(responseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: `${res.status}: ${text.slice(0, 120)}` }
  }
  return { ok: true }
}
