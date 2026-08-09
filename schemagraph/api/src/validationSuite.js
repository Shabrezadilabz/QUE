/**
 * Phase 3 — Warehouse validation suite generator (runs via live validate).
 * Uniqueness / referential / row-count sanity — customer warehouse, not Que lake.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getJob } from './jobs.js'
import { runJob } from './jobRunner.js'
import { normalizeNotebook } from './jobNotebook.js'

function qIdent(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`
}

/**
 * Build validation checks from job tables + accepted joins.
 */
export async function generateValidationSuite(workspaceId, jobId) {
  const job = await getJob(workspaceId, jobId)
  if (!job) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }

  const tables = Array.isArray(job.tables) ? job.tables.map(String) : []
  const joins = Array.isArray(job.joinsSnapshot) ? job.joinsSnapshot : []

  const checks = []

  for (const table of tables.slice(0, 12)) {
    checks.push({
      id: randomUUID(),
      kind: 'row_count',
      title: `Row count · ${table}`,
      sql: `SELECT COUNT(*) AS row_count FROM ${qIdent(table)}`,
      status: 'pending',
    })
  }

  for (const j of joins.slice(0, 16)) {
    const fromTable = j.fromTable || j.from_table
    const fromCol = j.fromColumn || j.from_column
    const toTable = j.toTable || j.to_table
    const toCol = j.toColumn || j.to_column
    if (!fromTable || !fromCol || !toTable || !toCol) continue

    checks.push({
      id: randomUUID(),
      kind: 'referential',
      title: `Orphans · ${fromTable}.${fromCol} → ${toTable}.${toCol}`,
      sql:
        `SELECT COUNT(*) AS orphan_count\n` +
        `FROM ${qIdent(fromTable)} a\n` +
        `LEFT JOIN ${qIdent(toTable)} b ON a.${qIdent(fromCol)} = b.${qIdent(toCol)}\n` +
        `WHERE b.${qIdent(toCol)} IS NULL`,
      status: 'pending',
    })

    checks.push({
      id: randomUUID(),
      kind: 'uniqueness',
      title: `Dup keys · ${toTable}.${toCol}`,
      sql:
        `SELECT ${qIdent(toCol)} AS k, COUNT(*) AS c\n` +
        `FROM ${qIdent(toTable)}\n` +
        `GROUP BY 1 HAVING COUNT(*) > 1\n` +
        `LIMIT 20`,
      status: 'pending',
    })
  }

  if (checks.length === 0) {
    checks.push({
      id: randomUUID(),
      kind: 'sanity',
      title: 'No tables on job — add tables or promote joins first',
      sql: 'SELECT 1 AS ok',
      status: 'skipped',
    })
  }

  const notebook = normalizeNotebook(job.notebook)
  const existingTitles = new Set(
    notebook.map((c) => String(c.title || '')),
  )
  const suiteCells = checks
    .filter((c) => c.status !== 'skipped')
    .filter((c) => !existingTitles.has(`[validate] ${c.title}`))
    .map((c) => ({
      id: c.id,
      kind: 'sql',
      title: `[validate] ${c.title}`,
      source: c.sql,
    }))

  await query(
    `UPDATE jobs SET
       validation_suite_json = $3::jsonb,
       notebook_json = $4::jsonb,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      jobId,
      JSON.stringify(checks),
      JSON.stringify([...notebook, ...suiteCells]),
    ],
  )

  return {
    jobId,
    checks,
    cellCount: suiteCells.length,
  }
}

/**
 * Run validation suite via live validate (read-only, capped).
 */
export async function runValidationSuite(workspaceId, jobId, opts = {}) {
  const { rows } = await query(
    `SELECT validation_suite_json FROM jobs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, jobId],
  )
  if (!rows.length) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }
  let checks = Array.isArray(rows[0].validation_suite_json)
    ? rows[0].validation_suite_json
    : []
  if (!checks.length || checks.every((c) => c.status === 'skipped')) {
    const generated = await generateValidationSuite(workspaceId, jobId)
    checks = generated.checks
  }

  const run = await runJob(workspaceId, jobId, {
    mode: 'validate',
    scope: 'all',
    trigger: opts.trigger || 'manual',
  })

  const updated = checks.map((c) => ({
    ...c,
    status:
      c.status === 'skipped'
        ? 'skipped'
        : run?.status === 'failed'
          ? 'failed'
          : 'ran',
    lastRunId: run?.id || null,
    lastRunAt: new Date().toISOString(),
  }))

  await query(
    `UPDATE jobs SET validation_suite_json = $3::jsonb, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, jobId, JSON.stringify(updated)],
  )

  return {
    jobId,
    run,
    checks: updated,
  }
}

export async function getValidationSuite(workspaceId, jobId) {
  const { rows } = await query(
    `SELECT validation_suite_json FROM jobs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, jobId],
  )
  if (!rows.length) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }
  return {
    jobId,
    checks: Array.isArray(rows[0].validation_suite_json)
      ? rows[0].validation_suite_json
      : [],
  }
}
