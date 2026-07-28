/**
 * Ordered SQL migrator for Que metadata DB.
 * Applies db/*.sql in numeric prefix order; tracks schema_migrations.
 *
 * Usage:
 *   node scripts/migrate.js
 *   npm run migrate
 *
 * Env: DATABASE_URL or STITCH_PG_* (same as api db.js)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_ROOT = resolve(
  process.env.QUE_DB_DIR || resolve(__dirname, '../../db'),
)

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

function listMigrations() {
  return readdirSync(DB_ROOT)
    .filter((f) => /^\d{3}.*\.sql$/i.test(f))
    .filter((f) => !/customer_demo|bulk/i.test(f))
    .sort()
}

async function main() {
  const client = new pg.Client(poolConfig())
  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    const { rows } = await client.query(`SELECT id FROM schema_migrations`)
    const done = new Set(rows.map((r) => r.id))
    const files = listMigrations()
    let applied = 0
    for (const file of files) {
      if (done.has(file)) {
        console.log(`skip ${file}`)
        continue
      }
      const sql = readFileSync(resolve(DB_ROOT, file), 'utf8')
      console.log(`apply ${file}…`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [
          file,
        ])
        await client.query('COMMIT')
        applied += 1
        console.log(`ok   ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`FAIL ${file}:`, err.message || err)
        process.exitCode = 1
        break
      }
    }
    console.log(
      applied === 0 && process.exitCode !== 1
        ? '[Que] migrations up to date'
        : `[Que] applied ${applied} migration(s)`,
    )
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
