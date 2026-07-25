/**
 * Full test-data bootstrap:
 * 1) customer_demo schema + ~10k rows
 * 2) Excel/CSV fixtures (~1k rows × 3)
 * 3) Optional Mongo bulk (if Mongo reachable)
 *
 *   npm run bootstrap:test-data
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDb = resolve(__dirname, '../../db')

const adminUrl =
  process.env.DATABASE_URL ??
  'postgresql://stitch:stitch@localhost:5432/stitch'
const DEMO_DB = process.env.STITCH_DEMO_SOURCE_DB || 'customer_demo'

async function ensureDb() {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  try {
    const { rows } = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DEMO_DB],
    )
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE ${DEMO_DB}`)
      console.log(`Created database ${DEMO_DB}`)
    } else {
      console.log(`Database ${DEMO_DB} already exists`)
    }
  } finally {
    await admin.end()
  }
}

async function applySql(fileName) {
  const sqlPath = resolve(rootDb, fileName)
  const sql = readFileSync(sqlPath, 'utf8')
  const demoUrl = new URL(adminUrl)
  demoUrl.pathname = `/${DEMO_DB}`
  const demo = new pg.Client({ connectionString: demoUrl.toString() })
  await demo.connect()
  try {
    await demo.query(sql)
    const counts = await demo.query(`
      SELECT 'customers' AS t, COUNT(*)::int AS n FROM customers
      UNION ALL SELECT 'products', COUNT(*)::int FROM products
      UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
      UNION ALL SELECT 'order_items', COUNT(*)::int FROM order_items
    `)
    console.log(`Applied ${fileName}`)
    for (const r of counts.rows) console.log(`  ${r.t}: ${r.n}`)
    const total = counts.rows.reduce((s, r) => s + r.n, 0)
    console.log(`  TOTAL rows: ${total}`)
  } finally {
    await demo.end()
  }
}

function runNode(scriptRel) {
  const script = resolve(__dirname, scriptRel)
  const r = spawnSync(process.execPath, [script], {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) {
    throw new Error(`${scriptRel} exited ${r.status}`)
  }
}

async function main() {
  console.log('=== Que test-data bootstrap ===')
  await ensureDb()
  await applySql('002_customer_demo.sql')
  await applySql('002b_customer_demo_bulk.sql')
  runNode('../scripts/generateTestFixtures.js')

  // Mongo optional
  try {
    runNode('bootstrapDemoMongo.js')
  } catch (err) {
    console.warn('Mongo bootstrap skipped:', err.message || err)
  }

  console.log('=== Done. Next: npm run seed && sync connectors in UI/API ===')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
