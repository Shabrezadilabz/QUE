/**
 * Scheduled golden-set join eval (continuous quality).
 */
import { query } from './db.js'
import { evaluateGoldenSet } from './goldenSetEval.js'
import { recordAuditEvent } from './auditLog.js'
import { recordGoldenEvalScore } from './autoPromote.js'
import { handleGoldenEvalFailure } from './goldenEvalAlerts.js'

const DEFAULT_MIN_RECALL = Number(process.env.QUE_GOLDEN_MIN_RECALL || 0.35)

export async function getGoldenEvalSchedule(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM golden_eval_schedules WHERE workspace_id = $1`,
    [workspaceId],
  )
  if (!rows[0]) {
    return {
      workspaceId,
      enabled: false,
      intervalHours: 24,
      pairs: [],
      lastRunAt: null,
      lastRecall: null,
      nextRunAt: null,
    }
  }
  const r = rows[0]
  return {
    workspaceId,
    enabled: Boolean(r.enabled),
    intervalHours: Number(r.interval_hours || 24),
    pairs: Array.isArray(r.pairs_json) ? r.pairs_json : [],
    lastRunAt: r.last_run_at,
    lastRecall: r.last_recall != null ? Number(r.last_recall) : null,
    lastReport: r.last_report_json || {},
    nextRunAt: r.next_run_at,
  }
}

export async function upsertGoldenEvalSchedule(
  workspaceId,
  { enabled, intervalHours, pairs } = {},
) {
  const hours = Math.min(
    168,
    Math.max(1, Number(intervalHours) || 24),
  )
  const pairList = Array.isArray(pairs) ? pairs : []
  const next = enabled
    ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
    : null
  await query(
    `INSERT INTO golden_eval_schedules (
       workspace_id, enabled, interval_hours, pairs_json, next_run_at, updated_at
     ) VALUES ($1,$2,$3,$4::jsonb,$5::timestamptz, now())
     ON CONFLICT (workspace_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       interval_hours = EXCLUDED.interval_hours,
       pairs_json = EXCLUDED.pairs_json,
       next_run_at = CASE
         WHEN EXCLUDED.enabled THEN COALESCE(golden_eval_schedules.next_run_at, EXCLUDED.next_run_at)
         ELSE NULL END,
       updated_at = now()`,
    [
      workspaceId,
      Boolean(enabled),
      hours,
      JSON.stringify(pairList),
      next,
    ],
  )
  return getGoldenEvalSchedule(workspaceId)
}

export async function runGoldenEvalNow(workspaceId, { alertOnDrop = true, userId = null } = {}) {
  const sched = await getGoldenEvalSchedule(workspaceId)
  const pairs = sched.pairs || []
  if (!pairs.length) {
    const err = new Error('No golden pairs configured — set schedule pairs first')
    err.status = 400
    throw err
  }
  const report = await evaluateGoldenSet(workspaceId, pairs)
  const recall = Number(report.recall || 0)
  const prev = sched.lastRecall
  const hours = sched.intervalHours || 24
  const minRecall = DEFAULT_MIN_RECALL
  const passed = recall >= minRecall

  await query(
    `UPDATE golden_eval_schedules SET
       last_run_at = now(),
       last_recall = $2,
       last_report_json = $3::jsonb,
       next_run_at = now() + ($4 || ' hours')::interval,
       updated_at = now()
     WHERE workspace_id = $1`,
    [workspaceId, recall, JSON.stringify({ ...report, passed, minRecall }), String(hours)],
  )

  void recordGoldenEvalScore(workspaceId, {
    ...report,
    pairCount: pairs.length,
  })

  let failure = null
  if (!passed && alertOnDrop) {
    failure = await handleGoldenEvalFailure(workspaceId, {
      report,
      recall,
      minRecall,
      userId,
    })
  } else if (
    alertOnDrop &&
    prev != null &&
    Number.isFinite(prev) &&
    recall + 0.05 < prev
  ) {
    void recordAuditEvent({
      workspaceId,
      action: 'golden_eval.recall_drop',
      resourceType: 'workspace',
      resourceId: workspaceId,
      summary: `Golden-set recall dropped ${(prev * 100).toFixed(1)}% → ${(recall * 100).toFixed(1)}%`,
      meta: { previousRecall: prev, recall },
    })
  }

  void recordAuditEvent({
    workspaceId,
    action: passed ? 'golden_eval.run' : 'golden_eval.run_fail',
    resourceType: 'workspace',
    resourceId: workspaceId,
    summary: passed
      ? `Golden eval recall ${(recall * 100).toFixed(1)}%`
      : `Golden eval failed ${(recall * 100).toFixed(1)}% (min ${(minRecall * 100).toFixed(1)}%)`,
    meta: { recall, pairs: pairs.length, passed, minRecall },
  })

  return { report, recall, previousRecall: prev, passed, minRecall, failure }
}

export async function runGoldenEvalTick() {
  const { rows } = await query(
    `SELECT workspace_id FROM golden_eval_schedules
     WHERE enabled = true
       AND pairs_json <> '[]'::jsonb
       AND (next_run_at IS NULL OR next_run_at <= now())
     LIMIT 20`,
  )
  const results = []
  for (const r of rows) {
    try {
      const out = await runGoldenEvalNow(r.workspace_id)
      results.push({ workspaceId: r.workspace_id, ok: true, recall: out.recall })
    } catch (err) {
      results.push({
        workspaceId: r.workspace_id,
        ok: false,
        error: String(err.message || err),
      })
    }
  }
  return { scanned: rows.length, results }
}

let loopStarted = false
export function startGoldenEvalLoop() {
  if (loopStarted) return
  loopStarted = true
  const ms = Math.max(
    60_000,
    Number(process.env.QUE_GOLDEN_EVAL_TICK_MS) || 15 * 60_000,
  )
  setInterval(() => {
    void runGoldenEvalTick().catch((err) =>
      console.warn('[Que] golden eval tick:', err.message || err),
    )
  }, ms)
  void runGoldenEvalTick().catch(() => undefined)
}
