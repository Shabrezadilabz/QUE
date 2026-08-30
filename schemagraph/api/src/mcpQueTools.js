/**
 * Phase 3 — Que MCP tools (certified KPI surface for Cursor / Claude / Copilot).
 * Always audience=ceo cert rules — same as Ask (viewer) and Slack /que.
 */
import { listMetrics } from './metricDefinitions.js'
import { listBiCharts } from './certifiedBi.js'
import { getCertifiedChatScope } from './ceoChatGuard.js'
import { answerChat } from './chatEngine.js'
import { query } from './db.js'
import { appPublicUrl } from './joinActionTokens.js'

export const QUE_MCP_TOOLS = [
  {
    name: 'list_certified_metrics',
    description:
      'List certified semantic metrics in the Que workspace (KPI registry). Prefer these for executive answers.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max metrics to return (default 50)',
        },
      },
    },
  },
  {
    name: 'list_certified_charts',
    description:
      'List certified BI charts / Report Studio boards available for KPI consumers.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_cert_scope',
    description:
      'Show whether CEO/Ask cert guard is on, which certified tables exist, and approved glossary terms.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_kpi',
    description:
      'Ask a natural-language KPI / business question. Uses Que CEO cert guard — only certified marts + glossary. Same engine as Slack /que and in-app Ask (viewer).',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'KPI question, e.g. "what was revenue last week?"',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'list_certified_datasets',
    description:
      'List certified managed datasets (Offer B / marts) the KPI surface may reference.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
    },
  },
]

export function listQueMcpTools() {
  return QUE_MCP_TOOLS
}

/**
 * @param {string} workspaceId
 * @param {string} name
 * @param {object} [args]
 * @param {{ userId?: string | null }} [opts]
 */
export async function callQueMcpTool(workspaceId, name, args = {}, opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
  const userId = opts.userId || null

  switch (name) {
    case 'list_certified_metrics': {
      const all = await listMetrics(workspaceId)
      const items = all
        .filter((m) => m.certified)
        .slice(0, limit)
        .map((m) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          description: m.description,
          expressionSql: m.expressionSql,
          tags: m.tags,
          askUrl: `${appPublicUrl()}/chat`,
        }))
      return { ok: true, count: items.length, metrics: items }
    }
    case 'list_certified_charts': {
      const charts = await listBiCharts(workspaceId)
      const items = (charts || [])
        .filter((c) => c.certified)
        .slice(0, limit)
        .map((c) => ({
          id: c.id,
          title: c.title || c.name,
          chartType: c.chartType || c.chart_type,
          url: `${appPublicUrl()}/bi?chart=${encodeURIComponent(c.id)}`,
        }))
      return { ok: true, count: items.length, charts: items }
    }
    case 'list_certified_datasets': {
      const { rows } = await query(
        `SELECT id, name, slug, description, row_count, certified, updated_at
         FROM managed_datasets
         WHERE workspace_id = $1 AND certified = true
         ORDER BY updated_at DESC
         LIMIT $2`,
        [workspaceId, limit],
      )
      return {
        ok: true,
        count: rows.length,
        datasets: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          description: r.description || '',
          rowCount: Number(r.row_count) || 0,
          biUrl: `${appPublicUrl()}/bi`,
        })),
      }
    }
    case 'get_cert_scope': {
      const scope = await getCertifiedChatScope(workspaceId)
      return {
        ok: true,
        certifiedOnly: scope.certifiedOnly,
        hasCertifiedTables: scope.hasCertifiedTables,
        tableNames: scope.tableNames || [],
        glossaryTerms: (scope.glossaryTerms || []).slice(0, 40),
        askUrl: `${appPublicUrl()}/chat`,
        hint: scope.hasCertifiedTables
          ? 'Certified data available — ask_kpi may return KPI answers.'
          : 'No certified marts yet — run Monk Mode / certify a mart first.',
      }
    }
    case 'ask_kpi': {
      const question = String(args.question || '').trim()
      if (!question) {
        const err = new Error('question required')
        err.status = 400
        throw err
      }
      const answer = await answerChat(workspaceId, question, [], null, {
        audience: 'ceo',
        sessionId: `mcp:${Date.now()}`,
        userId,
      })
      return {
        ok: true,
        question,
        reply: answer?.reply || '',
        mode: answer?.mode || null,
        audience: 'ceo',
        citations: answer?.citations || [],
        askUrl: `${appPublicUrl()}/chat`,
        biUrl: `${appPublicUrl()}/bi`,
      }
    }
    default: {
      const err = new Error(`Unknown tool: ${name}`)
      err.status = 404
      throw err
    }
  }
}

/**
 * MCP JSON-RPC 2.0 handler (initialize / tools/list / tools/call / ping).
 * @param {object} message
 * @param {{ workspaceId: string, userId?: string | null }} ctx
 */
export async function handleMcpJsonRpc(message, ctx) {
  const id = message?.id ?? null
  const method = String(message?.method || '')
  const params = message?.params && typeof message.params === 'object'
    ? message.params
    : {}

  const ok = (result) => ({ jsonrpc: '2.0', id, result })
  const fail = (code, msg) => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: msg },
  })

  try {
    if (method === 'initialize') {
      return ok({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'que-kpi', version: '0.1.0' },
      })
    }
    if (method === 'notifications/initialized' || method === 'initialized') {
      return ok({})
    }
    if (method === 'ping') {
      return ok({})
    }
    if (method === 'tools/list') {
      return ok({ tools: QUE_MCP_TOOLS })
    }
    if (method === 'tools/call') {
      const name = String(params.name || '')
      const args =
        params.arguments && typeof params.arguments === 'object'
          ? params.arguments
          : {}
      const result = await callQueMcpTool(ctx.workspaceId, name, args, {
        userId: ctx.userId || null,
      })
      return ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      })
    }
    return fail(-32601, `Method not found: ${method}`)
  } catch (err) {
    return fail(err.status === 400 ? -32602 : -32000, String(err.message || err))
  }
}
