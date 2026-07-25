/**
 * dbt export layer — mergeable model + staging stubs + sources + tests + CI.
 * Always from frozen job contract / accepted joins. Schema-only policy.
 */
import { query } from '../db.js'
import { getWorkspaceSettings } from '../workspaceSettings.js'

function slugify(input) {
  const s = String(input || 'stitch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return s || 'stitch'
}

/**
 * Load accepted (promoted) joins, optionally filtered to job table names.
 */
export async function loadAcceptedJoins(workspaceId, tableNames = []) {
  const { rows } = await query(
    `SELECT r.id, r.confidence, r.label, r.join_criteria, r.ai_notes,
            fo.name AS from_table, fc.name AS from_column, fc.data_type AS from_type,
            too.name AS to_table, tc.name AS to_column, tc.data_type AS to_type
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects too ON too.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1 AND r.status = 'accepted'
     ORDER BY r.confidence DESC NULLS LAST, fo.name, too.name`,
    [workspaceId],
  )

  const wanted = new Set(
    (tableNames || []).map((t) => String(t).toLowerCase()).filter(Boolean),
  )

  const mapped = rows.map((r) => ({
    id: r.id,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    label: r.label,
    joinCriteria: r.join_criteria,
    aiNotes: r.ai_notes,
    fromTable: r.from_table,
    fromColumn: r.from_column,
    fromType: r.from_type,
    toTable: r.to_table,
    toColumn: r.to_column,
    toType: r.to_type,
  }))

  if (wanted.size === 0) return mapped

  return mapped.filter(
    (j) =>
      wanted.has(String(j.fromTable).toLowerCase()) ||
      wanted.has(String(j.toTable).toLowerCase()),
  )
}

function normalizeJoins(job) {
  let joins = Array.isArray(job.joinsSnapshot) ? job.joinsSnapshot : []
  if (joins.length === 0 && Array.isArray(job.contract?.joins)) {
    joins = job.contract.joins
  }
  return joins.map((j) => ({
    id: j.id,
    confidence: j.confidence ?? null,
    label: j.label,
    joinCriteria: j.joinCriteria ?? j.join_criteria,
    aiNotes: j.aiNotes ?? j.ai_notes,
    fromTable: j.fromTable ?? j.from_table,
    fromColumn: j.fromColumn ?? j.from_column,
    fromType: j.fromType ?? j.from_type ?? null,
    toTable: j.toTable ?? j.to_table,
    toColumn: j.toColumn ?? j.to_column,
    toType: j.toType ?? j.to_type ?? null,
  }))
}

function tablesInScope(job, joins) {
  const set = new Set((job.tables || []).map(String))
  for (const j of joins) {
    if (j.fromTable) set.add(j.fromTable)
    if (j.toTable) set.add(j.toTable)
  }
  return [...set]
}

function buildSqlFromJoins(job, joins) {
  if (job.sqlText && String(job.sqlText).trim()) {
    const header = [
      `-- Que dbt model (review before merge)`,
      `-- Job: ${job.title}`,
      `-- Snapshot: ${job.schemaSnapshotId || 'n/a'}`,
      `-- Policy: schema-only · frozen contract + accepted joins`,
      ...joins.map(
        (j) =>
          `-- accepted: ${j.fromTable}.${j.fromColumn} → ${j.toTable}.${j.toColumn} [${j.id}]`,
      ),
      ``,
    ].join('\n')
    return header + String(job.sqlText).trim() + '\n'
  }

  const tables = job.tables?.length ? job.tables : []
  const base = tables[0] || joins[0]?.fromTable

  if (!base) {
    return [
      `-- Que job: ${job.title}`,
      `-- No tables or accepted joins yet.`,
      `SELECT 1 AS que_placeholder`,
      ``,
    ].join('\n')
  }

  const baseStub = `stg_${slugify(base)}`
  const used = new Set([String(base)])
  const joinLines = []
  let aliasIdx = 1

  for (const j of joins) {
    const fromKnown = used.has(j.fromTable)
    const toKnown = used.has(j.toTable)
    if (fromKnown && toKnown) {
      joinLines.push(
        `-- (already joined) ${j.fromTable}.${j.fromColumn} = ${j.toTable}.${j.toColumn} [${j.id}]`,
      )
      continue
    }
    if (!fromKnown && !toKnown) {
      joinLines.push(
        `-- (skipped orphan edge) ${j.fromTable}.${j.fromColumn} → ${j.toTable}.${j.toColumn} [${j.id}]`,
      )
      continue
    }

    const attachRight = fromKnown
    const rightTable = attachRight ? j.toTable : j.fromTable
    const leftCol = attachRight ? j.fromColumn : j.toColumn
    const rightCol = attachRight ? j.toColumn : j.fromColumn
    const alias = `t${aliasIdx++}`
    const rightStub = `stg_${slugify(rightTable)}`
    const on =
      j.joinCriteria && !String(j.joinCriteria).includes('≈')
        ? j.joinCriteria
        : `a.${leftCol} = ${alias}.${rightCol}`

    joinLines.push(
      `LEFT JOIN {{ ref('${rightStub}') }} AS ${alias}`,
      `  ON ${on}  -- Que accepted ${j.id}`,
    )
    used.add(rightTable)
  }

  return [
    `-- Que-generated dbt model (review before merge)`,
    `-- Job: ${job.title}`,
    `-- Snapshot: ${job.schemaSnapshotId || 'n/a'}`,
    `-- Policy: schema-only · human-accepted joins only`,
    `-- Sources: ${(job.sources || []).join(', ') || 'n/a'}`,
    `SELECT`,
    `  a.*`,
    `FROM {{ ref('${baseStub}') }} AS a`,
    ...(joinLines.length
      ? joinLines
      : ['-- (no accepted joins in scope — promote on canvas)']),
    ``,
  ].join('\n')
}

function buildStagingSql(tableName) {
  const stub = `stg_${slugify(tableName)}`
  return [
    `-- Que staging stub for ${tableName}`,
    `-- Replace source() with your warehouse mapping when wiring production.`,
    `{{ config(materialized='view') }}`,
    ``,
    `select *`,
    `from {{ source('que_raw', '${slugify(tableName)}') }}`,
    ``,
  ].join('\n')
}

function buildSourcesYml(tables, job) {
  const lines = [
    `version: 2`,
    ``,
    `sources:`,
    `  - name: que_raw`,
    `    description: >`,
    `      Que-declared raw sources for stitch job "${job.title}".`,
    `      Map these to your warehouse schemas before running dbt in CI.`,
    `    meta:`,
    `      que_export: true`,
    `      schema_only: true`,
    `      schema_snapshot_id: "${job.schemaSnapshotId || ''}"`,
    `    tables:`,
  ]
  for (const t of tables) {
    lines.push(`      - name: ${slugify(t)}`)
    lines.push(`        identifier: ${t}`)
    lines.push(`        description: "Que contracted table ${t}"`)
  }
  lines.push(``)
  return lines.join('\n')
}

function buildSchemaYml(modelName, joins, stagingNames) {
  const colMap = new Map()
  function ensureCol(name) {
    if (!colMap.has(name)) colMap.set(name, { desc: [], tests: [] })
    return colMap.get(name)
  }

  for (const j of joins.slice(0, 20)) {
    const fromKey = slugify(j.fromColumn)
    const toKey = slugify(j.toColumn)
    const fromCol = ensureCol(fromKey)
    fromCol.desc.push(
      `Que accepted join → ${j.toTable}.${j.toColumn} [${j.id}]` +
        (j.fromType ? ` (${j.fromType})` : ''),
    )
    if (!fromCol.tests.includes('not_null')) fromCol.tests.push('not_null')
    const toStub = `stg_${slugify(j.toTable)}`
    fromCol.tests.push(
      [
        `relationships:`,
        `            to: ref('${toStub}')`,
        `            field: ${toKey}`,
      ].join('\n'),
    )

    const toCol = ensureCol(toKey)
    toCol.desc.push(`Que join target ${j.toTable}.${j.toColumn} [${j.id}]`)
    if (!toCol.tests.includes('not_null')) toCol.tests.push('not_null')
    if (leafIsId(j.toColumn) && !toCol.tests.includes('unique')) {
      toCol.tests.push('unique')
    }
  }

  const cols = []
  for (const [name, meta] of colMap) {
    cols.push(`      - name: ${name}`)
    cols.push(
      `        description: "${meta.desc.join(' | ').replace(/"/g, "'")}"`,
    )
    cols.push(`        tests:`)
    for (const t of meta.tests) {
      cols.push(`          - ${t}`)
    }
  }

  const stagingModels = stagingNames.map((t) => {
    const stub = `stg_${slugify(t)}`
    return [
      `  - name: ${stub}`,
      `    description: Que staging stub for ${t}`,
      `    meta:`,
      `      que_staging: true`,
    ].join('\n')
  })

  return [
    `version: 2`,
    ``,
    `models:`,
    `  - name: ${modelName}`,
    `    description: >`,
    `      Que stitch model from frozen contract (promoted joins + schema snapshot).`,
    `      Review SQL and tests before merging.`,
    `    meta:`,
    `      que_export: true`,
    `      schema_only: true`,
    `      frozen_join_count: ${joins.length}`,
    `    columns:`,
    ...(cols.length
      ? cols
      : [
          `      - name: _que_placeholder`,
          `        description: "No accepted joins in scope yet."`,
        ]),
    ``,
    ...stagingModels,
    ``,
  ].join('\n')
}

function leafIsId(name) {
  const n = String(name || '')
    .toLowerCase()
    .split('.')
    .pop()
  return n === 'id' || n?.endsWith('_id')
}

/** Real singular orphan-key tests against staging stubs */
function buildSingularJoinTests(modelName, joins) {
  if (joins.length === 0) {
    return [
      {
        path: null,
        content: null,
      },
    ]
  }

  return joins.slice(0, 8).map((j, i) => {
    const fromStub = `stg_${slugify(j.fromTable)}`
    const toStub = `stg_${slugify(j.toTable)}`
    const content = [
      `-- Que singular test: orphan keys for frozen join ${j.id}`,
      `-- ${j.fromTable}.${j.fromColumn} → ${j.toTable}.${j.toColumn}`,
      `-- Empty result = pass (no orphans).`,
      `{{ config(severity=true) }}`,
      ``,
      `select`,
      `  f.${j.fromColumn} as orphan_key`,
      `from {{ ref('${fromStub}') }} as f`,
      `left join {{ ref('${toStub}') }} as t`,
      `  on f.${j.fromColumn} = t.${j.toColumn}`,
      `where f.${j.fromColumn} is not null`,
      `  and t.${j.toColumn} is null`,
      ``,
    ].join('\n')
    return {
      pathSuffix: `que_orphan__${slugify(modelName)}_${i}.sql`,
      content,
    }
  })
}

function buildCiWorkflow(modelName) {
  return [
    `name: Que dbt checks`,
    ``,
    `on:`,
    `  pull_request:`,
    `    paths:`,
    `      - 'models/**'`,
    `      - 'tests/**'`,
    ``,
    `jobs:`,
    `  dbt-parse:`,
    `    runs-on: ubuntu-latest`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: actions/setup-python@v5`,
    `        with:`,
    `          python-version: '3.11'`,
    `      - name: Install dbt-core`,
    `        run: pip install dbt-core dbt-postgres`,
    `      - name: dbt parse (requires profiles.yml in secrets/CI)`,
    `        continue-on-error: true`,
    `        run: |`,
    `          echo "Wire profiles.yml + warehouse creds in CI to enforce tests for ${modelName}"`,
    `          # dbt deps && dbt parse && dbt test --select ${modelName}`,
    ``,
  ].join('\n')
}

function buildLineageMd(job, joins, attestation) {
  const joinLines =
    joins.length === 0
      ? '- _(none — promote joins on the Que canvas, then re-export)_'
      : joins
          .map(
            (j) =>
              `- **${j.fromTable}.${j.fromColumn} → ${j.toTable}.${j.toColumn}**` +
              ` \`${j.id}\`` +
              (j.fromType || j.toType
                ? ` · types ${j.fromType || '?'} → ${j.toType || '?'}`
                : '') +
              (j.confidence != null ? ` · confidence ${j.confidence}` : ''),
          )
          .join('\n')

  return [
    `# Que lineage note`,
    ``,
    `## Job`,
    `- **Title:** ${job.title}`,
    `- **Id:** \`${job.id}\``,
    `- **Schema snapshot:** \`${job.schemaSnapshotId || '—'}\``,
    `- **Sources:** ${(job.sources || []).join(', ') || '—'}`,
    `- **Tables:** ${(job.tables || []).join(', ') || '—'}`,
    ``,
    `## Human-accepted joins (frozen)`,
    joinLines,
    ``,
    `## Schema-only attestation`,
    `- Policy: \`${attestation.policy}\``,
    `- Claim: ${attestation.claim}`,
    `- Exported at: ${attestation.exportedAt}`,
    ``,
    `## Notes`,
    job.notes || '_No notes._',
    ``,
  ].join('\n')
}

/**
 * Build dbt file bundle for a job.
 */
export async function buildDbtBundle(workspaceId, job) {
  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings ?? {}
  const modelsPath = String(settings.dbtModelsPath || 'models/que').replace(
    /^\/+|\/+$/g,
    '',
  )

  let joins = normalizeJoins(job)
  if (joins.length === 0) {
    joins = await loadAcceptedJoins(workspaceId, job.tables || [])
  }

  const scopeTables = tablesInScope(job, joins)
  const modelName = `que_${slugify(job.title)}`
  const sql = buildSqlFromJoins(job, joins)
  const stagingPath = `${modelsPath}/staging`

  const attestation = {
    policy: 'schema-only',
    claim:
      'Que used schema metadata and capped samples only; raw rows are not centralized for model training.',
    brand: 'Que',
    jobId: job.id,
    workspaceId,
    schemaSnapshotId: job.schemaSnapshotId || job.contract?.schemaSnapshotId || null,
    schemaSnapshotLabel: job.contract?.schemaSnapshotLabel || null,
    approvedRelationshipIds: joins.map((j) => j.id),
    frozenFromJob: Array.isArray(job.joinsSnapshot) && job.joinsSnapshot.length > 0,
    contractVersion: job.contract?.version || null,
    tables: job.tables || [],
    sources: job.sources || [],
    exportedAt: new Date().toISOString(),
  }

  const testsPath = modelsPath.replace(/^models/, 'tests') || 'tests/que'
  const orphanTests = buildSingularJoinTests(modelName, joins)

  const files = [
    {
      path: `${modelsPath}/${modelName}.sql`,
      content: sql,
    },
    {
      path: `${modelsPath}/schema.yml`,
      content: buildSchemaYml(modelName, joins, scopeTables),
    },
    {
      path: `${modelsPath}/sources.yml`,
      content: buildSourcesYml(scopeTables, job),
    },
    {
      path: `${modelsPath}/_que_lineage_${modelName}.md`,
      content: buildLineageMd(job, joins, attestation),
    },
    {
      path: `${modelsPath}/_que_attestation_${modelName}.json`,
      content: JSON.stringify(
        { ...attestation, contract: job.contract || null },
        null,
        2,
      ) + '\n',
    },
    {
      path: `.github/workflows/que-dbt-${slugify(modelName)}.yml`,
      content: buildCiWorkflow(modelName),
    },
  ]

  for (const t of scopeTables) {
    files.push({
      path: `${stagingPath}/stg_${slugify(t)}.sql`,
      content: buildStagingSql(t),
    })
  }

  for (const t of orphanTests) {
    if (t.content && t.pathSuffix) {
      files.push({
        path: `${testsPath}/${t.pathSuffix}`,
        content: t.content,
      })
    }
  }

  return {
    modelName,
    modelsPath,
    joins,
    attestation,
    files,
  }
}
