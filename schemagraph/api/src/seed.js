/**
 * Seed LIVE connectors for Demo + Sandbox workspaces (no fake schema graph).
 * Idempotent. After seed, Sync each connection to populate schema from sources.
 */
import { pool, query } from './db.js'

const DEMO_WS = '22222222-2222-2222-2222-222222222222'
const SANDBOX_WS = '33333333-3333-3333-3333-333333333333'

const CONN = {
  pgLive: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  excel: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  mongoLive: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  databricks: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
  /** Sandbox-only connections (different data surface) */
  sandboxExcel: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8',
  sandboxDbx: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9',
}

const LEGACY_FAKE_CONN_IDS = [
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
]

async function upsertWorkspace(id, name, slug) {
  await query(
    `INSERT INTO workspaces (id, name, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    [id, name, slug],
  )
}

async function upsertConnection(
  workspaceId,
  id,
  name,
  sourceType,
  status,
  description,
  configJson = {},
) {
  await query(
    `INSERT INTO connections (
       id, workspace_id, name, source_type, status, description, config_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       workspace_id = EXCLUDED.workspace_id,
       name = EXCLUDED.name,
       source_type = EXCLUDED.source_type,
       status = EXCLUDED.status,
       description = EXCLUDED.description,
       config_json = EXCLUDED.config_json,
       updated_at = now()`,
    [
      id,
      workspaceId,
      name,
      sourceType,
      status,
      description,
      JSON.stringify(configJson),
    ],
  )
}

async function clearWorkspaceGraph(workspaceId) {
  await query(`DELETE FROM relationships WHERE workspace_id = $1`, [workspaceId])
  await query(`DELETE FROM schema_objects WHERE workspace_id = $1`, [workspaceId])
  await query(
    `INSERT INTO diagram_layouts (workspace_id, positions)
     VALUES ($1, '{}'::jsonb)
     ON CONFLICT (workspace_id) DO UPDATE SET
       positions = '{}'::jsonb,
       updated_at = now()`,
    [workspaceId],
  )
}

async function main() {
  await upsertWorkspace(DEMO_WS, 'Demo Workspace', 'demo')
  await upsertWorkspace(SANDBOX_WS, 'Sandbox Workspace', 'sandbox')

  for (const id of LEGACY_FAKE_CONN_IDS) {
    await query(`DELETE FROM connections WHERE id = $1`, [id])
  }

  await clearWorkspaceGraph(DEMO_WS)
  await clearWorkspaceGraph(SANDBOX_WS)

  // ── Demo: full live pack ──────────────────────────────────────────────
  await upsertConnection(
    DEMO_WS,
    CONN.pgLive,
    'pg_customer_demo',
    'postgresql',
    'warning',
    'Live Postgres customer_demo (~10k rows) — Sync to introspect',
    {
      host: 'localhost',
      port: 5432,
      database: 'customer_demo',
      user: 'stitch',
      password: 'stitch',
      schema: 'public',
      includeSamples: true,
      sampleLimit: 5,
    },
  )

  await upsertConnection(
    DEMO_WS,
    CONN.excel,
    'excel_marketing_pack',
    'excel',
    'warning',
    '3 Excel files (~1k rows each) — Sync to ingest',
    {
      files: [
        {
          path: 'fixtures/test_campaigns.xlsx',
          tableName: 'campaigns',
          sheet: 'Campaigns',
        },
        {
          path: 'fixtures/test_leads.xlsx',
          tableName: 'leads',
          sheet: 'Leads',
        },
        {
          path: 'fixtures/test_accounts.xlsx',
          tableName: 'accounts',
          sheet: 'Accounts',
        },
      ],
      includeSamples: true,
      sampleLimit: 5,
    },
  )

  await upsertConnection(
    DEMO_WS,
    CONN.mongoLive,
    'mongo_customer_demo',
    'mongodb',
    'warning',
    'Live Mongo customer_demo — Sync if stitch-mongo is running',
    {
      uri: process.env.STITCH_MONGO_URI || 'mongodb://localhost:27017',
      database: process.env.STITCH_DEMO_MONGO_DB || 'customer_demo',
      sampleSize: 50,
      includeSamples: true,
      sampleLimit: 5,
      maxDepth: 3,
    },
  )

  await upsertConnection(
    DEMO_WS,
    CONN.databricks,
    'databricks_lakehouse_demo',
    'databricks',
    'warning',
    'Unity Catalog fixture — Sync (set token for live mode)',
    {
      mode: 'fixture',
      fixturesPath: 'fixtures/databricks_unity_demo.json',
      catalog: 'main',
      schema: 'analytics',
      includeSamples: true,
      sampleLimit: 5,
    },
  )

  // ── Sandbox: intentionally different surface (excel accounts + dbx only)
  await upsertConnection(
    SANDBOX_WS,
    CONN.sandboxExcel,
    'excel_accounts_only',
    'excel',
    'warning',
    'Sandbox — accounts.xlsx only (~1k rows)',
    {
      files: [
        {
          path: 'fixtures/test_accounts.xlsx',
          tableName: 'accounts',
          sheet: 'Accounts',
        },
      ],
      includeSamples: true,
      sampleLimit: 5,
    },
  )

  await upsertConnection(
    SANDBOX_WS,
    CONN.sandboxDbx,
    'databricks_sandbox',
    'databricks',
    'warning',
    'Sandbox lakehouse fixture — distinct workspace graph',
    {
      mode: 'fixture',
      fixturesPath: 'fixtures/databricks_unity_demo.json',
      catalog: 'main',
      schema: 'analytics',
      includeSamples: true,
      sampleLimit: 5,
    },
  )

  console.log('Seed complete')
  console.log(`  Demo    ${DEMO_WS} — pg + excel×3 + mongo + databricks`)
  console.log(`  Sandbox ${SANDBOX_WS} — excel accounts + databricks`)
  console.log('Next: Sync sources in each workspace after switching')
  await pool.end()
}

main().catch(async (err) => {
  console.error(err)
  await pool.end()
  process.exit(1)
})
