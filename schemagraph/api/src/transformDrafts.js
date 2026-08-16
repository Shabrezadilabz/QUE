/**
 * NL → reviewed SQL transform drafts (HITL approve before apply to job).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { buildSchemaContextPack } from './schemaContext.js'
import { buildRulesAiPack, formatRulesForPrompt } from './workspaceRules.js'
import { createProposalDiff } from './proposalDiffs.js'
import { recordAuditEvent } from './auditLog.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { resolveProviderKeys } from './secrets.js'
import { callChatModel, resolveModel } from './ai/models.js'
import { createJob } from './jobs.js'
import { buildNotebookFromFields } from './jobNotebook.js'

function mapDraft(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    prompt: r.prompt,
    sqlText: r.sql_text,
    status: r.status,
    jobId: r.job_id,
    evidence:
      r.evidence_json && typeof r.evidence_json === 'object'
        ? r.evidence_json
        : {},
    createdBy: r.created_by,
    createdByName: r.creator_display_name || null,
    createdByEmail: r.creator_email || null,
    reviewedBy: r.reviewed_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function extractSql(text) {
  const m = String(text || '').match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (m) return m[1].trim()
  if (/^\s*select\b/i.test(text) || /^\s*with\b/i.test(text)) {
    return String(text).trim()
  }
  return String(text || '').trim()
}

/** Tables named in SQL FROM/JOIN clauses (schema-only references). */
function tablesReferencedInSql(sql, packTables = []) {
  const text = String(sql || '')
  const found = []
  const re = /\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi
  let m
  while ((m = re.exec(text))) {
    const raw = m[1]
    const short = raw.includes('.') ? raw.split('.').pop() : raw
    if (!found.some((t) => t.name === short)) {
      const meta = packTables.find(
        (t) =>
          t.name === short ||
          t.name === raw ||
          String(t.name).toLowerCase() === String(short).toLowerCase(),
      )
      found.push({
        name: short,
        connection: meta?.connection || null,
        reason: meta
          ? 'Appears in draft SQL FROM/JOIN — selected from workspace schema pack'
          : 'Appears in draft SQL FROM/JOIN',
      })
    }
  }
  return found
}

function tablesMentionedInPrompt(prompt, packTables = []) {
  const p = String(prompt || '').toLowerCase()
  return (packTables || [])
    .filter((t) => p.includes(String(t.name || '').toLowerCase()))
    .slice(0, 12)
    .map((t) => ({
      name: t.name,
      connection: t.connection || null,
      reason: 'Name mentioned in the user / agent prompt',
    }))
}

export async function listTransformDrafts(workspaceId, { status } = {}) {
  const params = [workspaceId]
  let statusSql = ''
  if (status) {
    params.push(String(status))
    statusSql = ` AND t.status = $2`
  }
  const { rows } = await query(
    `SELECT t.*,
            u.display_name AS creator_display_name,
            u.email AS creator_email
     FROM transform_drafts t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.workspace_id = $1 ${statusSql}
     ORDER BY t.updated_at DESC
     LIMIT 100`,
    params,
  )
  return rows.map(mapDraft)
}

export async function getTransformDraft(workspaceId, draftId) {
  const { rows } = await query(
    `SELECT t.*,
            u.display_name AS creator_display_name,
            u.email AS creator_email
     FROM transform_drafts t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.workspace_id = $1 AND t.id = $2`,
    [workspaceId, draftId],
  )
  return rows[0] ? mapDraft(rows[0]) : null
}

/**
 * Create NL transform draft using schema + rules (LLM if available, else heuristic).
 */
export async function createTransformDraft(
  workspaceId,
  { prompt, title = '', userId = null } = {},
) {
  const p = String(prompt || '').trim()
  if (!p) {
    const err = new Error('prompt required')
    err.status = 400
    throw err
  }
  const pack = await buildSchemaContextPack(workspaceId)
  const rules = await buildRulesAiPack(workspaceId)
  const rulesBlock = formatRulesForPrompt(rules)
  const tableLines = (pack.tables || [])
    .slice(0, 40)
    .map(
      (t) =>
        `- ${t.name} (${t.connection || '?'}): ${(t.columns || [])
          .slice(0, 12)
          .map((c) => c.name)
          .join(', ')}`,
    )
    .join('\n')

  let sql = ''
  let mode = 'heuristic'
  let modelLabel = null
  const ws = await getWorkspaceSettings(workspaceId)
  const keys = await resolveProviderKeys(workspaceId)
  const model = resolveModel(ws?.settings || {}, null, keys)

  if (model) {
    try {
      const system =
        `You draft READ-ONLY SQL transforms for Que.\n` +
        `Use only tables/columns listed. SELECT/WITH only. Mark as draft.\n` +
        `Return a single sql fenced block.\n` +
        rulesBlock +
        `\n## Schema\n${tableLines}`
      const text = await callChatModel(model, system, p, [], keys)
      sql = extractSql(text)
      mode = 'llm'
      modelLabel =
        typeof model === 'string'
          ? model
          : model?.id || model?.model || model?.name || 'llm'
    } catch (err) {
      console.warn('[Que transform] LLM failed:', err.message || err)
    }
  }

  if (!sql) {
    const t0 = pack.tables?.[0]
    const cols = (t0?.columns || []).slice(0, 5).map((c) => c.name)
    sql =
      `-- Draft transform (heuristic — review before apply)\n` +
      `-- Prompt: ${p.slice(0, 200)}\n` +
      (t0
        ? `SELECT ${cols.length ? cols.join(', ') : '*'}\nFROM ${t0.name}\nLIMIT 100;`
        : `SELECT 1 AS placeholder; -- connect sources first`)
    mode = 'heuristic'
  }

  const mentioned = tablesMentionedInPrompt(p, pack.tables || [])
  const fromSql = tablesReferencedInSql(sql, pack.tables || [])
  const referredMap = new Map()
  for (const t of [...mentioned, ...fromSql]) {
    if (!referredMap.has(t.name)) referredMap.set(t.name, t)
  }
  // Heuristic fallback: if nothing matched, cite first schema table used
  if (referredMap.size === 0 && pack.tables?.[0]) {
    const t0 = pack.tables[0]
    referredMap.set(t0.name, {
      name: t0.name,
      connection: t0.connection || null,
      reason:
        'Default schema table used for heuristic draft (no named match in prompt)',
    })
  }
  const referredTables = [...referredMap.values()]
  const ruleTitles = (rules || [])
    .slice(0, 8)
    .map((r) => r.title || r.name || r.id)
    .filter(Boolean)

  const nature =
    mode === 'llm'
      ? `Agent (LLM) drafted READ-ONLY SQL from your prompt against the workspace schema pack${
          modelLabel ? ` using ${modelLabel}` : ''
        }. Promote stays HITL — SQL is not applied until you Approve + Apply.`
      : `Heuristic draft (no LLM result). Que picked schema tables to sketch a SELECT from your prompt so a human can review and rewrite before Apply.`

  const whyReferred =
    referredTables.length === 0
      ? 'No tables could be linked yet — connect sources or name tables in the prompt.'
      : referredTables
          .map((t) => `${t.name}${t.connection ? ` (${t.connection})` : ''}: ${t.reason}`)
          .join(' · ')

  const id = randomUUID()
  const draftTitle =
    String(title || '').trim() || p.slice(0, 80) || 'Transform draft'
  await query(
    `INSERT INTO transform_drafts (
       id, workspace_id, title, prompt, sql_text, status, evidence_json, created_by
     ) VALUES ($1,$2,$3,$4,$5,'proposed',$6::jsonb,$7)`,
    [
      id,
      workspaceId,
      draftTitle.slice(0, 200),
      p.slice(0, 4000),
      sql.slice(0, 50000),
      JSON.stringify({
        mode,
        model: modelLabel,
        proposerKind: 'user',
        nature,
        query: p.slice(0, 2000),
        referredTables,
        whyReferred,
        tableCount: pack.stats?.tableCount || 0,
        rulesApplied: rules.length,
        ruleTitles,
      }),
      userId,
    ],
  )

  await createProposalDiff(workspaceId, {
    kind: 'transform',
    title: draftTitle,
    summary: `NL transform draft (${mode})`,
    before: { sql: '' },
    after: { sql, prompt: p },
    resourceType: 'transform_draft',
    resourceId: id,
    userId,
  })

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'transform_draft.create',
    resourceType: 'transform_draft',
    resourceId: id,
    summary: `Transform draft “${draftTitle}”`,
  })
  return getTransformDraft(workspaceId, id)
}

export async function reviewTransformDraft(
  workspaceId,
  draftId,
  action,
  userId = null,
) {
  if (!['approve', 'reject', 'apply'].includes(action)) {
    const err = new Error('action must be approve|reject|apply')
    err.status = 400
    throw err
  }
  const draft = await getTransformDraft(workspaceId, draftId)
  if (!draft) {
    const err = new Error('draft not found')
    err.status = 404
    throw err
  }

  if (action === 'reject') {
    await query(
      `UPDATE transform_drafts SET status = 'rejected', reviewed_by = $3, updated_at = now()
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, draftId, userId],
    )
    return getTransformDraft(workspaceId, draftId)
  }

  if (action === 'approve') {
    await query(
      `UPDATE transform_drafts SET status = 'approved', reviewed_by = $3, updated_at = now()
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, draftId, userId],
    )
    return getTransformDraft(workspaceId, draftId)
  }

  // apply → create job notebook cell from SQL
  const notebook = buildNotebookFromFields({
    title: draft.title,
    sqlText: draft.sqlText,
    notes: `Applied from transform draft ${draftId}\nPrompt: ${draft.prompt}`,
  })
  const job = await createJob(workspaceId, {
    title: draft.title,
    notebook,
    sqlText: draft.sqlText,
    notes: `Applied from transform draft`,
  })
  await query(
    `UPDATE transform_drafts SET
       status = 'applied', job_id = $3, reviewed_by = $4, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, draftId, job.id, userId],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'transform_draft.apply',
    resourceType: 'transform_draft',
    resourceId: draftId,
    summary: `Applied transform → job ${job.id}`,
    meta: { jobId: job.id },
  })
  return getTransformDraft(workspaceId, draftId)
}
