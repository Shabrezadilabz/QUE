/**
 * Generate Excel test fixtures (~1k rows each) that join to customer_demo.customers.email
 * Output: api/fixtures/test_campaigns.xlsx, test_leads.xlsx, test_accounts.xlsx
 *
 *   node scripts/generateTestFixtures.js
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../fixtures')
mkdirSync(OUT, { recursive: true })

const N = 1000
const CUSTOMER_N = 2500

function emailFor(i) {
  // Overlap heavily with Postgres customers (user{N}@example.com + classic demos)
  if (i % 97 === 0) return 'ada@example.com'
  if (i % 89 === 0) return 'grace@example.com'
  if (i % 83 === 0) return 'alan@example.com'
  const n = 1 + (i % CUSTOMER_N)
  return `user${n}@example.com`
}

function writeSheet(filename, sheetName, rows) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const path = resolve(OUT, filename)
  XLSX.writeFile(wb, path)
  console.log(`Wrote ${path} (${rows.length} rows)`)
}

const campaigns = []
for (let i = 0; i < N; i++) {
  campaigns.push({
    campaign_id: `cmp-${String(i + 1).padStart(4, '0')}`,
    name: `Campaign ${i + 1}`,
    owner_email: emailFor(i),
    budget: 1000 + ((i * 137) % 49000),
    region_code: ['NA', 'EU', 'APAC', 'LATAM'][i % 4],
    launched_at: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
  })
}
writeSheet('test_campaigns.xlsx', 'Campaigns', campaigns)

const leads = []
for (let i = 0; i < N; i++) {
  const campaignIdx = (i * 3) % N
  leads.push({
    lead_id: `L-${String(i + 1).padStart(4, '0')}`,
    email: emailFor(i + 11),
    campaign_id: campaigns[campaignIdx].campaign_id,
    status: ['open', 'qualified', 'won', 'lost'][i % 4],
    score: (i * 13) % 100,
    created_at: `2024-03-${String((i % 28) + 1).padStart(2, '0')}`,
  })
}
writeSheet('test_leads.xlsx', 'Leads', leads)

const accounts = []
for (let i = 0; i < N; i++) {
  accounts.push({
    account_id: `A-${String(i + 1).padStart(4, '0')}`,
    email: emailFor(i + 3),
    region_code: ['NA', 'EU', 'APAC', 'LATAM'][i % 4],
    tier: ['free', 'pro', 'enterprise'][i % 3],
    customer_id: 1 + (i % CUSTOMER_N),
    annual_spend: Math.round((i * 19) % 50000),
  })
}
writeSheet('test_accounts.xlsx', 'Accounts', accounts)

// Also refresh CSV copies for connectors that prefer csv
function writeCsv(filename, rows) {
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = String(r[h] ?? '')
          return v.includes(',') ? `"${v}"` : v
        })
        .join(','),
    ),
  ]
  const path = resolve(OUT, filename)
  writeFileSync(path, lines.join('\n'), 'utf8')
  console.log(`Wrote ${path} (${rows.length} rows)`)
}

writeCsv('campaigns.csv', campaigns)
writeCsv('leads.csv', leads)
writeCsv('accounts.csv', accounts)

console.log('Test fixtures ready — join key: email / owner_email / customer_id → customers')
