/**
 * Ordered SQL migrator for Que metadata DB.
 * Applies db/*.sql in numeric prefix order; tracks schema_migrations.
 *
 * Usage:
 *   node scripts/migrate.js
 *   npm run migrate
 *
 * Env: DATABASE_URL or STITCH_PG_* (same as api db.js)
 *      QUE_DB_DIR — override SQL folder (Docker)
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
    return {
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === 'disable'
          ? undefined
          : { rejectUnauthorized: false },
    }
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

/**
 * Apply pending migrations. Safe to call on every boot.
 * @returns {Promise<{ applied: string[], skipped: number, failed?: string, error?: string }>}
 */
export async function runMigrations(opts = {}) {
  const log = opts.log !== false
  const client = new pg.Client(poolConfig())
  await client.connect()
  const applied = []
  let skipped = 0
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
    for (const file of files) {
      if (done.has(file)) {
        skipped += 1
        if (log) console.log(`skip ${file}`)
        continue
      }
      const sql = readFileSync(resolve(DB_ROOT, file), 'utf8')
      if (log) console.log(`apply ${file}…`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [
          file,
        ])
        await client.query('COMMIT')
        applied.push(file)
        if (log) console.log(`ok   ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        const message = String(err.message || err)
        if (log) console.error(`FAIL ${file}:`, message)
        return {
          applied,
          skipped,
          failed: file,
          error: message,
        }
      }
    }
    if (log) {
      console.log(
        applied.length === 0
          ? '[Que] migrations up to date'
          : `[Que] applied ${applied.length} migration(s)`,
      )
    }
    return { applied, skipped }
  } finally {
    await client.end()
  }
}

async function main() {
  const result = await runMigrations()
  if (result.failed) process.exitCode = 1
}

const isCli =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isCli) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
