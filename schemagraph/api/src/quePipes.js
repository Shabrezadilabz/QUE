/**
 * Que Pipes — NL → pipeline spec with HITL (Weld-class).
 * LLM/heuristic drafts multi-step ELT spec; human approves before job create.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { buildUnifiedContextPack } from './ssm/schemaContextService.js'
import { routeSsmIntent } from './ssm/ssmRouter.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { resolveProviderKeys } from './secrets.js'
import { callChatModel, resolveModel } from './ai/models.js'
import { createJob } from './jobs.js'
import { buildNotebookFromFields } from './jobNotebook.js'
import { recordAuditEvent } from './auditLog.js'
import { emitWorkspaceEvent } from './ssm/workspaceEvents.js'

export const PIPE_STATUSES = new Set(['pending', 'approved', 'rejected', 'applied'])

function mapProposal(row) {
  if (!row) return null
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    spec:
      row.spec_json && typeof row.spec_json === 'object' ? row.spec_json : {},
    evidence:
      row.evidence_json && typeof row.evidence_json === 'object'
        ? row.evidence_json
        : {},
    jobId: row.job_id,
    createdBy: row.created_by,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function extractSql(text) {
  const m = String(text || '').match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (m) return m[1].trim()
  if (/^\s*(select|with)\b/i.test(text)) return String(text).trim()
  return ''
}

/** Tables referenced in prompt or SQL. */
export function inferPipeTables(prompt, packTables = [], sql = '') {
  const names = new Set()
  const p = String(prompt || '').toLowerCase()
  for (const t of packTables || []) {
    if (p.includes(String(t.name || '').toLowerCase())) names.add(t.name)
  }
  const re = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi
  let m
  while ((m = re.exec(sql))) {
    const short = m[1].includes('.') ? m[1].split('.').pop() : m[1]
    names.add(short)
  }
  if (!names.size && packTables?.[0]) names.add(packTables[0].name)
  return [...names].slice(0, 12)
}

/**
 * Build heuristic pipeline spec (no LLM).
 * @param {string} prompt
 * @param {object} pack
 * @param {object} [ssmRoute]
 */
export function buildHeuristicPipeSpec(prompt, pack, ssmRoute = {}) {
  const tables = inferPipeTables(prompt, pack?.tables || [])
  const t0 = tables[0] || pack?.tables?.[0]?.name || 'source_table'
  const cols = (pack?.tables || [])
    .find((t) => t.name === t0)
    ?.columns?.slice(0, 6)
    .map((c) => c.name) || ['*']
  const sql =
    `SELECT ${cols.join(', ')}\nFROM ${t0}\n-- Review before apply\nLIMIT 1000`
  return {
    title: `Pipe: ${prompt.slice(0, 48)}`,
    intent: ssmRoute.intent || 'create_job',
    schedule: 'off',
    tables,
    steps: [
      {
        id: 1,
        phase: 'extract',
        label: 'Extract',
        detail: `Replicate ${tables.join(', ') || 'sources'} via Que Load`,
      },
      {
        id: 2,
        phase: 'transform',
        label: 'Transform',
        detail: 'SQL transform (review SQL below)',
        sql,
      },
      {
        id: 3,
        phase: 'load',
        label: 'Load',
        detail: 'Materialize output to warehouse mart',
        target: `mart_${String(t0).replace(/[^a-z0-9_]/gi, '_').slice(0, 32)}`,
      },
    ],
  }
}

/**
 * Parse LLM JSON or prose into pipe spec.
 * @param {string} text
 * @param {string} prompt
 */
export function parsePipeSpecFromLlm(text, prompt = '') {
  const raw = String(text || '').trim()
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed?.steps && Array.isArray(parsed.steps)) {
        return {
          title: String(parsed.title || `Pipe: ${prompt.slice(0, 40)}`),
          intent: parsed.intent || 'create_job',
          schedule: parsed.schedule || 'off',
          tables: Array.isArray(parsed.tables) ? parsed.tables.map(String) : [],
          steps: parsed.steps.slice(0, 8).map((s, i) => ({
            id: s.id ?? i + 1,
            phase: s.phase || 'transform',
            label: s.label || s.phase || `Step ${i + 1}`,
            detail: s.detail || '',
            sql: s.sql ? String(s.sql) : undefined,
            target: s.target ? String(s.target) : undefined,
          })),
        }
      }
    }
  } catch {
    /* fall through */
  }
  const sql = extractSql(raw)
  if (sql) {
    return {
      title: `Pipe: ${prompt.slice(0, 40)}`,
      intent: 'create_job',
      schedule: 'off',
      tables: [],
      steps: [
        {
          id: 1,
          phase: 'transform',
          label: 'Transform',
          detail: 'LLM SQL step',
          sql,
        },
      ],
    }
  }
  return null
}

export async function listPipeProposals(workspaceId, { status } = {}) {
  const params = [workspaceId]
  let clause = 'workspace_id = $1'
  if (status && PIPE_STATUSES.has(status)) {
    params.push(status)
    clause += ` AND status = $${params.length}`
  }
  const { rows } = await query(
    `SELECT * FROM que_pipe_proposals
     WHERE ${clause}
     ORDER BY updated_at DESC
     LIMIT 100`,
    params,
  )
  return rows.map(mapProposal)
}

export async function getPipeProposal(workspaceId, proposalId) {
  const { rows } = await query(
    `SELECT * FROM que_pipe_proposals WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, proposalId],
  )
  return mapProposal(rows[0])
}

/**
 * Draft pipeline from natural language (SSM-A/B context + optional LLM).
 */
export async function createPipeProposal(
  workspaceId,
  { prompt, title = '' } = {},
  userId = null,
) {
  const p = String(prompt || '').trim()
  if (!p) {
    const err = new Error('prompt required')
    err.status = 400
    throw err
  }

  const unified = await buildUnifiedContextPack(workspaceId, {
    message: p,
    audience: 'engineer',
    settings: (await getWorkspaceSettings(workspaceId))?.settings || {},
  })
  const pack = unified.pack
  const ssmRoute = unified.ssmRoute || routeSsmIntent(p, {})
  const sampleGateBlocked = unified.sampleGate?.blocked === true

  let spec = null
  let mode = 'heuristic'
  let modelLabel = null

  const ws = await getWorkspaceSettings(workspaceId)
  const keys = await resolveProviderKeys(workspaceId)
  const model = resolveModel(ws?.settings || {}, null, keys)

  if (model && !sampleGateBlocked) {
    try {
      const system = [
        'You design ELT pipeline specs for Que Pipes.',
        'Return JSON only:',
        '{ "title": "...", "tables": ["t1"], "schedule": "off|daily",',
        '  "steps": [{ "phase": "extract|transform|load", "label": "...", "detail": "...", "sql": "..." }] }',
        'Use ONLY tables from context. Transform SQL must be SELECT/WITH only.',
        unified.promptBlock?.slice(0, 12000) || '',
      ].join('\n')
      const text = await callChatModel(model, system, p, [], keys)
      spec = parsePipeSpecFromLlm(text, p)
      if (spec) {
        mode = 'llm'
        modelLabel =
          typeof model === 'string'
            ? model
            : model?.id || model?.model || 'llm'
      }
    } catch (err) {
      console.warn('[Que Pipes] LLM failed:', err.message || err)
    }
  }

  if (!spec) {
    spec = buildHeuristicPipeSpec(p, pack, ssmRoute)
    mode = 'heuristic'
  }

  if (!spec.tables?.length) {
    spec.tables = inferPipeTables(
      p,
      pack?.tables || [],
      spec.steps?.find((s) => s.sql)?.sql || '',
    )
  }

  const id = randomUUID()
  const proposalTitle =
    String(title || spec.title || `Pipe: ${p.slice(0, 60)}`).trim()

  await query(
    `INSERT INTO que_pipe_proposals (
       id, workspace_id, title, prompt, status, spec_json, evidence_json, created_by
     ) VALUES ($1,$2,$3,$4,'pending',$5::jsonb,$6::jsonb,$7)`,
    [
      id,
      workspaceId,
      proposalTitle.slice(0, 200),
      p.slice(0, 4000),
      JSON.stringify(spec),
      JSON.stringify({
        mode,
        model: modelLabel,
        intent: ssmRoute.intent,
        workspaceStateSummary: ssmRoute.workspaceStateSummary || null,
        sampleGateBlocked,
        sampleWarnings: unified.sampleWarnings || [],
      }),
      userId,
    ],
  )

  void emitWorkspaceEvent(workspaceId, 'job_created', {
    kind: 'pipe_proposal',
    proposalId: id,
    title: proposalTitle,
  })

  return getPipeProposal(workspaceId, id)
}

export async function reviewPipeProposal(
  workspaceId,
  proposalId,
  { action = 'approve' } = {},
  userId = null,
) {
  const cur = await getPipeProposal(workspaceId, proposalId)
  if (!cur) {
    const err = new Error('proposal not found')
    err.status = 404
    throw err
  }
  if (cur.status !== 'pending') {
    const err = new Error(`proposal already ${cur.status}`)
    err.status = 409
    throw err
  }
  const status = action === 'reject' ? 'rejected' : 'approved'
  await query(
    `UPDATE que_pipe_proposals SET
       status = $3,
       reviewed_by = $4,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, proposalId, status, userId],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: `pipe.${status}`,
    resourceType: 'que_pipe_proposal',
    resourceId: proposalId,
    summary: `${status} pipe proposal “${cur.title}”`,
  })
  return getPipeProposal(workspaceId, proposalId)
}

/** Apply approved proposal → Que job notebook. */
export async function applyPipeProposal(workspaceId, proposalId, userId = null) {
  const cur = await getPipeProposal(workspaceId, proposalId)
  if (!cur) {
    const err = new Error('proposal not found')
    err.status = 404
    throw err
  }
  if (cur.status === 'applied') {
    return { proposal: cur, jobId: cur.jobId, alreadyApplied: true }
  }
  if (cur.status !== 'approved' && cur.status !== 'pending') {
    const err = new Error('proposal must be approved or pending to apply')
    err.status = 409
    throw err
  }

  const spec = cur.spec || {}
  const sqlSteps = (spec.steps || []).filter((s) => s.sql)
  const primarySql =
    sqlSteps[0]?.sql ||
    `-- Pipe from: ${cur.prompt.slice(0, 200)}\nSELECT 1 AS placeholder`

  const notebook = buildNotebookFromFields({
    title: cur.title,
    notes: `Que Pipe\n\nPrompt: ${cur.prompt}`,
    sqlText: primarySql,
    tables: spec.tables || [],
    steps: (spec.steps || []).map((s, i) => ({
      id: s.id ?? i + 1,
      action: s.phase || 'transform',
      detail: s.detail || s.label || '',
    })),
    status: 'draft',
  })

  const job = await createJob(workspaceId, {
    title: cur.title,
    tables: spec.tables || [],
    sqlText: primarySql,
    notebook,
    notes: `Created from Que Pipe proposal ${proposalId}`,
    steps: (spec.steps || []).map((s, i) => ({
      id: s.id ?? i + 1,
      action: s.phase || 'step',
      detail: s.detail || s.label || '',
    })),
  })

  await query(
    `UPDATE que_pipe_proposals SET
       status = 'applied',
       job_id = $3,
       reviewed_by = COALESCE(reviewed_by, $4),
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, proposalId, job.id, userId],
  )

  void emitWorkspaceEvent(workspaceId, 'job_created', {
    kind: 'pipe_applied',
    proposalId,
    jobId: job.id,
    title: cur.title,
  })

  return {
    proposal: await getPipeProposal(workspaceId, proposalId),
    job,
    jobId: job.id,
  }
}
