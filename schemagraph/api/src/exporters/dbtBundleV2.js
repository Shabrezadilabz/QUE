/**
 * S4.1 — dbt bundle v2: workspace export + dbt_project + graph sources.
 */
import { query } from '../db.js'
import { listJobs } from '../jobs.js'
import { buildDbtBundle, loadAcceptedJoins } from './dbtBundle.js'
import { buildSchemaOnlyAttestation } from './attestation.js'
import { getWorkspaceSettings } from '../workspaceSettings.js'

function slugify(input) {
  const s = String(input || 'stitch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return s || 'stitch'
}

/** Load warehouse tables from Que schema graph for dbt sources.yml */
export async function loadGraphSources(workspaceId) {
  const { rows } = await query(
    `SELECT o.name AS table_name,
            c.name AS connection_name,
            c.type AS connection_type
     FROM schema_objects o
     JOIN connections c ON c.id = o.connection_id
     WHERE o.workspace_id = $1 AND o.entity_kind = 'TABLE'
     ORDER BY c.name, o.name
     LIMIT 500`,
    [workspaceId],
  ).catch(() => ({ rows: [] }))

  const bySource = new Map()
  for (const r of rows) {
    const sourceName = slugify(r.connection_name || 'que_raw')
    if (!bySource.has(sourceName)) {
      bySource.set(sourceName, {
        name: sourceName,
        connection: r.connection_name,
        type: r.connection_type,
        tables: [],
      })
    }
    bySource.get(sourceName).tables.push({
      name: slugify(r.table_name),
      identifier: r.table_name,
    })
  }
  return [...bySource.values()]
}

export function buildDbtProjectYml(projectName = 'que_export') {
  return [
    `name: '${projectName}'`,
    `version: '1.0.0'`,
    `config-version: 2`,
    ``,
    `profile: 'que'`,
    ``,
    `model-paths: ['models']`,
    `analysis-paths: ['analyses']`,
    `test-paths: ['tests']`,
    `seed-paths: ['seeds']`,
    `macro-paths: ['macros']`,
    `snapshot-paths: ['snapshots']`,
    ``,
    `clean-targets:`,
    `  - 'target'`,
    `  - 'dbt_packages'`,
    ``,
    `models:`,
    `  que:`,
    `    +materialized: view`,
    `    staging:`,
    `      +materialized: view`,
    ``,
  ].join('\n')
}

export function buildProfilesExample() {
  return [
    `# Copy to ~/.dbt/profiles.yml and wire warehouse credentials.`,
    `que:`,
    `  target: dev`,
    `  outputs:`,
    `  dev:`,
    `    type: postgres`,
    `    host: "{{ env_var('DBT_HOST', 'localhost') }}"`,
    `    user: "{{ env_var('DBT_USER', 'postgres') }}"`,
    `    password: "{{ env_var('DBT_PASS', '') }}"`,
    `    port: "{{ env_var('DBT_PORT', '5432') | int }}"`,
    `    dbname: "{{ env_var('DBT_DB', 'analytics') }}"`,
    `    schema: "{{ env_var('DBT_SCHEMA', 'que_marts') }}"`,
    `    threads: 4`,
    ``,
  ].join('\n')
}

export function buildGraphSourcesYml(sources) {
  const lines = [`version: 2`, ``, `sources:`]
  for (const src of sources) {
    lines.push(`  - name: ${src.name}`)
    lines.push(`    description: >`)
    lines.push(
      `      Que graph source — connection "${src.connection || src.name}" (${src.type || 'warehouse'}).`,
    )
    lines.push(`    meta:`)
    lines.push(`      que_graph_source: true`)
    lines.push(`    tables:`)
    for (const t of src.tables.slice(0, 200)) {
      lines.push(`      - name: ${t.name}`)
      lines.push(`        identifier: ${t.identifier}`)
    }
    lines.push(``)
  }
  if (sources.length === 0) {
    lines.push(`  - name: que_raw`)
    lines.push(`    tables:`)
    lines.push(`      - name: placeholder`)
    lines.push(`        identifier: placeholder`)
    lines.push(``)
  }
  return lines.join('\n')
}

export function buildDbtReadme(workspaceId, jobCount, modelCount) {
  return [
    `# Que dbt bundle v2`,
    ``,
    `Exported from workspace \`${workspaceId}\`.`,
    ``,
    `## Contents`,
    ``,
    `- **${jobCount}** stitch job(s) → **${modelCount}** dbt model(s)`,
    `- Staging stubs per contracted table`,
    `- Schema tests from promoted joins (relationships + not_null)`,
    `- Singular orphan-key tests`,
    `- Graph-derived \`sources.yml\` from synced connections`,
    ``,
    `## Quick start`,
    ``,
    `\`\`\`bash`,
    `cp profiles.yml.example ~/.dbt/profiles.yml  # edit credentials`,
    `dbt deps   # optional`,
    `dbt parse`,
    `dbt run --select que_*`,
    `dbt test --select que_*`,
    `\`\`\``,
    ``,
    `## Policy`,
    ``,
    `Schema-only export — no warehouse row dumps. Review SQL before merge.`,
    ``,
  ].join('\n')
}

function buildCiWorkflowV2() {
  return [
    `name: Que dbt bundle v2`,
    ``,
    `on:`,
    `  pull_request:`,
    `    paths:`,
    `      - 'models/**'`,
    `      - 'tests/**'`,
    `      - 'dbt_project.yml'`,
    ``,
    `jobs:`,
    `  dbt-parse:`,
    `    runs-on: ubuntu-latest`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    `      - uses: actions/setup-python@v5`,
    `        with:`,
    `          python-version: '3.11'`,
    `      - name: Install dbt`,
    `        run: pip install dbt-core dbt-postgres`,
    `      - name: Write CI profile`,
    `        run: |`,
    `          mkdir -p ~/.dbt`,
    `          cp profiles.yml.example ~/.dbt/profiles.yml`,
    `      - name: dbt parse`,
    `        continue-on-error: true`,
    `        run: dbt parse || echo "Wire DBT_* secrets for full parse"`,
    ``,
  ].join('\n')
}

/**
 * Merge per-job bundles into a workspace dbt bundle v2.
 */
export async function buildWorkspaceDbtBundleV2(workspaceId, opts = {}) {
  const settingsPayload = await getWorkspaceSettings(workspaceId)
  const settings = settingsPayload?.settings ?? {}
  const modelsPath = String(settings.dbtModelsPath || 'models/que').replace(
    /^\/+|\/+$/g,
    '',
  )

  const jobs = await listJobs(workspaceId)
  let candidates = jobs.filter(
    (j) =>
      j.status === 'exported' ||
      (j.joinsSnapshot && j.joinsSnapshot.length > 0) ||
      j.contract,
  )
  if (opts.jobIds?.length) {
    const want = new Set(opts.jobIds.map(String))
    candidates = candidates.filter((j) => want.has(j.id))
  }
  if (!candidates.length && opts.includeDrafts !== false) {
    candidates = jobs.slice(0, 5)
  }

  const graphSources = await loadGraphSources(workspaceId)
  const allJoins = await loadAcceptedJoins(workspaceId, [])
  const fileMap = new Map()
  const models = []

  function addFile(path, content) {
    if (!path || content == null) return
    fileMap.set(path, content)
  }

  addFile('dbt_project.yml', buildDbtProjectYml('que_workspace_export'))
  addFile('profiles.yml.example', buildProfilesExample())
  addFile('models/sources_graph.yml', buildGraphSourcesYml(graphSources))
  addFile('.github/workflows/que-dbt-v2.yml', buildCiWorkflowV2())

  for (const job of candidates) {
    try {
      const bundle = await buildDbtBundle(workspaceId, job)
      models.push({
        jobId: job.id,
        title: job.title,
        modelName: bundle.modelName,
        joinCount: bundle.joins.length,
      })
      for (const f of bundle.files) {
        if (f.path && f.content != null) {
          addFile(f.path, f.content)
        }
      }
    } catch (err) {
      models.push({
        jobId: job.id,
        title: job.title,
        error: String(err.message || err).slice(0, 200),
      })
    }
  }

  addFile(
    'README.md',
    buildDbtReadme(
      workspaceId,
      candidates.length,
      models.filter((m) => m.modelName).length,
    ),
  )

  addFile(
    'que_bundle_manifest.json',
    JSON.stringify(
      {
        format: 'que_dbt_bundle_v2',
        workspaceId,
        exportedAt: new Date().toISOString(),
        jobCount: candidates.length,
        models,
        graphSourceCount: graphSources.length,
        acceptedJoinCount: allJoins.length,
        attestation: buildSchemaOnlyAttestation({
          workspaceId,
          job: { id: 'workspace', title: 'Workspace dbt v2 export' },
          joins: allJoins.slice(0, 50),
          format: 'dbt-v2',
        }),
      },
      null,
      2,
    ) + '\n',
  )

  const files = [...fileMap.entries()].map(([path, content]) => ({ path, content }))

  return {
    format: 'dbt_bundle_v2',
    workspaceId,
    modelsPath,
    jobCount: candidates.length,
    modelCount: models.filter((m) => m.modelName).length,
    graphSources: graphSources.length,
    files,
    models,
  }
}

/** Validate bundle structure (no dbt CLI required). */
export function validateDbtBundleStructure(bundle) {
  const errors = []
  const paths = new Set((bundle.files || []).map((f) => f.path))
  if (!paths.has('dbt_project.yml')) errors.push('missing dbt_project.yml')
  if (!paths.has('profiles.yml.example')) errors.push('missing profiles.yml.example')
  const sqlModels = [...paths].filter((p) => p.endsWith('.sql') && p.includes('models'))
  if (sqlModels.length === 0) errors.push('no model SQL files')
  const hasSources =
    [...paths].some((p) => p.includes('sources')) ||
    [...paths].some((p) => p.includes('staging'))
  if (!hasSources) errors.push('missing sources or staging')
  return { ok: errors.length === 0, errors, modelSqlCount: sqlModels.length }
}
