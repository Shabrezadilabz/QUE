/**
 * Unified Que Agent — replaces separate Stitch Agent chat path.
 * CEO + Engineer chat and cross-page Genie share this runtime.
 */
import { buildSchemaContextPack } from './schemaContext.js'
import {
  parseAgentIntent,
  createAgentSession,
  advanceAgentCheckpoint,
  getAgentSession,
} from './agentSessions.js'
import { getWorkspaceSettings } from './workspaceSettings.js'

const ACTION_RE =
  /\b(create|build|make|draft|edit|update|change|materialize|scaffold|join|stitch|transform|clean|fix|validate|combine|merge|add|rename)\b/i
const TARGET_RE =
  /\b(job|jobs|table|tables|dashboard|report|bi|chart|visual|transform|join|materialize|notebook|sql)\b/i

/** Detect when chat/genie should run the Que Agent instead of plain Q&A. */
export function detectQueAgentIntent(message, pageContext = {}) {
  const t = String(message || '').trim()
  if (!t) return null
  if (/^\/(help|list|describe|sql|job|privacy)\b/i.test(t)) return null

  const g = t.toLowerCase()
  const slash =
    /^\/(agent|que|genie)\b/i.test(t) ||
    /^\/bi\b/i.test(t) ||
    /\bstart\s+(the\s+)?(que\s+)?agent\b/i.test(g)

  const biAsk =
    /\b(build|create|scaffold|make)\b/i.test(g) &&
    /\b(bi|report|dashboard|chart|visual)\b/i.test(g)

  const jobAsk =
    ACTION_RE.test(g) &&
    (TARGET_RE.test(g) ||
      /\bcustomer.?360\b/i.test(g) ||
      /\bcombine\b.*\b(table|column)/i.test(g))

  const materializeAsk =
    /\b(materialize|create\s+table|new\s+table|ctas)\b/i.test(g)

  const editAsk =
    /\b(edit|update|change|modify|rename)\b.*\bjob\b/i.test(g) ||
    (pageContext?.jobId && ACTION_RE.test(g))

  if (!slash && !biAsk && !jobAsk && !materializeAsk && !editAsk) {
    return null
  }

  const autoExecute =
    slash ||
    /\b(create|build|make|draft|materialize|scaffold|edit|update|now|go ahead|do it|run it)\b/i.test(
      g,
    )

  return {
    goal: t
      .replace(/^\/(agent|que|genie|bi)\s*/i, '')
      .trim() || t,
    autoExecute,
    pageContext: pageContext || {},
    kind: biAsk
      ? 'bi'
      : materializeAsk
        ? 'materialize'
        : editAsk
          ? 'edit_job'
          : 'general',
  }
}

function formatCeoReply(session) {
  const r = session.result || {}
  const parts = []
  if (session.status === 'completed') {
    parts.push('Done — your request is complete.')
  } else if (session.status === 'awaiting_checkpoint') {
    parts.push('Plan ready — approve the checkpoint to continue.')
  } else {
    parts.push(`Status: ${session.status}.`)
  }
  if (r.jobId) parts.push(`Job created — open Jobs to review or run.`)
  if (r.job?.id && !r.jobId) parts.push(`Job updated.`)
  if (r.materialization?.id || r.materializationId) {
    parts.push('Table/view materialized in your warehouse.')
  }
  if (r.biReport?.reportId) {
    parts.push(`Report built (${r.biReport.charts?.length || 0} visuals) — open Report Studio.`)
  }
  if (r.infer?.created) {
    parts.push(`${r.infer.created} join suggestion(s) — review in Join Review if needed.`)
  }
  const failed = (session.plan?.steps || []).find((s) => s.status === 'failed')
  if (failed?.error) parts.push(`Note: ${failed.error}`)
  return parts.join(' ')
}

function formatEngineerReply(session) {
  const tools = (session.plan?.tools || []).map((t) => t.id).join(' → ')
  const open = session.checkpoints?.find((c) => c.status === 'open')
  let reply = `**Que Agent** · ${session.status}`
  if (tools) reply += `\nTools: ${tools}`
  if (open) reply += `\nCheckpoint: ${open.type} — ${open.message || ''}`
  if (session.result?.jobId) reply += `\nJob: \`${session.result.jobId}\``
  return reply
}

/**
 * Run Que Agent from chat or genie. Returns chat-shaped payload or null.
 */
export async function maybeHandleQueAgent(
  workspaceId,
  message,
  opts = {},
) {
  const intent = detectQueAgentIntent(message, opts.pageContext)
  if (!intent) return null

  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  if (settings.enableQueAgent === false && settings.enableStitchAgent !== true) {
    return {
      reply:
        'Que Agent is disabled for this workspace. An admin can enable it under Settings → AI & Policy.',
      mode: 'que-agent-disabled',
      agentSession: null,
      citations: [],
      jobDraft: null,
    }
  }

  const audience = opts.audience === 'engineer' ? 'engineer' : 'ceo'
  const body = {
    goal: intent.goal,
    title: intent.goal.slice(0, 80),
    autoExecute: intent.autoExecute,
    pageContext: intent.pageContext,
    tableNames: intent.pageContext?.selectedTables,
    jobId: intent.pageContext?.jobId,
    jobTitle: intent.pageContext?.jobTitle,
    prompt: intent.goal,
  }

  let session = await createAgentSession(workspaceId, opts.userId ?? null, body)

  if (intent.autoExecute && session.checkpoints?.some((c) => c.status === 'open')) {
    session = await advanceAgentCheckpoint(
      workspaceId,
      session.id,
      opts.userId ?? null,
      {
        action: 'approve_plan',
        ...body,
      },
    )
    // Auto-continue past promote if no infer step or auto-promote cleared it
    if (
      session.checkpoints?.some(
        (c) => c.status === 'open' && c.type === 'promote_joins',
      )
    ) {
      const auto = session.result?.infer?.autoPromote
      if (auto?.enabled && auto?.promoted > 0) {
        const { continueAgentAfterPromote } = await import('./agentSessions.js')
        session = await continueAgentAfterPromote(
          workspaceId,
          session.id,
          opts.userId ?? null,
          body,
        )
      }
    }
  }

  const pack = await buildSchemaContextPack(workspaceId)
  const reply =
    audience === 'ceo'
      ? formatCeoReply(session)
      : formatEngineerReply(session)

  return {
    reply,
    mode: 'que-agent',
    agentSession: session,
    citations: [],
    jobDraft: session.result?.job
      ? {
          title: session.result.job.title,
          tables: session.result.job.tables,
          sqlText: session.result.job.sqlText,
        }
      : null,
    biReport: session.result?.biReport || null,
    materialization: session.result?.materialization || null,
    contextStats: pack.stats,
    referencedTables: [],
    retrievedChunks: [],
    model: null,
    audience,
  }
}

/** Direct genie action (same runtime, explicit endpoint). */
export async function runQueAgentAct(workspaceId, userId, body = {}) {
  const message = String(body.message || body.goal || '').trim()
  if (!message) {
    const err = new Error('message required')
    err.status = 400
    throw err
  }
  const out = await maybeHandleQueAgent(workspaceId, message, {
    userId,
    audience: body.audience === 'ceo' ? 'ceo' : 'engineer',
    pageContext: body.pageContext || {},
  })
  if (!out) {
    const err = new Error('No agent action detected — try "create job", "build BI", or "materialize table"')
    err.status = 400
    throw err
  }
  return out
}
