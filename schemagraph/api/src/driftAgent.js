/**
 * Phase 3 — Drift agent: propose remaps / re-freeze from open drift events.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import {
  listRecentDrift,
  acknowledgeDrift,
} from './contracts/contractFreeze.js'
import { updateJob } from './jobs.js'
import { runMappingAssist } from './mappingAssist.js'
import { createTransformDraft } from './transformDrafts.js'
import { createJob } from './jobs.js'
import { buildNotebookFromFields } from './jobNotebook.js'

function mapSuggestion(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    driftEventId: r.drift_event_id,
    jobId: r.job_id,
    kind: r.kind,
    status: r.status,
    summary: r.summary,
    proposal: r.proposal_json || {},
    createdBy: r.created_by,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }
}

export async function listDriftFixSuggestions(workspaceId, { status = 'proposed' } = {}) {
  const params = [workspaceId]
  let where = 'workspace_id = $1'
  if (status && status !== 'all') {
    params.push(status)
    where += ` AND status = $${params.length}`
  }
  const { rows } = await query(
    `SELECT * FROM drift_fix_suggestions
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 80`,
    params,
  )
  return rows.map(mapSuggestion)
}

/**
 * Scan open drift + mapping assist → create fix suggestions.
 */
export async function proposeDriftFixes(workspaceId, userId = null) {
  const drift = await listRecentDrift(workspaceId, 40).catch(() => [])
  const open = (Array.isArray(drift) ? drift : []).filter(
    (e) => !e.acknowledged && (e.severity === 'high' || e.severity === 'warn'),
  )

  let mapping = { renames: [], joins: [] }
  try {
    mapping = await runMappingAssist(workspaceId, { refreshJoins: false })
  } catch {
    /* optional */
  }

  const created = []

  for (const event of open.slice(0, 20)) {
    const summary =
      event.summary || `Drift ${event.code || event.severity} needs review`
    const proposal = {
      driftCode: event.code || null,
      severity: event.severity,
      detail: event.detail || {},
      suggestedActions: [
        'Acknowledge drift after confirming intentional schema change',
        'Re-run join inference if keys renamed',
        'Re-freeze affected job contracts',
      ],
      renameHints: (mapping.renames || []).slice(0, 8),
    }

    const { rows: existing } = await query(
      `SELECT id FROM drift_fix_suggestions
       WHERE workspace_id = $1 AND drift_event_id = $2 AND status = 'proposed'
       LIMIT 1`,
      [workspaceId, event.id],
    )
    if (existing.length) continue

    const id = randomUUID()
    await query(
      `INSERT INTO drift_fix_suggestions (
         id, workspace_id, drift_event_id, kind, status, summary, proposal_json, created_by
       ) VALUES ($1,$2,$3,'remap','proposed',$4,$5::jsonb,$6)`,
      [
        id,
        workspaceId,
        event.id,
        summary.slice(0, 400),
        JSON.stringify(proposal),
        userId,
      ],
    )
    created.push(id)
  }

  if (open.some((e) => e.severity === 'high')) {
    const { rows: jobs } = await query(
      `SELECT id, title FROM jobs
       WHERE workspace_id = $1 AND status IN ('ready','exported','draft')
       ORDER BY updated_at DESC LIMIT 8`,
      [workspaceId],
    )
    for (const job of jobs) {
      const { rows: dup } = await query(
        `SELECT id FROM drift_fix_suggestions
         WHERE workspace_id = $1 AND job_id = $2 AND kind = 'refreeze'
           AND status = 'proposed'
         LIMIT 1`,
        [workspaceId, job.id],
      )
      if (dup.length) continue

      const id = randomUUID()
      await query(
        `INSERT INTO drift_fix_suggestions (
           id, workspace_id, job_id, kind, status, summary, proposal_json, created_by
         ) VALUES ($1,$2,$3,'refreeze','proposed',$4,$5::jsonb,$6)`,
        [
          id,
          workspaceId,
          job.id,
          `Re-freeze contract for job “${job.title}” after drift`,
          JSON.stringify({
            jobId: job.id,
            action: 'refreeze',
            suggestedActions: ['Accept to re-freeze accepted joins into the job contract'],
          }),
          userId,
        ],
      )
      created.push(id)
    }
  }

  return {
    scannedDrift: open.length,
    created: created.length,
    suggestionIds: created,
  }
}

/**
 * S7.4 — Create HITL transform draft or job from a drift fix suggestion.
 */
export async function createDriftFixDraft(
  workspaceId,
  suggestionId,
  userId = null,
  { kind = 'transform' } = {},
) {
  const { rows } = await query(
    `SELECT * FROM drift_fix_suggestions
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, suggestionId],
  )
  if (!rows.length) {
    const err = new Error('suggestion not found')
    err.status = 404
    throw err
  }
  const s = rows[0]
  const proposal = s.proposal_json || {}
  const summary = s.summary || 'Drift fix draft'
  const prompt = `Fix schema drift: ${summary}. Review rename hints and re-promote joins before apply.`

  if (kind === 'job' || s.kind === 'refreeze') {
    const sqlText =
      proposal.sql ||
      `-- Drift fix for ${s.drift_event_id || s.job_id || 'workspace'}\n-- ${summary}\nSELECT 1 AS drift_fix_placeholder;`
    const notebook = buildNotebookFromFields({
      title: `[Drift fix] ${summary.slice(0, 80)}`,
      notes: `HITL drift fix job — ${summary}`,
      sqlText,
      tables: [],
    })
    const job = await createJob(workspaceId, {
      title: `[Drift fix] ${summary.slice(0, 100)}`,
      notebook,
      sqlText,
      notes: summary,
    })
    await query(
      `UPDATE drift_fix_suggestions
       SET proposal_json = proposal_json || $3::jsonb, updated_at = now()
       WHERE workspace_id = $1 AND id = $2`,
      [
        workspaceId,
        suggestionId,
        JSON.stringify({ jobId: job.id, href: `/jobs/${job.id}/notebook` }),
      ],
    )
    return { kind: 'job', job, href: `/jobs/${job.id}/notebook` }
  }

  const draft = await createTransformDraft(workspaceId, {
    prompt,
    title: summary.slice(0, 120),
    userId,
  })
  await query(
    `UPDATE drift_fix_suggestions
     SET proposal_json = proposal_json || $3::jsonb, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      suggestionId,
      JSON.stringify({ draftId: draft.id, href: `/proposals?draft=${draft.id}` }),
    ],
  )
  return { kind: 'transform', draft, href: `/proposals?draft=${draft.id}` }
}

/**
 * Accept a suggestion: ack drift and/or re-freeze job.
 */
export async function resolveDriftFix(
  workspaceId,
  suggestionId,
  userId,
  { action = 'accept' } = {},
) {
  const { rows } = await query(
    `SELECT * FROM drift_fix_suggestions
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, suggestionId],
  )
  if (!rows.length) {
    const err = new Error('suggestion not found')
    err.status = 404
    throw err
  }
  const s = rows[0]
  if (s.status !== 'proposed') {
    const err = new Error('suggestion already resolved')
    err.status = 400
    throw err
  }

  if (action === 'reject' || action === 'dismiss') {
    const next = action === 'reject' ? 'rejected' : 'dismissed'
    await query(
      `UPDATE drift_fix_suggestions
       SET status = $3, resolved_by = $4, resolved_at = now()
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, suggestionId, next, userId],
    )
    return mapSuggestion({ ...s, status: next })
  }

  const result = { acknowledged: false, refrozen: false }

  if (s.drift_event_id) {
    try {
      await acknowledgeDrift(workspaceId, s.drift_event_id)
      result.acknowledged = true
    } catch {
      /* may already be ack */
    }
  }

  if (s.kind === 'refreeze' && s.job_id) {
    try {
      await updateJob(workspaceId, s.job_id, { refreezeContract: true })
      result.refrozen = true
    } catch (err) {
      result.refreezeError = String(err.message || err)
    }
  }

  await query(
    `UPDATE drift_fix_suggestions
     SET status = 'accepted',
         resolved_by = $3,
         resolved_at = now(),
         proposal_json = proposal_json || $4::jsonb
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, suggestionId, userId, JSON.stringify({ resolveResult: result })],
  )

  const { rows: after } = await query(
    `SELECT * FROM drift_fix_suggestions WHERE id = $1`,
    [suggestionId],
  )
  return { suggestion: mapSuggestion(after[0]), result }
}
