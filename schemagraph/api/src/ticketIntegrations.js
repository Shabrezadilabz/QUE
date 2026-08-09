/**
 * Phase 4 — Jira / ServiceNow / generic webhook ticket MVP.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'

function mapTicket(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    provider: r.provider,
    title: r.title,
    body: r.body || '',
    status: r.status,
    externalKey: r.external_key,
    externalUrl: r.external_url,
    meta: r.meta_json || {},
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listGovernanceTickets(workspaceId, { limit = 40 } = {}) {
  const { rows } = await query(
    `SELECT * FROM governance_tickets
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(100, Math.max(1, Number(limit) || 40))],
  )
  return rows.map(mapTicket)
}

/**
 * Create a ticket locally and optionally POST to configured webhook / Jira / ServiceNow.
 */
export async function createGovernanceTicket(
  workspaceId,
  body = {},
  userId = null,
) {
  const title = String(body.title || '').trim()
  if (!title) {
    const err = new Error('title required')
    err.status = 400
    throw err
  }
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const provider = ['jira', 'servicenow', 'webhook'].includes(body.provider)
    ? body.provider
    : settings.ticketProvider || 'webhook'

  const id = randomUUID()
  let status = 'queued'
  let externalKey = null
  let externalUrl = null
  const meta = {
    kind: body.kind || 'access_request',
    target: body.target || null,
  }

  const webhookUrl =
    body.webhookUrl ||
    settings.ticketWebhookUrl ||
    (provider === 'jira' ? settings.jiraWebhookUrl : '') ||
    (provider === 'servicenow' ? settings.serviceNowWebhookUrl : '') ||
    ''

  if (webhookUrl) {
    try {
      const payload = {
        event: 'que.governance.ticket',
        provider,
        workspaceId,
        ticketId: id,
        title,
        body: String(body.body || ''),
        meta,
        ts: new Date().toISOString(),
      }
      const res = await fetch(String(webhookUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Que-Governance/4.0',
          ...(settings.ticketWebhookAuthHeader
            ? { Authorization: String(settings.ticketWebhookAuthHeader) }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        status = 'submitted'
        const text = await res.text().catch(() => '')
        try {
          const json = JSON.parse(text)
          externalKey = json.key || json.sys_id || json.id || null
          externalUrl = json.url || json.self || null
        } catch {
          externalKey = res.headers.get('x-ticket-key') || null
        }
      } else {
        status = 'failed'
        meta.httpStatus = res.status
      }
    } catch (err) {
      status = 'failed'
      meta.error = String(err.message || err).slice(0, 300)
    }
  } else {
    status = 'local_only'
    meta.note = 'No ticket webhook configured — stored in Que only'
  }

  await query(
    `INSERT INTO governance_tickets (
       id, workspace_id, provider, title, body, status,
       external_key, external_url, meta_json, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [
      id,
      workspaceId,
      provider,
      title.slice(0, 300),
      String(body.body || '').slice(0, 8000),
      status,
      externalKey,
      externalUrl,
      JSON.stringify(meta),
      userId,
    ],
  )

  const tickets = await listGovernanceTickets(workspaceId, { limit: 5 })
  return tickets.find((t) => t.id === id)
}
