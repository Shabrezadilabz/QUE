/**
 * Bootstrap SportEdge Postgres into Neon/cloud.
 *   set SPORTEDGE_PG_URL=postgresql://owner:pass@host/neondb?sslmode=require
 *   npm run bootstrap:sportedge-pg
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../db/sportedge')
const files = ['001_schema.sql', '002_seed_bulk.sql']

function sslForUrl(url) {
  return url.includes('localhost') || url.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
}

async function main() {
  const url = process.env.SPORTEDGE_PG_URL
  if (!url) {
    console.error('Set SPORTEDGE_PG_URL to your Neon connection string (owner user).')
    process.exit(1)
  }

  const client = new pg.Client({ connectionString: url, ssl: sslForUrl(url) })
  await client.connect()
  console.log('Connected — loading SportEdge Postgres…')

  try {
    for (const file of files) {
      const sql = readFileSync(resolve(ROOT, file), 'utf8')
      console.log(`  Applying ${file}…`)
      try {
        await client.query(sql)
      } catch (err) {
        console.error(`  Failed in ${file}:`, err.message)
        throw err
      }
    }
    const { rows } = await client.query(`
      SELECT 'customers' AS tbl, COUNT(*)::int AS n FROM customers
      UNION ALL SELECT 'products', COUNT(*)::int FROM products
      UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
      UNION ALL SELECT 'order_items', COUNT(*)::int FROM order_items
      UNION ALL SELECT 'finance.payments', COUNT(*)::int FROM finance.payments
    `)
    console.log('\nPostgres row counts:')
    for (const r of rows) console.log(`  ${r.tbl}: ${r.n}`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
