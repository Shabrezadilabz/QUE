/**
 * Productized data contract tests — run suite and persist history.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { runValidationSuite, getValidationSuite } from './validationSuite.js'
import { recordAuditEvent } from './auditLog.js'

export async function runAndStoreContractTests(
  workspaceId,
  jobId,
  { userId = null } = {},
) {
  let suite = await getValidationSuite(workspaceId, jobId)
  if (!suite?.tests?.length) {
    const { generateValidationSuite } = await import('./validationSuite.js')
    suite = await generateValidationSuite(workspaceId, jobId)
  }
  const result = await runValidationSuite(workspaceId, jobId)
  const tests = result.results || result.tests || []
  const failed = tests.filter(
    (t) => t.status === 'failed' || t.ok === false,
  ).length
  const status = failed > 0 ? 'failed' : 'passed'
  const id = randomUUID()
  await query(
    `INSERT INTO contract_test_runs (
       id, workspace_id, job_id, status, summary, results_json, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [
      id,
      workspaceId,
      jobId,
      status,
      status === 'passed'
        ? `All ${tests.length} contract test(s) passed`
        : `${failed}/${tests.length} contract test(s) failed`,
      JSON.stringify(tests),
      userId,
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'contract_tests.run',
    resourceType: 'job',
    resourceId: jobId,
    summary: `Contract tests ${status}`,
    meta: { runId: id, failed, total: tests.length },
  })
  return {
    id,
    status,
    summary:
      status === 'passed'
        ? `All ${tests.length} contract test(s) passed`
        : `${failed}/${tests.length} failed`,
    results: tests,
  }
}

export async function listContractTestRuns(workspaceId, { limit = 30 } = {}) {
  const { rows } = await query(
    `SELECT r.*, j.title AS job_title
     FROM contract_test_runs r
     LEFT JOIN jobs j ON j.id = r.job_id
     WHERE r.workspace_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(100, Math.max(1, Number(limit) || 30))],
  )
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    jobTitle: r.job_title,
    status: r.status,
    summary: r.summary,
    results: Array.isArray(r.results_json) ? r.results_json : [],
    createdAt: r.created_at,
  }))
}
