/**
 * CEO P0 — Natural-language Outcome plans (sources → joins → metrics → chart).
 * Schema-first: plans reference metadata only; no lake row pull.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import { listJoinReviews } from './joinReviews.js'
import { riskContextForWorkspace, effectiveTier } from './riskTiers.js'

const SOURCE_ALIASES = [
  { key: 'postgres', re: /\b(postgres|postgresql|pg)\b/i, types: ['postgresql', 'postgres'] },
  { key: 'salesforce', re: /\b(salesforce|sfdc|crm)\b/i, types: ['salesforce'] },
  { key: 'stripe', re: /\bstripe\b/i, types: ['stripe', 'postgresql', 'postgres'] },
  { key: 'snowflake', re: /\bsnowflake\b/i, types: ['snowflake'] },
  { key: 'databricks', re: /\b(databricks|dbx)\b/i, types: ['databricks'] },
  { key: 'bigquery', re: /\b(bigquery|bq)\b/i, types: ['bigquery'] },
  { key: 'mongo', re: /\b(mongo|mongodb)\b/i, types: ['mongodb', 'mongo'] },
  { key: 'excel', re: /\b(excel|csv|spreadsheet)\b/i, types: ['excel', 'csv'] },
]

function mapOutcome(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    prompt: r.prompt,
    status: r.status,
    plan: r.plan_json && typeof r.plan_json === 'object' ? r.plan_json : {},
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function detectSourceHints(prompt) {
  const hits = []
  for (const a of SOURCE_ALIASES) {
    if (a.re.test(prompt)) hits.push(a)
  }
  return hits
}

function metricHints(prompt) {
  const p = prompt.toLowerCase()
  const metrics = []
  if (/revenue|arr|mrr|sales|gmv/.test(p)) {
    metrics.push({
      id: 'revenue',
      label: 'Revenue',
      expressionHint: 'SUM(amount) or equivalent revenue column',
    })
  }
  if (/region|geo|country|territory/.test(p)) {
    metrics.push({
      id: 'by_region',
      label: 'By region',
      expressionHint: 'GROUP BY region / country / territory',
    })
  }
  if (/customer|account/.test(p)) {
    metrics.push({
      id: 'customers',
      label: 'Customers / accounts',
      expressionHint: 'COUNT(DISTINCT customer_id)',
    })
  }
  if (!metrics.length) {
    metrics.push({
      id: 'primary',
      label: 'Primary measure from prompt',
      expressionHint: 'Infer measure from connected tables after Promote',
    })
  }
  return metrics
}

/**
 * Build a multi-step plan from NL prompt + live workspace metadata.
 */
export async function buildOutcomePlan(workspaceId, prompt) {
  const text = String(prompt || '').trim()
  if (!text) {
    const err = new Error('prompt required')
    err.status = 400
    throw err
  }

  const hints = detectSourceHints(text)
  const { rows: connections } = await query(
    `SELECT id, name, source_type, status, last_sync_at
     FROM connections WHERE workspace_id = $1
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 40`,
    [workspaceId],
  )

  let matched = connections
  if (hints.length) {
    const types = new Set(hints.flatMap((h) => h.types.map((t) => t.toLowerCase())))
    matched = connections.filter((c) =>
      types.has(String(c.source_type || '').toLowerCase()),
    )
    if (!matched.length) matched = connections.slice(0, 3)
  } else {
    matched = connections.slice(0, 4)
  }

  const riskCtx = await riskContextForWorkspace(workspaceId)
  const reviews = await listJoinReviews(workspaceId, { status: 'all', limit: 80 })
  const connNames = new Set(matched.map((c) => c.name))
  const relevantJoins = (reviews.items || []).filter(
    (j) =>
      connNames.has(j.from?.connection) ||
      connNames.has(j.to?.connection) ||
      !matched.length,
  )

  const pendingYellow = relevantJoins.filter(
    (j) =>
      j.status === 'suggested' &&
      (j.risk?.effectiveTier === 'yellow' || j.risk?.tier === 'yellow'),
  )
  const pendingRed = relevantJoins.filter(
    (j) =>
      j.status === 'suggested' &&
      (j.risk?.effectiveTier === 'red' || j.risk?.tier === 'red'),
  )
  const pendingGreen = relevantJoins.filter(
    (j) =>
      j.status === 'suggested' &&
      (j.risk?.effectiveTier === 'green' ||
        (j.risk?.tier === 'green' && j.risk?.greenEligible)),
  )

  const metrics = metricHints(text)
  const steps = [
    {
      id: 'sources',
      kind: 'sources',
      title: 'Confirm sources',
      status: matched.length ? 'ready' : 'blocked',
      href: '/sources',
      detail: matched.length
        ? `Matched ${matched.length} connection(s): ${matched.map((c) => c.name).join(', ')}`
        : 'No connections yet — add Postgres / CRM / warehouse sources first.',
      connections: matched.map((c) => ({
        id: c.id,
        name: c.name,
        sourceType: c.source_type,
        status: c.status,
      })),
    },
    {
      id: 'joins',
      kind: 'joins',
      title: 'Approve stitch joins',
      status: pendingRed.length
        ? 'needs_approve'
        : pendingYellow.length || pendingGreen.length
          ? 'needs_approve'
          : relevantJoins.some((j) => j.status === 'accepted')
            ? 'done'
            : 'pending',
      href: '/joins',
      detail: `Green ${pendingGreen.length} · Yellow ${pendingYellow.length} · Red ${pendingRed.length} pending. Schema-first — Promote gates trust.`,
      joins: relevantJoins.slice(0, 12).map((j) => ({
        id: j.id,
        status: j.status,
        tier: j.risk?.effectiveTier || j.risk?.tier || 'yellow',
        from: `${j.from?.table}.${j.from?.column}`,
        to: `${j.to?.table}.${j.to?.column}`,
        rationale: j.risk?.rationale || j.evidence?.summary || null,
      })),
    },
    {
      id: 'metrics',
      kind: 'metrics',
      title: 'Define metrics',
      status: 'pending',
      href: '/metrics',
      detail: 'Semantic metrics from your prompt (review before ship).',
      metrics,
    },
    {
      id: 'chart',
      kind: 'chart',
      title: 'Ship to BI',
      status: 'pending',
      href: '/ship',
      detail:
        'One-screen draft → approve → live dashboard. Jobs/notebook stay optional (Advanced).',
      chartHint: {
        title: text.slice(0, 80),
        chartType: /region|geo|country/.test(text.toLowerCase()) ? 'bar' : 'kpi',
      },
    },
  ]

  return {
    prompt: text,
    custody:
      'Que uses schema + scrubbed samples only — never full lake / managed row custody for AI planning.',
    riskContext: {
      lastGoldenRecall: riskCtx.lastGoldenRecall,
      autoPromoteMinRecall: riskCtx.autoPromoteMinRecall,
      autoPromoteEnabled: riskCtx.enableAutoPromoteLowRisk,
    },
    steps,
    summary: {
      connections: matched.length,
      joinsPending:
        pendingGreen.length + pendingYellow.length + pendingRed.length,
      joinsAccepted: relevantJoins.filter((j) => j.status === 'accepted').length,
    },
  }
}

export async function listOutcomes(workspaceId, { limit = 30 } = {}) {
  const { rows } = await query(
    `SELECT * FROM workspace_outcomes
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(Math.max(Number(limit) || 30, 1), 100)],
  )
  return rows.map(mapOutcome)
}

export async function getOutcome(workspaceId, outcomeId) {
  const { rows } = await query(
    `SELECT * FROM workspace_outcomes WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, outcomeId],
  )
  return rows[0] ? mapOutcome(rows[0]) : null
}

export async function createOutcome(workspaceId, prompt, userId = null) {
  const plan = await buildOutcomePlan(workspaceId, prompt)

  // Optional: attach Stitch Agent session when enabled (multi-step HITL tools)
  let agentSessionId = null
  try {
    const { getWorkspaceSettings } = await import('./workspaceSettings.js')
    const settings = (await getWorkspaceSettings(workspaceId))?.settings
    if (settings?.enableQueAgent !== false || settings?.enableStitchAgent === true) {
      const { createAgentSession } = await import('./agentSessions.js')
      const sourceIds = (plan.steps || [])
        .find((s) => s.kind === 'sources')
        ?.connections?.map((c) => c.id)
        .filter(Boolean)
      const session = await createAgentSession(workspaceId, userId, {
        goal: plan.prompt,
        title: `Outcome · ${plan.prompt.slice(0, 60)}`,
        sourceIds: sourceIds?.length ? sourceIds : undefined,
      })
      agentSessionId = session?.id || null
      plan.agentSessionId = agentSessionId
      plan.agentHref = agentSessionId ? `/agent` : null
    }
  } catch {
    /* agent optional */
  }

  const id = randomUUID()
  await query(
    `INSERT INTO workspace_outcomes (
       id, workspace_id, prompt, status, plan_json, created_by
     ) VALUES ($1,$2,$3,'open',$4::jsonb,$5)`,
    [id, workspaceId, plan.prompt, JSON.stringify(plan), userId],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'outcome.create',
    resourceType: 'outcome',
    resourceId: id,
    summary: `Outcome: ${plan.prompt.slice(0, 120)}`,
    meta: { agentSessionId },
  })
  return getOutcome(workspaceId, id)
}

export async function refreshOutcome(workspaceId, outcomeId, userId = null) {
  const current = await getOutcome(workspaceId, outcomeId)
  if (!current) {
    const err = new Error('outcome not found')
    err.status = 404
    throw err
  }
  const plan = await buildOutcomePlan(workspaceId, current.prompt)
  // Preserve linked agent session across plan rebuilds
  if (current.plan?.agentSessionId) {
    plan.agentSessionId = current.plan.agentSessionId
    plan.agentHref = current.plan.agentHref || '/agent'
  }
  await query(
    `UPDATE workspace_outcomes
     SET plan_json = $3::jsonb, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, outcomeId, JSON.stringify(plan)],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'outcome.refresh',
    resourceType: 'outcome',
    resourceId: outcomeId,
    summary: 'Refreshed outcome plan from live schema',
  })
  return getOutcome(workspaceId, outcomeId)
}

export async function patchOutcomeStatus(
  workspaceId,
  outcomeId,
  status,
  userId = null,
) {
  const allowed = new Set(['open', 'shipping', 'done', 'cancelled'])
  if (!allowed.has(String(status))) {
    const err = new Error('invalid status')
    err.status = 400
    throw err
  }
  await query(
    `UPDATE workspace_outcomes
     SET status = $3, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, outcomeId, status],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'outcome.status',
    resourceType: 'outcome',
    resourceId: outcomeId,
    summary: `Outcome status → ${status}`,
  })
  return getOutcome(workspaceId, outcomeId)
}

/**
 * Run / advance the next Outcome step (schema-first tool loop).
 * stepId: sources | joins | metrics | chart | auto
 */
export async function runOutcomeStep(
  workspaceId,
  outcomeId,
  { stepId = 'auto', userId = null, inferJoins = false } = {},
) {
  let outcome = await getOutcome(workspaceId, outcomeId)
  if (!outcome) {
    const err = new Error('outcome not found')
    err.status = 404
    throw err
  }

  const steps = outcome.plan?.steps || []
  let target = stepId
  if (target === 'auto') {
    const next = steps.find(
      (s) => s.status === 'pending' || s.status === 'needs_approve' || s.status === 'blocked',
    )
    target = next?.id || next?.kind || 'joins'
  }

  const actions = []

  if (target === 'sources') {
    actions.push({
      tool: 'list_sources',
      result: 'Refreshed connection match from live schema',
    })
  }

  if (target === 'joins' && inferJoins) {
    try {
      const { inferJoinsForWorkspace } = await import('./inferJoins.js')
      const result = await inferJoinsForWorkspace(workspaceId, {})
      actions.push({
        tool: 'infer_joins',
        result: `Created ${result.created || 0} suggestions (HITL Promote still required for Yellow/Red)`,
        created: result.created || 0,
      })
    } catch (e) {
      actions.push({
        tool: 'infer_joins',
        error: String(e.message || e),
      })
    }
  }

  if (target === 'metrics') {
    try {
      const { createMetric } = await import('./metricDefinitions.js')
      const metrics =
        steps.find((s) => s.kind === 'metrics')?.metrics || metricHints(outcome.prompt)
      for (const m of metrics.slice(0, 3)) {
        try {
          await createMetric(workspaceId, {
            name: m.label || m.id,
            description: m.expressionHint || outcome.prompt,
            expressionSql: m.expressionHint || m.label || '',
            userId,
          })
          actions.push({ tool: 'create_metric', name: m.label || m.id })
        } catch {
          /* duplicate ok */
        }
      }
    } catch (e) {
      actions.push({ tool: 'create_metric', error: String(e.message || e) })
    }
  }

  if (target === 'chart') {
    try {
      const { createShipDraft } = await import('./shipToBi.js')
      const hint = steps.find((s) => s.kind === 'chart')?.chartHint
      const ship = await createShipDraft(workspaceId, {
        title: hint?.title || outcome.prompt.slice(0, 80),
        outcomeId,
        chartType: hint?.chartType || 'bar',
        description: outcome.prompt,
        userId,
      })
      actions.push({
        tool: 'ship_draft',
        shipId: ship.id,
        href: `/ship?id=${ship.id}`,
      })
    } catch (e) {
      actions.push({ tool: 'ship_draft', error: String(e.message || e) })
    }
  }

  // Always refresh plan after tools
  outcome = await refreshOutcome(workspaceId, outcomeId, userId)

  // Agent session is linked for HITL on /agent — do not auto-approve checkpoints here.
  if (outcome.plan?.agentSessionId) {
    actions.push({
      tool: 'agent_linked',
      sessionId: outcome.plan.agentSessionId,
      href: '/agent',
      hint: 'Approve the agent plan on /agent when ready (HITL)',
    })
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'outcome.run_step',
    resourceType: 'outcome',
    resourceId: outcomeId,
    summary: `Outcome step “${target}”`,
    meta: { target, actions },
  })

  return {
    outcome,
    stepId: target,
    actions,
    custody:
      'Schema-first: tools never pull full lake rows; Promote remains HITL for Yellow/Red.',
  }
}

/**
 * Advance the linked Stitch Agent from Outcome (explicit HITL).
 * - approvePlan=true: approve_plan checkpoint → run tools
 * - promote_joins open + no suggested joins left → continue after Promote
 * Never auto-approves without the flag.
 */
export async function advanceOutcomeAgent(
  workspaceId,
  outcomeId,
  { userId = null, approvePlan = false } = {},
) {
  let outcome = await getOutcome(workspaceId, outcomeId)
  if (!outcome) {
    const err = new Error('outcome not found')
    err.status = 404
    throw err
  }

  let sessionId = outcome.plan?.agentSessionId || null
  const actions = []

  if (!sessionId) {
    try {
      const { getWorkspaceSettings } = await import('./workspaceSettings.js')
      const settings = (await getWorkspaceSettings(workspaceId))?.settings
      if (settings?.enableStitchAgent !== true) {
        const err = new Error(
          'Stitch Agent disabled — enable in Settings → AI & Policy',
        )
        err.status = 403
        throw err
      }
      const { createAgentSession } = await import('./agentSessions.js')
      const sourceIds = (outcome.plan?.steps || [])
        .find((s) => s.kind === 'sources')
        ?.connections?.map((c) => c.id)
        .filter(Boolean)
      const session = await createAgentSession(workspaceId, userId, {
        goal: outcome.prompt,
        title: `Outcome · ${outcome.prompt.slice(0, 60)}`,
        sourceIds: sourceIds?.length ? sourceIds : undefined,
      })
      sessionId = session?.id || null
      const plan = {
        ...(outcome.plan || {}),
        agentSessionId: sessionId,
        agentHref: '/agent',
      }
      await query(
        `UPDATE workspace_outcomes
         SET plan_json = $3::jsonb, updated_at = now()
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, outcomeId, JSON.stringify(plan)],
      )
      actions.push({
        tool: 'agent_create',
        sessionId,
        href: '/agent',
        hint: 'Approve the plan (HITL) then advance again',
      })
      outcome = await getOutcome(workspaceId, outcomeId)
    } catch (e) {
      if (e.status) throw e
      actions.push({ tool: 'agent_create', error: String(e.message || e) })
      return { outcome, actions, needsHitl: true }
    }
  }

  const {
    getAgentSession,
    advanceAgentCheckpoint,
    continueAgentAfterPromote,
  } = await import('./agentSessions.js')

  let session = await getAgentSession(workspaceId, sessionId)
  if (!session) {
    const err = new Error('linked agent session not found')
    err.status = 404
    throw err
  }

  const open = (session.checkpoints || []).find((c) => c.status === 'open')

  if (!open) {
    actions.push({
      tool: 'agent_idle',
      status: session.status,
      href: '/agent',
      hint:
        session.status === 'completed'
          ? 'Agent finished — continue Outcome steps / Ship'
          : 'No open checkpoint',
    })
    outcome = await refreshOutcome(workspaceId, outcomeId, userId)
    return { outcome, session, actions, needsHitl: false }
  }

  if (open.type === 'approve_plan') {
    if (!approvePlan) {
      actions.push({
        tool: 'agent_awaiting_plan_approve',
        checkpointId: open.id,
        href: '/agent',
        hint: 'HITL required — click “Approve agent plan & run tools” or open /agent',
      })
      return {
        outcome,
        session,
        actions,
        needsHitl: true,
        checkpoint: open,
      }
    }
    session = await advanceAgentCheckpoint(workspaceId, sessionId, userId, {
      action: 'approve',
      checkpointId: open.id,
    })
    actions.push({
      tool: 'agent_approve_plan',
      status: session.status,
      toolCalls: (session.toolCalls || []).length,
      href: '/agent',
    })
  } else if (open.type === 'promote_joins') {
    const reviews = await listJoinReviews(workspaceId, {
      status: 'suggested',
      limit: 40,
    })
    const pending = reviews.items || []
    if (pending.length > 0) {
      actions.push({
        tool: 'agent_awaiting_promote',
        pendingJoins: pending.length,
        href: '/joins',
        hint: `Promote or Reject ${pending.length} suggested join(s), then advance again`,
      })
      return {
        outcome,
        session,
        actions,
        needsHitl: true,
        checkpoint: open,
      }
    }
    session = await continueAgentAfterPromote(
      workspaceId,
      sessionId,
      userId,
      {},
    )
    actions.push({
      tool: 'agent_continue_after_promote',
      status: session.status,
      jobId: session.result?.jobId || null,
      href: '/agent',
    })
  } else {
    actions.push({
      tool: 'agent_unknown_checkpoint',
      type: open.type,
      href: '/agent',
      hint: 'Resolve checkpoint on /agent',
    })
    return { outcome, session, actions, needsHitl: true, checkpoint: open }
  }

  outcome = await refreshOutcome(workspaceId, outcomeId, userId)
  // Re-attach agent id after refresh (already preserved, but keep explicit)
  if (sessionId && outcome.plan && !outcome.plan.agentSessionId) {
    const plan = {
      ...outcome.plan,
      agentSessionId: sessionId,
      agentHref: '/agent',
    }
    await query(
      `UPDATE workspace_outcomes
       SET plan_json = $3::jsonb, updated_at = now()
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, outcomeId, JSON.stringify(plan)],
    )
    outcome = await getOutcome(workspaceId, outcomeId)
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'outcome.advance_agent',
    resourceType: 'outcome',
    resourceId: outcomeId,
    summary: `Outcome advanced agent ${sessionId}`,
    meta: { actions, sessionStatus: session?.status },
  })

  return {
    outcome,
    session,
    actions,
    needsHitl: session?.status === 'awaiting_checkpoint',
    custody:
      'Agent tools are schema-first; Yellow/Red joins still require human Promote.',
  }
}

/** @deprecated unused helper kept for tests */
export function _effectiveTierForTest(c) {
  return effectiveTier(c)
}
