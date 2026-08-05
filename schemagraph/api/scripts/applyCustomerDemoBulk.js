import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '../../db/002b_customer_demo_bulk.sql')
const sql = readFileSync(sqlPath, 'utf8')

const c = new pg.Client({
  connectionString: 'postgresql://stitch:stitch@localhost:5432/customer_demo',
})
await c.connect()
await c.query(sql)
const { rows } = await c.query(`
  SELECT 'customers' AS t, COUNT(*)::int AS n FROM customers
  UNION ALL SELECT 'products', COUNT(*)::int FROM products
  UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
  UNION ALL SELECT 'order_items', COUNT(*)::int FROM order_items
`)
for (const r of rows) console.log(`${r.t}: ${r.n}`)
console.log('TOTAL:', rows.reduce((s, r) => s + r.n, 0))
await c.end()
