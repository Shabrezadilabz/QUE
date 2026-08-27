/**
 * Que Agent sessions — unified chat + genie multi-step tools (HITL where required).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { inferJoinsForWorkspace } from './inferJoins.js'
import { createStitchJobFromTables, getJob, updateJob } from './jobs.js'
import { listConnections } from './connections.js'
import { listJobs } from './jobs.js'

function assertAgentEnabled(settings) {
  if (settings?.enableQueAgent === false && settings?.enableStitchAgent !== true) {
    const err = new Error(
      'Que Agent is disabled for this workspace (Settings → AI & Policy)',
    )
    err.status = 403
    throw err
  }
}

/**
 * Parse NL goal into intent + tool plan (heuristic; no LLM required).
 */
export function parseAgentIntent(goalText = '', pageContext = {}) {
  const g = String(goalText || '').toLowerCase()
  const wantsValidate =
    /validat|uniqueness|referential|row.?count|sanity|test suite/.test(g)
  const wantsDrift = /drift|remap|re-?freeze|schema change|repair/.test(g)
  const wantsCustomer360 =
    /customer.?360|360|stitch|cross.?source|join|unify|trusted|combine/.test(g) ||
    (!wantsValidate && !wantsDrift)
  const wantsDraftJob =
    /job|notebook|draft|ship|export|dbt/.test(g) || wantsCustomer360
  const wantsTransform =
    /transform|clean|scrub|normalize|nl.?sql|sql draft|combine.*column/.test(g)
  const wantsEditJob =
    /\b(edit|update|change|modify|rename)\b.*\bjob\b/.test(g) ||
    Boolean(pageContext?.jobId && /\b(edit|update|change|modify)\b/.test(g))
  const wantsMaterialize =
    /materialize|create\s+table|new\s+table|ctas|build\s+table/.test(g)
  const wantsBi =
    /\b(bi|report|dashboard|chart|visual|looker|metabase)\b/.test(g) &&
    /\b(build|create|scaffold|make|design)\b/.test(g)

  const tools = []
  tools.push({ id: 'list_sources', label: 'Inventory connected sources' })
  if (wantsCustomer360 || wantsDraftJob) {
    tools.push({ id: 'infer_joins', label: 'Infer cross-source join suggestions' })
  }
  if (wantsTransform) {
    tools.push({
      id: 'draft_transform',
      label: 'Draft NL→SQL transform for HITL review',
    })
  }
  if (wantsValidate) {
    tools.push({
      id: 'generate_validation',
      label: 'Generate warehouse validation suite',
    })
  }
  if (wantsDrift) {
    tools.push({
      id: 'propose_drift_fixes',
      label: 'Propose drift remaps / re-freeze',
    })
  }
  if (wantsEditJob) {
    tools.push({ id: 'edit_job', label: 'Edit existing job from NL request' })
  }
  if (wantsMaterialize) {
    tools.push({
      id: 'materialize_job',
      label: 'Materialize job SQL as table/view in warehouse',
    })
  }
  if (wantsBi) {
    tools.push({
      id: 'scaffold_bi',
      label: 'Build BI report from template + columns/colors',
    })
  }
  if (wantsDraftJob && !wantsDrift && !wantsEditJob) {
    tools.push({ id: 'draft_job', label: 'Draft stitch notebook job' })
  }

  return {
    intent: wantsBi
      ? 'bi_build'
      : wantsMaterialize
        ? 'materialize'
        : wantsEditJob
          ? 'edit_job'
          : wantsDrift
            ? 'drift_repair'
            : wantsValidate
              ? 'validation'
              : 'stitch',
    tools,
    wantsValidate,
    wantsDrift,
    wantsDraftJob,
    wantsEditJob,
    wantsMaterialize,
    wantsBi,
  }
}

export async function listAgentSessions(workspaceId, { limit = 30 } = {}) {
  const { rows } = await query(
    `SELECT id, title, status, plan_json, checkpoints_json, result_json,
            tool_calls_json, created_at, updated_at
     FROM stitch_agent_sessions
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(100, Math.max(1, Number(limit) || 30))],
  )
  return rows.map(rowToSession)
}

export async function getAgentSession(workspaceId, sessionId) {
  const { rows } = await query(
    `SELECT id, title, status, plan_json, checkpoints_json, result_json,
            tool_calls_json, created_at, updated_at
     FROM stitch_agent_sessions
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, sessionId],
  )
  return rows[0] ? rowToSession(rows[0]) : null
}

function rowToSession(r) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    plan: r.plan_json || {},
    checkpoints: Array.isArray(r.checkpoints_json) ? r.checkpoints_json : [],
    result: r.result_json || {},
    toolCalls: Array.isArray(r.tool_calls_json) ? r.tool_calls_json : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * Create a plan from NL goal: pick sources, propose tool steps, wait for approve_plan.
 */
export async function createAgentSession(workspaceId, userId, body = {}) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings
  assertAgentEnabled(settings)

  const connections = await listConnections(workspaceId)
  const sourceIds = Array.isArray(body.sourceIds)
    ? body.sourceIds.filter(Boolean).slice(0, 6)
    : connections.slice(0, 2).map((c) => c.id)

  const goal =
    String(body.goal || '').trim() ||
    'Build a trusted stitch from connected sources'
  const pageContext = body.pageContext && typeof body.pageContext === 'object'
    ? body.pageContext
    : {}
  const parsed = parseAgentIntent(goal, pageContext)

  const title =
    String(body.title || '').trim() ||
    `${parsed.intent} · ${new Date().toISOString().slice(0, 10)}`

  const steps = [
    { id: 'plan', label: 'Review NL plan + tools', status: 'waiting_human' },
    ...parsed.tools.map((t) => ({
      id: t.id,
      label: t.label,
      status: 'pending',
    })),
  ]

  // Always keep HITL promote when infer is in the plan
  if (parsed.tools.some((t) => t.id === 'infer_joins')) {
    const draftIdx = steps.findIndex((s) => s.id === 'draft_job')
    const promoteStep = {
      id: 'promote',
      label: 'Human Promote joins (HITL)',
      status: 'pending',
    }
    if (draftIdx >= 0) steps.splice(draftIdx, 0, promoteStep)
    else steps.push(promoteStep)
  }

  const plan = {
    goal,
    intent: parsed.intent,
    sourceIds,
    tools: parsed.tools,
    steps,
  }

  const checkpoints = [
    {
      id: randomUUID(),
      type: 'approve_plan',
      status: 'open',
      message:
        'Approve this multi-step plan before the agent runs tools. Promote stays human unless low-risk auto-promote policy is on.',
      createdAt: new Date().toISOString(),
    },
  ]

  const id = randomUUID()
  await query(
    `INSERT INTO stitch_agent_sessions (
       id, workspace_id, created_by, title, status, plan_json, checkpoints_json, tool_calls_json
     ) VALUES ($1,$2,$3,$4,'awaiting_checkpoint',$5::jsonb,$6::jsonb,'[]'::jsonb)`,
    [
      id,
      workspaceId,
      userId || null,
      title,
      JSON.stringify(plan),
      JSON.stringify(checkpoints),
    ],
  )
  return getAgentSession(workspaceId, id)
}

async function recordToolCall(workspaceId, sessionId, call) {
  const { rows } = await query(
    `SELECT tool_calls_json FROM stitch_agent_sessions
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, sessionId],
  )
  const prev = Array.isArray(rows[0]?.tool_calls_json)
    ? rows[0].tool_calls_json
    : []
  const next = [...prev, call]
  await query(
    `UPDATE stitch_agent_sessions
     SET tool_calls_json = $3::jsonb, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, sessionId, JSON.stringify(next)],
  )
  return next
}

async function runTool(workspaceId, userId, toolId, body, session) {
  const started = new Date().toISOString()
  let output = {}
  try {
    if (toolId === 'list_sources') {
      const connections = await listConnections(workspaceId)
      output = {
        count: connections.length,
        sources: connections.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.sourceType || c.source_type,
        })),
      }
    } else if (toolId === 'infer_joins') {
      output = await inferJoinsForWorkspace(workspaceId)
      try {
        const { maybeAutoPromoteLowRisk } = await import('./autoPromote.js')
        output.autoPromote = await maybeAutoPromoteLowRisk(
          workspaceId,
          userId,
        )
      } catch {
        /* optional */
      }
    } else if (toolId === 'generate_validation') {
      const { generateValidationSuite } = await import('./validationSuite.js')
      let jobId = body.jobId || session.result?.jobId
      if (!jobId) {
        const jobs = await listJobs(workspaceId)
        jobId = jobs?.[0]?.id
      }
      if (!jobId) {
        output = { error: 'No job available — draft a job first' }
      } else {
        output = await generateValidationSuite(workspaceId, jobId)
      }
    } else if (toolId === 'propose_drift_fixes') {
      const { proposeDriftFixes } = await import('./driftAgent.js')
      output = await proposeDriftFixes(workspaceId, userId)
    } else if (toolId === 'draft_job') {
      const tableNames = Array.isArray(body.tableNames)
        ? body.tableNames.filter(Boolean)
        : Array.isArray(body.pageContext?.selectedTables)
          ? body.pageContext.selectedTables.filter(Boolean)
          : await sampleTableNames(workspaceId, 4)
      const job = await createStitchJobFromTables(workspaceId, {
        tableNames,
        title: body.jobTitle || session.title,
      })
      output = { jobId: job?.id || null, job }
    } else if (toolId === 'draft_transform') {
      const { createTransformDraft } = await import('./transformDrafts.js')
      const draft = await createTransformDraft(workspaceId, {
        prompt:
          body.prompt ||
          session.plan?.goal ||
          session.title ||
          'Draft a trusted SELECT transform from connected tables',
        title: body.title || session.title,
        userId,
      })
      output = { draftId: draft?.id || null, draft }
    } else if (toolId === 'edit_job') {
      const jobId =
        body.jobId ||
        body.pageContext?.jobId ||
        session.result?.jobId ||
        null
      if (!jobId) {
        output = { error: 'No jobId — open a job or say "edit job <id>"' }
      } else {
        const job = await getJob(workspaceId, jobId)
        if (!job) {
          output = { error: `Job ${jobId} not found` }
        } else {
          const prompt = body.prompt || session.plan?.goal || session.title || ''
          const rename = prompt.match(/\brename\s+(?:to\s+)?["']?([^"'\n]+)["']?/i)
          const patch = {}
          if (rename?.[1]) patch.title = rename[1].trim().slice(0, 120)
          if (/\bsql\b|select\b|join\b|combine\b/i.test(prompt)) {
            const { createTransformDraft, reviewTransformDraft } =
              await import('./transformDrafts.js')
            const draft = await createTransformDraft(workspaceId, {
              prompt,
              title: patch.title || job.title,
              userId,
            })
            const applied = await reviewTransformDraft(
              workspaceId,
              draft.id,
              'apply',
              userId,
            )
            if (applied?.jobId) {
              output = {
                jobId: applied.jobId,
                job: await getJob(workspaceId, applied.jobId),
              }
            } else {
              output = { draftId: draft?.id, note: 'Transform draft created — apply from Transforms' }
            }
          } else if (Object.keys(patch).length) {
            const updated = await updateJob(workspaceId, jobId, patch)
            output = { jobId, job: updated }
          } else {
            output = { jobId, job, note: 'No changes detected — include SQL or "rename to …"' }
          }
        }
      }
    } else if (toolId === 'materialize_job') {
      const { materializeJob } = await import('./materialize.js')
      const jobId =
        body.jobId ||
        body.pageContext?.jobId ||
        session.result?.jobId ||
        null
      if (!jobId) {
        const jobs = await listJobs(workspaceId)
        if (jobs?.[0]?.id) {
          output = { error: 'Specify jobId or draft a job first' }
        } else {
          output = { error: 'No job to materialize — create a job first' }
        }
      } else {
        const kind = /view\b/i.test(body.prompt || '') ? 'view' : 'table'
        const mat = await materializeJob(workspaceId, jobId, {
          confirm: true,
          kind,
          actorUserId: userId,
          force: body.force === true,
        })
        output = { materialization: mat, materializationId: mat?.id, jobId }
      }
    } else if (toolId === 'scaffold_bi') {
      const { scaffoldBiReport, parseBiStyleFromPrompt } =
        await import('./certifiedBi.js')
      const prompt = body.prompt || session.plan?.goal || session.title || ''
      const style = parseBiStyleFromPrompt(prompt)
      const biReport = await scaffoldBiReport(workspaceId, {
        title: style.title || body.jobTitle || 'Chat report',
        prompt,
        userId,
        ...style,
      })
      output = { biReport, reportId: biReport.reportId }
    } else {
      output = { error: `Unknown tool ${toolId}` }
    }
  } catch (err) {
    output = { error: String(err.message || err) }
  }

  const call = {
    id: randomUUID(),
    tool: toolId,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    ok: !output.error,
    output,
  }
  await recordToolCall(workspaceId, session.id, call)
  return call
}

export async function advanceAgentCheckpoint(
  workspaceId,
  sessionId,
  userId,
  body = {},
) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings
  assertAgentEnabled(settings)

  const session = await getAgentSession(workspaceId, sessionId)
  if (!session) {
    const err = new Error('Agent session not found')
    err.status = 404
    throw err
  }

  const action = String(body.action || '').toLowerCase()
  const checkpointId = body.checkpointId
  const checkpoints = [...session.checkpoints]
  const open = checkpoints.find(
    (c) => c.status === 'open' && (!checkpointId || c.id === checkpointId),
  )
  if (!open && action !== 'reject_plan') {
    const err = new Error('No open checkpoint')
    err.status = 400
    throw err
  }

  if (action === 'reject_plan' || action === 'reject') {
    if (open) open.status = 'rejected'
    await saveSession(workspaceId, sessionId, {
      status: 'rejected',
      checkpoints,
      plan: session.plan,
      result: { reason: 'User rejected plan' },
    })
    return getAgentSession(workspaceId, sessionId)
  }

  if (action !== 'approve' && action !== 'approve_plan') {
    const err = new Error('action must be approve or reject')
    err.status = 400
    throw err
  }

  open.status = 'approved'
  open.resolvedAt = new Date().toISOString()
  open.resolvedBy = userId || null

  const plan = { ...session.plan }
  plan.steps = (plan.steps || []).map((s) =>
    s.id === 'plan' ? { ...s, status: 'done' } : s,
  )

  const result = { ...(session.result || {}), toolOutputs: {} }
  const toolOrder = (plan.tools || []).map((t) => t.id)

  for (const toolId of toolOrder) {
    if (toolId === 'draft_job') continue // after promote HITL
    plan.steps = plan.steps.map((s) =>
      s.id === toolId ? { ...s, status: 'running' } : s,
    )
    const call = await runTool(workspaceId, userId, toolId, body, {
      ...session,
      result,
    })
    result.toolOutputs[toolId] = call.output
    if (toolId === 'infer_joins') {
      result.infer = call.output
    }
    if (toolId === 'draft_job' && call.output?.jobId) {
      result.jobId = call.output.jobId
      result.job = call.output.job
    }
    if (toolId === 'edit_job' && call.output?.jobId) {
      result.jobId = call.output.jobId
      result.job = call.output.job
    }
    if (toolId === 'materialize_job' && call.output?.materializationId) {
      result.materializationId = call.output.materializationId
      result.materialization = call.output.materialization
    }
    if (toolId === 'scaffold_bi' && call.output?.biReport) {
      result.biReport = call.output.biReport
    }
    plan.steps = plan.steps.map((s) =>
      s.id === toolId
        ? {
            ...s,
            status: call.ok ? 'done' : 'failed',
            error: call.output?.error,
          }
        : s,
    )
  }

  const needsPromote = (plan.steps || []).some((s) => s.id === 'promote')
  if (needsPromote) {
    const auto = result.infer?.autoPromote
    const autoDone = auto?.enabled && auto?.promoted > 0
    const promoteCheckpoint = {
      id: randomUUID(),
      type: 'promote_joins',
      status: 'open',
      message: autoDone
        ? `Auto-promoted ${auto.promoted} low-risk join(s). Review remaining in Join Review, then continue.`
        : `Inference created ${result.infer?.created || 0} suggestion(s). Promote joins in Join Review, then continue.`,
      createdAt: new Date().toISOString(),
      meta: {
        created: result.infer?.created || 0,
        autoPromote: auto || null,
      },
    }
    checkpoints.push(promoteCheckpoint)
    plan.steps = plan.steps.map((s) =>
      s.id === 'promote' ? { ...s, status: 'waiting_human' } : s,
    )
    await saveSession(workspaceId, sessionId, {
      status: 'awaiting_checkpoint',
      checkpoints,
      plan,
      result,
    })
    return getAgentSession(workspaceId, sessionId)
  }

  // No promote gate — finish remaining tools (e.g. drift-only / validate-only)
  if (toolOrder.includes('draft_job')) {
    plan.steps = plan.steps.map((s) =>
      s.id === 'draft_job' ? { ...s, status: 'running' } : s,
    )
    const call = await runTool(workspaceId, userId, 'draft_job', body, {
      ...session,
      result,
    })
    result.toolOutputs.draft_job = call.output
    result.jobId = call.output?.jobId || null
    result.job = call.output?.job || null
    plan.steps = plan.steps.map((s) =>
      s.id === 'draft_job'
        ? {
            ...s,
            status: call.ok ? 'done' : 'failed',
            error: call.output?.error,
          }
        : s,
    )
  }

  const failed = (plan.steps || []).some((s) => s.status === 'failed')
  await saveSession(workspaceId, sessionId, {
    status: failed ? 'failed' : 'completed',
    checkpoints,
    plan,
    result,
  })
  return getAgentSession(workspaceId, sessionId)
}

/**
 * After human Promoted joins — draft job + optional validation tool.
 */
export async function continueAgentAfterPromote(
  workspaceId,
  sessionId,
  userId,
  body = {},
) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings
  assertAgentEnabled(settings)
  const session = await getAgentSession(workspaceId, sessionId)
  if (!session) {
    const err = new Error('Agent session not found')
    err.status = 404
    throw err
  }

  const checkpoints = [...session.checkpoints]
  const open = checkpoints.find(
    (c) => c.status === 'open' && c.type === 'promote_joins',
  )
  if (!open) {
    const err = new Error('No promote_joins checkpoint open')
    err.status = 400
    throw err
  }
  open.status = 'approved'
  open.resolvedAt = new Date().toISOString()
  open.resolvedBy = userId || null

  const plan = { ...session.plan }
  plan.steps = (plan.steps || []).map((s) =>
    s.id === 'promote' ? { ...s, status: 'done' } : s,
  )

  const result = { ...(session.result || {}), toolOutputs: { ...(session.result?.toolOutputs || {}) } }

  if ((plan.steps || []).some((s) => s.id === 'draft_job')) {
    plan.steps = plan.steps.map((s) =>
      s.id === 'draft_job' ? { ...s, status: 'running' } : s,
    )
    const call = await runTool(workspaceId, userId, 'draft_job', body, {
      ...session,
      result,
    })
    result.toolOutputs.draft_job = call.output
    result.jobId = call.output?.jobId || null
    result.job = call.output?.job || null
    plan.steps = plan.steps.map((s) =>
      s.id === 'draft_job'
        ? {
            ...s,
            status: call.ok ? 'done' : 'failed',
            error: call.output?.error,
          }
        : s,
    )
  }

  // If goal asked for validation and we now have a job, generate suite
  if (
    plan.intent === 'validation' ||
    (plan.tools || []).some((t) => t.id === 'generate_validation')
  ) {
    if (result.jobId && !result.toolOutputs.generate_validation) {
      plan.steps = plan.steps.map((s) =>
        s.id === 'generate_validation' ? { ...s, status: 'running' } : s,
      )
      const call = await runTool(
        workspaceId,
        userId,
        'generate_validation',
        { ...body, jobId: result.jobId },
        { ...session, result },
      )
      result.toolOutputs.generate_validation = call.output
      plan.steps = plan.steps.map((s) =>
        s.id === 'generate_validation'
          ? {
              ...s,
              status: call.ok ? 'done' : 'failed',
              error: call.output?.error,
            }
          : s,
      )
    }
  }

  const failed = (plan.steps || []).some((s) => s.status === 'failed')
  await saveSession(workspaceId, sessionId, {
    status: failed ? 'failed' : 'completed',
    checkpoints,
    plan,
    result,
  })
  return getAgentSession(workspaceId, sessionId)
}

async function sampleTableNames(workspaceId, n) {
  const { rows } = await query(
    `SELECT name FROM schema_objects WHERE workspace_id = $1 ORDER BY name LIMIT $2`,
    [workspaceId, n],
  )
  return rows.map((r) => r.name)
}

async function saveSession(workspaceId, sessionId, patch) {
  await query(
    `UPDATE stitch_agent_sessions
     SET status = COALESCE($3, status),
         plan_json = COALESCE($4::jsonb, plan_json),
         checkpoints_json = COALESCE($5::jsonb, checkpoints_json),
         result_json = COALESCE($6::jsonb, result_json),
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      sessionId,
      patch.status || null,
      patch.plan ? JSON.stringify(patch.plan) : null,
      patch.checkpoints ? JSON.stringify(patch.checkpoints) : null,
      patch.result ? JSON.stringify(patch.result) : null,
    ],
  )
}

export async function listJoinMemory(workspaceId) {
  const { rows } = await query(
    `SELECT id, from_table, from_column, to_table, to_column, relationship_id, note, created_at
     FROM join_memory WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    fromTable: r.from_table,
    fromColumn: r.from_column,
    toTable: r.to_table,
    toColumn: r.to_column,
    relationshipId: r.relationship_id,
    note: r.note,
    createdAt: r.created_at,
  }))
}

export async function rememberPromotedJoin(workspaceId, userId, rel) {
  if (!rel?.fromTable || !rel?.toTable) return
  await query(
    `INSERT INTO join_memory (
       id, workspace_id, from_table, from_column, to_table, to_column,
       relationship_id, accepted_by, note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (workspace_id, from_table, from_column, to_table, to_column)
     DO UPDATE SET relationship_id = EXCLUDED.relationship_id, accepted_by = EXCLUDED.accepted_by`,
    [
      randomUUID(),
      workspaceId,
      rel.fromTable,
      rel.fromColumn || '',
      rel.toTable,
      rel.toColumn || '',
      rel.relationshipId || null,
      userId || null,
      rel.note || 'Promoted in Que',
    ],
  )
}
