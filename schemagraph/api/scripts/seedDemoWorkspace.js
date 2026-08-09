/**
 * Seed a demo workspace for client walkthroughs.
 *
 * Usage (from api/):
 *   node scripts/seedDemoWorkspace.js
 *   node scripts/seedDemoWorkspace.js --email demo@client.example
 *
 * Env: DATABASE_URL / STITCH_PG_*
 */
import { randomUUID, createHash, randomBytes, scryptSync } from 'node:crypto'
import pg from 'pg'

function poolConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL }
  }
  return {
    host: process.env.STITCH_PG_HOST || 'localhost',
    port: Number(process.env.STITCH_PG_PORT || 5432),
    database: process.env.STITCH_PG_DB || 'stitch',
    user: process.env.STITCH_PG_USER || 'stitch',
    password: process.env.STITCH_PG_PASSWORD || 'stitch',
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

async function main() {
  const email = String(arg('--email', 'demo@que.local')).toLowerCase()
  const password = arg('--password', 'que-demo-2026')
  const wsName = arg('--name', 'Que Client Demo')
  const client = new pg.Client(poolConfig())
  await client.connect()

  try {
    let userId
    const { rows: users } = await client.query(
      `SELECT id FROM users WHERE lower(email) = $1`,
      [email],
    )
    if (users[0]) {
      userId = users[0].id
      console.log(`user exists: ${email}`)
    } else {
      userId = randomUUID()
      await client.query(
        `INSERT INTO users (id, email, display_name, password_hash)
         VALUES ($1,$2,$3,$4)`,
        [userId, email, 'Que Demo Owner', hashPassword(password)],
      )
      console.log(`created user ${email} / ${password}`)
    }

    const slug = `demo-${createHash('sha1').update(email).digest('hex').slice(0, 8)}`
    let workspaceId
    const { rows: ws } = await client.query(
      `SELECT id FROM workspaces WHERE slug = $1`,
      [slug],
    )
    const settings = {
      includeSamplesDefault: true,
      scrubSamples: true,
      aiMayUsePinnedSamples: true,
      pinnedSampleRows: 10,
      enableManagedDataPlane: true,
      defaultExecutionPlane: 'managed',
      enableStitchAgent: true,
      enableCatalogGovernance: true,
      managedMaxDatasets: 25,
      managedMaxRowsPerDataset: 10000,
      managedRetentionDays: 90,
    }
    if (ws[0]) {
      workspaceId = ws[0].id
      await client.query(
        `UPDATE workspaces SET settings_json = $2::jsonb WHERE id = $1`,
        [workspaceId, JSON.stringify(settings)],
      )
      console.log(`workspace exists: ${slug} (settings refreshed)`)
    } else {
      workspaceId = randomUUID()
      await client.query(
        `INSERT INTO workspaces (id, name, slug, settings_json)
         VALUES ($1,$2,$3,$4::jsonb)`,
        [workspaceId, wsName, slug, JSON.stringify(settings)],
      )
      console.log(`created workspace ${wsName} (${slug})`)
    }

    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1,$2,'owner')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`,
      [workspaceId, userId],
    )

    const { rows: existingConn } = await client.query(
      `SELECT id FROM connections WHERE workspace_id = $1 AND name = $2`,
      [workspaceId, 'Demo Spreadsheet'],
    )
    if (!existingConn[0]) {
      await client.query(
        `INSERT INTO connections (
           id, workspace_id, name, source_type, status, config_json
         ) VALUES ($1,$2,'Demo Spreadsheet','excel','active',$3::jsonb)`,
        [
          randomUUID(),
          workspaceId,
          JSON.stringify({
            files: [
              { path: 'fixtures/campaigns.csv', tableName: 'campaigns' },
            ],
            note: 'Seeded for client demo — sync from Sources UI',
          }),
        ],
      )
      console.log('added Demo Spreadsheet connection (sync from UI)')
    }

    console.log('\n[Que] Demo ready')
    console.log(`  email:      ${email}`)
    console.log(`  password:   ${password}`)
    console.log(`  workspace:  ${workspaceId}`)
    console.log(`  slug:       ${slug}`)
    console.log('  next: login → Sources → Sync → Joins → Managed → BI')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
