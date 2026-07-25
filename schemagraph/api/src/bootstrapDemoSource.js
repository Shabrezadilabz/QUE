/**
 * Create + seed the customer_demo Postgres database used by the first connector.
 * Safe to re-run. Uses the same Docker Postgres as Stitch metadata.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

const adminUrl =
  process.env.DATABASE_URL ??
  'postgresql://stitch:stitch@localhost:5432/stitch'

const DEMO_DB = process.env.STITCH_DEMO_SOURCE_DB || 'customer_demo'

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  try {
    const { rows } = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DEMO_DB],
    )
    if (rows.length === 0) {
      // CREATE DATABASE cannot run inside a transaction
      await admin.query(`CREATE DATABASE ${DEMO_DB}`)
      console.log(`Created database ${DEMO_DB}`)
    } else {
      console.log(`Database ${DEMO_DB} already exists`)
    }
  } finally {
    await admin.end()
  }

  const sqlPath = resolve(__dirname, '../../db/002_customer_demo.sql')
  const sql = readFileSync(sqlPath, 'utf8')
  const demoUrl = new URL(adminUrl)
  demoUrl.pathname = `/${DEMO_DB}`
  const demo = new pg.Client({ connectionString: demoUrl.toString() })
  await demo.connect()
  try {
    await demo.query(sql)
    console.log(`Applied ${sqlPath} → ${DEMO_DB}`)
  } finally {
    await demo.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
