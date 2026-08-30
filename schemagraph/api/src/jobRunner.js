/**
 * Job notebook runner — dry-run (Step 4) + live read-only SQL (Step 5).
 * Live mode: SELECT/WITH only, capped rows, Postgres or Databricks.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getJob } from './jobs.js'
import { normalizeNotebook, extractExecutableSql } from './jobNotebook.js'
import { validateContract } from './contracts/contractFreeze.js'
import { buildSchemaContextPack } from './schemaContext.js'
import { buildSamplePreview, SCHEMA_SAMPLE_MAX_ROWS } from './samplePreview.js'
import {
  executeLiveSql,
  LIVE_VALIDATE_MAX_ROWS,
  resolveLiveTarget,
} from './liveExec.js'

const WRITE_RE =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|call|copy)\b/i

function mapRun(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    jobId: row.job_id,
    status: row.status,
    scope: row.scope,
    cellId: row.cell_id ?? null,
    mode: row.mode,
    summary: row.summary ?? null,
    logs: Array.isArray(row.logs_json) ? row.logs_json : [],
    output:
      row.output_json && typeof row.output_json === 'object'
        ? row.output_json
        : {},
    trigger: row.trigger || 'manual',
    attempt: row.attempt ?? 1,
    parentRunId: row.parent_run_id ?? null,
    executionTarget: row.execution_target || 'que',
    externalRef: row.external_ref || null,
    externalStatus: row.external_status || null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  }
}

function pushLog(logs, level, message) {
  logs.push({
    ts: new Date().toISOString(),
    level,
    message: String(message),
  })
}

function extractTableRefs(sql, knownTables) {
  const lower = String(sql || '').toLowerCase()
  const hits = []
  for (const name of knownTables) {
    const n = String(name)
    if (!n) continue
    const re = new RegExp(
      `\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    )
    if (re.test(lower)) hits.push(n)
  }
  return hits
}

function lintSql(sql, { forLive = false } = {}) {
  const text = String(sql || '').trim()
  const issues = []
  if (!text) {
    issues.push({ level: 'error', message: 'SQL cell is empty' })
    return issues
  }
  if (
    text === 'SELECT 1 AS que_notebook_stub;' ||
    /que_notebook_stub/i.test(text)
  ) {
    issues.push({
      level: forLive ? 'error' : 'warn',
      message: forLive
        ? 'Stub SQL blocked for live run — replace with a real query'
        : 'Stub SQL detected — replace with real stitch query before deploy',
    })
  }
  if (WRITE_RE.test(text)) {
    issues.push({
      level: 'error',
      message:
        'Blocked: write/DDL keywords detected (INSERT/UPDATE/DELETE/DROP/…). Que runs are read-only.',
    })
  }
  if (!/\bselect\b/i.test(text) && !/\bwith\b/i.test(text)) {
    issues.push({
      level: forLive ? 'error' : 'warn',
      message: 'No SELECT/WITH found — expected a read query',
    })
  }
  if ((text.match(/;/g) || []).length > 1) {
    issues.push({
      level: forLive ? 'error' : 'warn',
      message:
        'Multiple statements detected — only a single statement is allowed for live run',
    })
  }
  return issues
}

async function persistRun(runId, fields) {
  const { rows } = await query(
    `UPDATE job_runs SET
       status = COALESCE($2, status),
       summary = COALESCE($3, summary),
       logs_json = COALESCE($4::jsonb, logs_json),
       output_json = COALESCE($5::jsonb, output_json),
       started_at = COALESCE($6, started_at),
       finished_at = COALESCE($7, finished_at)
     WHERE id = $1
     RETURNING *`,
    [
      runId,
      fields.status ?? null,
      fields.summary ?? null,
      fields.logs ? JSON.stringify(fields.logs) : null,
      fields.output ? JSON.stringify(fields.output) : null,
      fields.startedAt ?? null,
      fields.finishedAt ?? null,
    ],
  )
  return rows[0] ? mapRun(rows[0]) : null
}

/**
 * @param {string} workspaceId
 * @param {string} jobId
 * @param {{ scope?: 'all'|'cell', cellId?: string|null, notebook?: unknown, mode?: 'dry_run'|'live', connectionId?: string, maxRows?: number, trigger?: string, attempt?: number, parentRunId?: string|null }} opts
 */
export async function runJob(workspaceId, jobId, opts = {}) {
  const job = await getJob(workspaceId, jobId)
  if (!job) {
    const err = new Error('job not found')
    err.status = 404
    throw err
  }

  const scope = opts.scope === 'cell' ? 'cell' : 'all'
  // validate ≡ live with product row cap (20)
  const mode =
    opts.mode === 'live' || opts.mode === 'validate' ? 'live' : 'dry_run'
  if (mode === 'live') {
    try {
      const { getWorkspaceSettings } = await import('./workspaceSettings.js')
      const settings = (await getWorkspaceSettings(workspaceId))?.settings
      if (settings?.enableLiveValidate === false) {
        const err = new Error(
          'Live validate is disabled for this workspace (Settings → AI & Policy)',
        )
        err.status = 403
        throw err
      }
    } catch (err) {
      if (err.status) throw err
    }
  }
  const maxRows = Math.min(
    Math.max(
      Number(opts.maxRows ?? LIVE_VALIDATE_MAX_ROWS),
      1,
    ),
    LIVE_VALIDATE_MAX_ROWS,
  )

  const notebook = normalizeNotebook(
    Array.isArray(opts.notebook) && opts.notebook.length
      ? opts.notebook
      : job.notebook,
  )
  if (notebook.length === 0) {
    const err = new Error('notebook has no cells')
    err.status = 400
    throw err
  }

  let cells = notebook
  if (scope === 'cell') {
    const cellId = opts.cellId
    if (!cellId) {
      const err = new Error('cellId required when scope=cell')
      err.status = 400
      throw err
    }
    const found = notebook.find((c) => c.id === cellId)
    if (!found) {
      const err = new Error('cell not found in notebook')
      err.status = 404
      throw err
    }
    cells = [found]
  }

  let liveTarget = null
  if (mode === 'live') {
    liveTarget = await resolveLiveTarget(
      workspaceId,
      job,
      opts.connectionId || null,
    )
  }

  const runId = randomUUID()
  const trigger = ['manual', 'schedule', 'retry', 'webhook'].includes(
    String(opts.trigger || ''),
  )
    ? String(opts.trigger)
    : 'manual'
  const attempt = Math.max(1, Number(opts.attempt) || 1)
  const parentRunId = opts.parentRunId || null
  const logs = []
  pushLog(
    logs,
    'info',
    `Run queued · mode=${mode} · scope=${scope} · trigger=${trigger} · attempt=${attempt}`,
  )
  if (mode === 'live') {
    pushLog(
      logs,
      'info',
      `Live validate (read-only) on “${liveTarget.name}” (${liveTarget.type}) · max ${maxRows} rows`,
    )
  } else {
    pushLog(
      logs,
      'info',
      `Job “${job.title}” · ${cells.length} cell(s) · schema-only dry-run (no warehouse)`,
    )
  }

  const { rows: inserted } = await query(
    `INSERT INTO job_runs (
       id, workspace_id, job_id, status, scope, cell_id, mode, logs_json,
       started_at, trigger, attempt, parent_run_id
     ) VALUES ($1,$2,$3,'running',$4,$5,$6,$7::jsonb, now(), $8, $9, $10)
     RETURNING *`,
    [
      runId,
      workspaceId,
      jobId,
      scope,
      scope === 'cell' ? opts.cellId || null : null,
      mode,
      JSON.stringify(logs),
      trigger,
      attempt,
      parentRunId,
    ],
  )
  let run = mapRun(inserted[0])

  const cellResults = []
  const samplePreviews = []
  const liveResults = []
  let hardFail = false

  try {
    pushLog(logs, 'info', 'Loading schema context pack…')
    const pack = await buildSchemaContextPack(workspaceId)
    const packByName = new Map(
      (pack.tables || []).map((t) => [String(t.name).toLowerCase(), t]),
    )

    if (job.contract) {
      pushLog(logs, 'info', 'Validating frozen contract…')
      const validation = await validateContract(workspaceId, job.contract, {
        blockOnHigh: false,
      })
      if (validation.errors?.length) {
        for (const e of validation.errors) {
          pushLog(logs, 'warn', `Contract: ${e}`)
        }
      }
      if (validation.warnings?.length) {
        for (const w of validation.warnings) {
          pushLog(logs, 'warn', `Contract warning: ${w}`)
        }
      }
      if (!validation.errors?.length) {
        pushLog(logs, 'info', 'Contract check passed')
      }
    } else {
      pushLog(
        logs,
        'warn',
        'No frozen contract on job — skipping contract check',
      )
    }

    const knownTables = [
      ...new Set([
        ...(job.tables || []),
        ...(pack.tables || []).map((t) => t.name),
      ]),
    ]

    for (const cell of cells) {
      pushLog(
        logs,
        'info',
        `── Cell [${cell.kind}] ${cell.title || cell.id} ──`,
      )

      if (cell.kind === 'markdown') {
        pushLog(logs, 'info', 'Skipped markdown cell')
        cellResults.push({
          cellId: cell.id,
          kind: cell.kind,
          title: cell.title,
          status: 'skipped',
          issues: [],
        })
        continue
      }

      const sqlText = extractExecutableSql(cell.content, cell.kind)
      if (!sqlText) {
        const hint =
          cell.kind === 'python' || cell.kind === 'scala'
            ? `${cell.kind} cell has no SQL — use %sql, spark.sql("""SELECT …"""), or a plain SELECT`
            : 'SQL cell is empty'
        pushLog(logs, 'warn', hint)
        cellResults.push({
          cellId: cell.id,
          kind: cell.kind,
          title: cell.title,
          status: 'skipped',
          issues: [{ level: 'warn', message: hint }],
        })
        continue
      }

      if (cell.kind === 'python' || cell.kind === 'scala') {
        pushLog(
          logs,
          'info',
          `Extracted SQL from ${cell.kind} cell for read-only run`,
        )
      }

      const issues = lintSql(sqlText, { forLive: mode === 'live' })
      for (const issue of issues) {
        pushLog(logs, issue.level, issue.message)
        if (issue.level === 'error') hardFail = true
      }

      const refs = extractTableRefs(sqlText, knownTables)
      if (refs.length) {
        pushLog(logs, 'info', `Referenced tables: ${refs.join(', ')}`)
      } else {
        pushLog(
          logs,
          'warn',
          'No known job/schema table names detected in SQL',
        )
      }

      if (mode === 'dry_run') {
        for (const name of refs.slice(0, 3)) {
          const full = packByName.get(String(name).toLowerCase())
          if (!full) continue
          const preview = buildSamplePreview(full, SCHEMA_SAMPLE_MAX_ROWS)
          if (preview) {
            samplePreviews.push({
              ...preview,
              cellId: cell.id,
              cellTitle: cell.title,
            })
            pushLog(
              logs,
              'info',
              `Sample preview ready for ${name} (${preview.rowCount} row(s), schema-samples-only)`,
            )
          }
        }
      }

      let cellStatus = issues.some((i) => i.level === 'error')
        ? 'failed'
        : 'ok'

      if (mode === 'live' && cellStatus !== 'failed') {
        try {
          pushLog(logs, 'info', 'Executing read-only SQL on source…')
          const live = await executeLiveSql(liveTarget, sqlText, {
            maxRows,
          })
          liveResults.push({
            cellId: cell.id,
            cellTitle: cell.title,
            connectionId: live.connectionId,
            connectionName: live.connectionName,
            engine: live.engine,
            columns: live.columns,
            rows: live.rows,
            rowCount: live.rowCount,
            truncated: live.truncated,
            durationMs: live.durationMs,
            sqlExecuted: live.sqlExecuted,
            policy: 'read-only-capped',
          })
          pushLog(
            logs,
            'info',
            `Live result: ${live.rowCount} row(s) in ${live.durationMs}ms` +
              (live.truncated ? ' (truncated)' : ''),
          )
          cellStatus = 'ok'
        } catch (execErr) {
          hardFail = true
          cellStatus = 'failed'
          const msg = String(execErr.message || execErr)
          pushLog(logs, 'error', `Live exec failed: ${msg}`)
          issues.push({ level: 'error', message: msg })
        }
      }

      cellResults.push({
        cellId: cell.id,
        kind: cell.kind,
        title: cell.title,
        status: cellStatus,
        issues,
        tableRefs: refs,
      })
    }

    const status = hardFail ? 'failed' : 'succeeded'
    const sqlCells = cellResults.filter(
      (c) => c.kind === 'sql' || c.kind === 'python' || c.kind === 'scala',
    )
    const summary = hardFail
      ? `${mode === 'live' ? 'Live' : 'Dry'}-run failed · ${sqlCells.filter((c) => c.status === 'failed').length} cell error(s)`
      : mode === 'live'
        ? `Validate succeeded · ${liveResults.length} result set(s) · ≤${LIVE_VALIDATE_MAX_ROWS} rows`
        : `Dry-run succeeded · ${sqlCells.length} SQL cell(s) checked`

    pushLog(logs, hardFail ? 'error' : 'info', summary)

    const output = {
      mode,
      policy:
        mode === 'live' ? 'read-only-live-capped' : 'schema-only-dry-run',
      note:
        mode === 'live'
          ? `Executed SELECT/WITH only against the source. Showing up to ${LIVE_VALIDATE_MAX_ROWS} rows; no writes.`
          : `No warehouse query executed. Schema previews use up to ${SCHEMA_SAMPLE_MAX_ROWS} capped sync samples.`,
      cellResults,
      samplePreviews,
      liveResults,
      connection: liveTarget
        ? {
            id: liveTarget.id,
            name: liveTarget.name,
            type: liveTarget.type,
          }
        : null,
      contractSnapshotId: job.schemaSnapshotId || null,
    }

    run = await persistRun(runId, {
      status,
      summary,
      logs,
      output,
      finishedAt: new Date().toISOString(),
    })

    // Offer B — land live results OR dry-run sample previews into managed plane
    if (status === 'succeeded') {
      try {
        const { landManagedDatasetFromJobRun } = await import(
          './managedDataPlane.js'
        )
        const land = await landManagedDatasetFromJobRun(workspaceId, {
          jobId,
          runId,
          jobTitle: job.title,
          liveResults,
          samplePreviews,
          userId: opts.userId || null,
        })
        if (land.landed && land.item) {
          pushLog(
            logs,
            'info',
            `Managed data plane: landed “${land.item.name}” via ${land.source} (${land.item.rowCount} rows) · AI access denied`,
          )
          run = await persistRun(runId, {
            status,
            summary: `${summary} · managed:${land.item.slug}`,
            logs,
            output: {
              ...output,
              managedDatasetId: land.item.id,
              managedLandSource: land.source,
            },
            finishedAt: new Date().toISOString(),
          })
        }
      } catch (landErr) {
        pushLog(
          logs,
          'warn',
          `Managed land skipped: ${landErr.message || landErr}`,
        )
      }
    }
  } catch (err) {
    pushLog(logs, 'error', String(err.message || err))
    run = await persistRun(runId, {
      status: 'failed',
      summary: `Run crashed: ${err.message || err}`,
      logs,
      output: {
        mode,
        cellResults,
        samplePreviews,
        liveResults,
        error: String(err.message || err),
      },
      finishedAt: new Date().toISOString(),
    })
  }

  return run
}

export async function listJobRuns(workspaceId, jobId, limit = 20) {
  const { rows } = await query(
    `SELECT * FROM job_runs
     WHERE workspace_id = $1 AND job_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [workspaceId, jobId, Math.min(50, Math.max(1, limit))],
  )
  return rows.map(mapRun)
}

/**
 * Workspace-wide run history for Jobs monitor (Wave 4.2).
 * @param {string} workspaceId
 * @param {{ limit?: number, jobId?: string }} [opts]
 */
export async function listWorkspaceJobRuns(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100)
  const params = [workspaceId]
  let jobSql = ''
  if (opts.jobId) {
    params.push(opts.jobId)
    jobSql = ` AND r.job_id = $${params.length}`
  }
  params.push(limit)
  const { rows } = await query(
    `SELECT r.*, j.title AS job_title
     FROM job_runs r
     JOIN jobs j ON j.id = r.job_id
     WHERE r.workspace_id = $1
       ${jobSql}
     ORDER BY r.created_at DESC
     LIMIT $${params.length}`,
    params,
  )
  return rows.map((row) => ({
    ...mapRun(row),
    jobTitle: row.job_title || null,
  }))
}

export async function getJobRun(workspaceId, jobId, runId) {
  const { rows } = await query(
    `SELECT * FROM job_runs
     WHERE workspace_id = $1 AND job_id = $2 AND id = $3`,
    [workspaceId, jobId, runId],
  )
  return rows[0] ? mapRun(rows[0]) : null
}
