/**
 * Jobs API — draft → freeze contract → export (JSON/SQL/dbt/dbt-pr).
 * Contract = schema snapshot + promoted joins + column types.
 * Notebook cells (notebook_json) are the interactive source of truth (Step 2+).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { buildDbtBundle, loadAcceptedJoins } from './exporters/dbtBundle.js'
import { createGithubPullRequest } from './exporters/githubPr.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import {
  buildContract,
  getLatestSnapshot,
  validateContract,
} from './contracts/contractFreeze.js'
import { emitContractEvent } from './adapters/contractEvents.js'
import {
  buildNotebookFromFields,
  normalizeNotebook,
  primarySqlFromNotebook,
  resolveNotebookInput,
  syncNotebookAndSql,
} from './jobNotebook.js'

function mapJob(row) {
  let notebook = normalizeNotebook(row.notebook_json)
  if (notebook.length === 0) {
    notebook = buildNotebookFromFields({
      title: row.title,
      notes: row.notes,
      steps: row.steps ?? [],
      sqlText: row.sql_text,
      tables: row.tables ?? [],
      status: row.status,
    })
  }
  const notebookPersisted = normalizeNotebook(row.notebook_json).length > 0
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status,
    sources: row.sources ?? [],
    tables: row.tables ?? [],
    steps: row.steps ?? [],
    sqlText: row.sql_text ?? primarySqlFromNotebook(notebook),
    notes: row.notes ?? null,
    notebook,
    notebookPersisted,
    relationshipIds: row.relationship_ids ?? [],
    joinsSnapshot: row.joins_snapshot ?? [],
    schemaSnapshotId: row.schema_snapshot_id ?? null,
    contract: row.contract_json && Object.keys(row.contract_json).length
      ? row.contract_json
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listJobs(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM jobs
     WHERE workspace_id = $1
     ORDER BY updated_at DESC`,
    [workspaceId],
  )
  return rows.map(mapJob)
}

export async function getJob(workspaceId, jobId) {
  const { rows } = await query(
    `SELECT * FROM jobs WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, jobId],
  )
  return rows[0] ? mapJob(rows[0]) : null
}

async function resolveJoinsFreeze(workspaceId, body = {}) {
  if (Array.isArray(body.joinsSnapshot) && body.joinsSnapshot.length > 0) {
    const snapshot = body.joinsSnapshot
    const ids =
      Array.isArray(body.relationshipIds) && body.relationshipIds.length > 0
        ? body.relationshipIds
        : snapshot.map((j) => j.id).filter(Boolean)
    return { relationshipIds: ids, joinsSnapshot: snapshot }
  }

  const tableNames = body.tables ?? []
  const joins = await loadAcceptedJoins(workspaceId, tableNames)
  let filtered = joins
  if (Array.isArray(body.relationshipIds) && body.relationshipIds.length > 0) {
    const want = new Set(body.relationshipIds)
    filtered = joins.filter((j) => want.has(j.id))
  }
  return {
    relationshipIds: filtered.map((j) => j.id),
    joinsSnapshot: filtered,
  }
}

async function resolveFullFreeze(workspaceId, body = {}) {
  const joinsFreeze = await resolveJoinsFreeze(workspaceId, body)
  const contract = await buildContract(workspaceId, {
    tables: body.tables ?? [],
    joinsSnapshot: joinsFreeze.joinsSnapshot,
    relationshipIds: joinsFreeze.relationshipIds,
  })
  const snap = await getLatestSnapshot(workspaceId)
  return {
    ...joinsFreeze,
    joinsSnapshot: contract.joins,
    schemaSnapshotId: snap?.id || null,
    contract,
  }
}

function defaultSteps(tableNames, joinCount, snapshotLabel) {
  return [
    {
      id: 1,
      action: 'freeze_contract',
      detail: snapshotLabel
        ? `Pinned schema snapshot “${snapshotLabel}”`
        : 'Schema metadata loaded for selected tables',
    },
    {
      id: 2,
      action: 'review_joins',
      detail: `${joinCount} accepted join(s) frozen into contract`,
    },
    {
      id: 3,
      action: 'emit_dbt',
      detail: 'Export dbt bundle / GitHub PR (mergeable tests) from Jobs',
    },
  ]
}

export async function createJob(workspaceId, body = {}) {
  const id = body.id || randomUUID()
  const title = String(body.title || 'Untitled Que job').trim()
  const status = body.status && ['draft', 'ready'].includes(body.status)
    ? body.status
    : 'draft'

  const freeze = await resolveFullFreeze(workspaceId, body)
  const tables = body.tables ?? []
  const steps =
    Array.isArray(body.steps) && body.steps.length > 0
      ? body.steps
      : defaultSteps(
          tables,
          freeze.joinsSnapshot.length,
          freeze.contract?.schemaSnapshotLabel,
        )

  const { notebook, sqlText } = resolveNotebookInput(
    { ...body, title, status, tables, steps },
    {},
  )

  const { rows } = await query(
    `INSERT INTO jobs (
       id, workspace_id, title, status, sources, tables, steps, sql_text, notes,
       notebook_json, relationship_ids, joins_snapshot, schema_snapshot_id, contract_json
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14::jsonb)
     RETURNING *`,
    [
      id,
      workspaceId,
      title,
      status,
      JSON.stringify(body.sources ?? []),
      JSON.stringify(tables),
      JSON.stringify(steps),
      sqlText,
      body.notes ?? null,
      JSON.stringify(notebook),
      JSON.stringify(freeze.relationshipIds),
      JSON.stringify(freeze.joinsSnapshot),
      freeze.schemaSnapshotId,
      JSON.stringify(freeze.contract),
    ],
  )
  const job = mapJob(rows[0])
  void emitContractEvent(workspaceId, 'contract.frozen', {
    jobId: job.id,
    title: job.title,
    schemaSnapshotId: job.schemaSnapshotId,
    joinCount: job.joinsSnapshot?.length || 0,
    contract: job.contract,
  })
  return job
}

export async function createStitchJobFromTables(
  workspaceId,
  { tableNames = [], title, notes } = {},
) {
  const names = [...new Set((tableNames || []).map(String).filter(Boolean))]
  if (names.length === 0) {
    const err = new Error('tableNames required')
    err.status = 400
    throw err
  }

  const { rows: objs } = await query(
    `SELECT o.name, c.name AS connection_name
     FROM schema_objects o
     JOIN connections c ON c.id = o.connection_id
     WHERE o.workspace_id = $1 AND lower(o.name) = ANY($2::text[])`,
    [workspaceId, names.map((n) => n.toLowerCase())],
  )

  const sources = [...new Set(objs.map((o) => o.connection_name))]
  const resolvedNames = [...new Set(objs.map((o) => o.name))]
  const useNames = resolvedNames.length > 0 ? resolvedNames : names

  return createJob(workspaceId, {
    title:
      title ||
      (useNames.length <= 2
        ? `Stitch: ${useNames.join(' / ')}`
        : `Stitch: ${useNames.slice(0, 2).join(' / ')} +${useNames.length - 2}`),
    status: 'draft',
    sources,
    tables: useNames,
    notes:
      notes ||
      'Created from canvas. Contract frozen at create — export dbt-pr when ready.',
  })
}

export async function updateJob(workspaceId, jobId, patch = {}) {
  const existing = await getJob(workspaceId, jobId)
  if (!existing) return null

  const title = patch.title != null ? String(patch.title).trim() : existing.title
  const status =
    patch.status &&
    ['draft', 'ready', 'exported', 'archived'].includes(patch.status)
      ? patch.status
      : existing.status
  const sources = patch.sources ?? existing.sources
  const tables = patch.tables ?? existing.tables
  const steps = patch.steps ?? existing.steps
  const notes = patch.notes !== undefined ? patch.notes : existing.notes

  let notebook = existing.notebook
  let sqlText = existing.sqlText

  if (Array.isArray(patch.notebook)) {
    const synced = syncNotebookAndSql(
      patch.notebook,
      patch.sqlText !== undefined
        ? patch.sqlText
        : patch.sql_text !== undefined
          ? patch.sql_text
          : undefined,
    )
    notebook = synced.notebook
    sqlText = synced.sqlText
  } else if (patch.sqlText !== undefined || patch.sql_text !== undefined) {
    const nextSql =
      patch.sqlText !== undefined ? patch.sqlText : patch.sql_text
    const synced = syncNotebookAndSql(existing.notebook, nextSql)
    notebook = synced.notebook
    sqlText = synced.sqlText
  }

  let relationshipIds = existing.relationshipIds
  let joinsSnapshot = existing.joinsSnapshot
  let schemaSnapshotId = existing.schemaSnapshotId
  let contract = existing.contract || {}

  if (
    patch.refreezeJoins ||
    patch.joinsSnapshot ||
    patch.relationshipIds ||
    patch.refreezeContract
  ) {
    const freeze = await resolveFullFreeze(workspaceId, {
      tables,
      joinsSnapshot: patch.joinsSnapshot,
      relationshipIds: patch.relationshipIds,
    })
    relationshipIds = freeze.relationshipIds
    joinsSnapshot = freeze.joinsSnapshot
    schemaSnapshotId = freeze.schemaSnapshotId
    contract = freeze.contract
  }

  const { rows } = await query(
    `UPDATE jobs SET
       title = $3,
       status = $4,
       sources = $5::jsonb,
       tables = $6::jsonb,
       steps = $7::jsonb,
       sql_text = $8,
       notes = $9,
       notebook_json = $10::jsonb,
       relationship_ids = $11::jsonb,
       joins_snapshot = $12::jsonb,
       schema_snapshot_id = $13,
       contract_json = $14::jsonb,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [
      workspaceId,
      jobId,
      title,
      status,
      JSON.stringify(sources),
      JSON.stringify(tables),
      JSON.stringify(steps),
      sqlText,
      notes,
      JSON.stringify(notebook ?? []),
      JSON.stringify(relationshipIds ?? []),
      JSON.stringify(joinsSnapshot ?? []),
      schemaSnapshotId,
      JSON.stringify(contract || {}),
    ],
  )
  return mapJob(rows[0])
}

/**
 * @param {'json' | 'sql' | 'dbt' | 'dbt-pr'} format
 */
export async function exportJob(workspaceId, jobId, format = 'json', options = {}) {
  let job = await getJob(workspaceId, jobId)
  if (!job) return null

  // Ensure contract exists / is current enough
  if (!job.contract || !job.contract.version || !job.joinsSnapshot?.length) {
    job = await updateJob(workspaceId, jobId, { refreezeContract: true })
  }

  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings ?? {}
  const blockOnDrift = settings.blockExportOnDrift !== false

  const validation = await validateContract(workspaceId, job.contract, {
    blockOnHigh: blockOnDrift,
  })

  if (validation.blocking && !options.force) {
    const err = new Error(
      `Export blocked by contract/drift: ${validation.errors.join('; ')}`,
    )
    err.status = 409
    err.validation = validation
    throw err
  }

  if (format === 'dbt' || format === 'dbt-pr') {
    return exportJobDbtLayer(workspaceId, job, format, options, validation)
  }

  const payload = {
    format,
    exportedAt: new Date().toISOString(),
    contractValidation: validation,
    job: {
      id: job.id,
      title: job.title,
      status: job.status,
      sources: job.sources,
      tables: job.tables,
      steps: job.steps,
      notes: job.notes,
      sql: job.sqlText,
      notebook: job.notebook,
      relationshipIds: job.relationshipIds,
      joinsSnapshot: job.joinsSnapshot,
      schemaSnapshotId: job.schemaSnapshotId,
      contract: job.contract,
    },
  }

  if (format === 'sql') {
    payload.sql =
      primarySqlFromNotebook(job.notebook) ||
      job.sqlText ||
      `-- Que job: ${job.title}\n` +
        `-- Contract snapshot: ${job.schemaSnapshotId || 'none'}\n` +
        job.steps
          .map((s) => `-- ${s.id}. ${s.action}: ${s.detail}`)
          .join('\n') +
        '\n-- (no SQL draft attached — add joins on the canvas / chat)'
  }

  const updated = await updateJob(workspaceId, jobId, { status: 'exported' })
  void emitContractEvent(workspaceId, 'contract.exported', {
    jobId: job.id,
    format,
    schemaSnapshotId: job.schemaSnapshotId,
    validation,
  })
  return { job: updated, export: payload }
}

async function exportJobDbtLayer(
  workspaceId,
  job,
  format,
  options = {},
  validation = null,
) {
  let jobForBundle = job
  if (!job.joinsSnapshot || job.joinsSnapshot.length === 0 || !job.contract) {
    jobForBundle = await updateJob(workspaceId, job.id, {
      refreezeContract: true,
    })
  }

  const bundle = await buildDbtBundle(workspaceId, jobForBundle)
  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings ?? {}

  let github = {
    opened: false,
    reason:
      format === 'dbt'
        ? 'Bundle only — use format dbt-pr to open a GitHub pull request'
        : undefined,
  }

  if (format === 'dbt-pr') {
    const owner = String(options.githubOwner || settings.githubOwner || '').trim()
    const repo = String(options.githubRepo || settings.githubRepo || '').trim()
    const baseBranch = String(
      options.githubBaseBranch || settings.githubBaseBranch || 'main',
    ).trim()
    const branchName =
      String(options.branchName || '').trim() ||
      `que/${bundle.modelName}-${Date.now().toString(36)}`

    const prBody = [
      `## Que dbt export (merge-ready)`,
      ``,
      `Schema-only stitch job → reviewable dbt model + staging stubs + tests + CI workflow.`,
      ``,
      `- **Job:** ${job.title} (\`${job.id}\`)`,
      `- **Model:** \`${bundle.modelName}\``,
      `- **Frozen joins:** ${bundle.joins.length}`,
      `- **Schema snapshot:** \`${jobForBundle.schemaSnapshotId || 'n/a'}\``,
      `- **Policy:** ${bundle.attestation.policy}`,
      ``,
      validation?.warnings?.length
        ? `### Contract warnings\n${validation.warnings.map((w) => `- ${w}`).join('\n')}\n`
        : '',
      `### Attestation`,
      bundle.attestation.claim,
      ``,
      `### Merge checklist`,
      `- [ ] Review SQL joins against promoted Que relations`,
      `- [ ] Confirm staging stubs / sources match warehouse`,
      `- [ ] CI \`dbt parse\` / tests green`,
      ``,
      `Generated by Que. Do not merge without review.`,
    ]
      .filter(Boolean)
      .join('\n')

    try {
      github = await createGithubPullRequest({
        token: process.env.GITHUB_TOKEN,
        owner,
        repo,
        baseBranch,
        branchName,
        title: `Que: ${job.title}`,
        body: prBody,
        files: bundle.files,
      })
    } catch (err) {
      github = {
        opened: false,
        reason: String(err.message || err),
      }
    }
  }

  const updated = await updateJob(workspaceId, jobForBundle.id, {
    status: 'exported',
  })

  void emitContractEvent(workspaceId, 'contract.exported', {
    jobId: job.id,
    format,
    modelName: bundle.modelName,
    schemaSnapshotId: jobForBundle.schemaSnapshotId,
    githubOpened: Boolean(github.opened),
    validation,
  })

  return {
    job: updated,
    export: {
      format,
      exportedAt: bundle.attestation.exportedAt,
      modelName: bundle.modelName,
      modelsPath: bundle.modelsPath,
      joins: bundle.joins,
      attestation: bundle.attestation,
      contract: jobForBundle.contract,
      contractValidation: validation,
      files: bundle.files,
      github,
      job: {
        id: job.id,
        title: job.title,
        sources: job.sources,
        tables: job.tables,
        relationshipIds: jobForBundle.relationshipIds,
        schemaSnapshotId: jobForBundle.schemaSnapshotId,
      },
    },
  }
}
