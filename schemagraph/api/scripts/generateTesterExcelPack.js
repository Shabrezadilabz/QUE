/**
 * Que tester Excel/CSV pack — 15 files, ~100k rows total.
 * Join keys align with Postgres/Mongo: email, customer_id / pg_customer_id.
 *
 *   node scripts/generateTesterExcelPack.js
 *
 * Output: docs/tester-fixtures/excel/
 */
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../../docs/tester-fixtures/excel')
mkdirSync(OUT, { recursive: true })

const CUSTOMER_N = 2500

function emailFor(i) {
  if (i % 97 === 0) return 'ada@example.com'
  if (i % 89 === 0) return 'grace@example.com'
  if (i % 83 === 0) return 'alan@example.com'
  const n = 1 + (i % CUSTOMER_N)
  return `user${n}@example.com`
}

function customerId(i) {
  return 1 + (i % CUSTOMER_N)
}

function writeXlsx(filename, sheetName, rows) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  const path = resolve(OUT, filename)
  XLSX.writeFile(wb, path)
  return { path, rows: rows.length, cols: Object.keys(rows[0] || {}).length }
}

function writeCsv(filename, rows) {
  const headers = Object.keys(rows[0] || {})
  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ]
  const path = resolve(OUT, filename)
  writeFileSync(path, lines.join('\n'), 'utf8')
  return { path, rows: rows.length, cols: headers.length }
}

function range(n, mapFn) {
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = mapFn(i)
  return out
}

const manifests = []

// 1 — campaigns.xlsx (~8k, 6 cols)
manifests.push(
  writeXlsx(
    '01_campaigns.xlsx',
    'Campaigns',
    range(8000, (i) => ({
      campaign_id: `cmp-${String(i + 1).padStart(5, '0')}`,
      name: `Campaign ${i + 1}`,
      owner_email: emailFor(i),
      budget: 1000 + ((i * 137) % 49000),
      region_code: ['NA', 'EU', 'APAC', 'LATAM'][i % 4],
      launched_at: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
    })),
  ),
)

// 2 — leads.xlsx (~10k, 7 cols)
manifests.push(
  writeXlsx(
    '02_leads.xlsx',
    'Leads',
    range(10000, (i) => ({
      lead_id: `L-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 11),
      campaign_id: `cmp-${String(1 + ((i * 3) % 8000)).padStart(5, '0')}`,
      status: ['open', 'qualified', 'won', 'lost'][i % 4],
      score: (i * 13) % 100,
      customer_id: customerId(i + 11),
      created_at: `2024-03-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
  ),
)

// 3 — accounts.xlsx (~8k, 7 cols)
manifests.push(
  writeXlsx(
    '03_accounts.xlsx',
    'Accounts',
    range(8000, (i) => ({
      account_id: `A-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 3),
      region_code: ['NA', 'EU', 'APAC', 'LATAM'][i % 4],
      tier: ['free', 'pro', 'enterprise'][i % 3],
      customer_id: customerId(i + 3),
      annual_spend: Math.round((i * 19) % 50000),
      sales_rep: `rep${(i % 40) + 1}@example.com`,
    })),
  ),
)

// 4 — support_tickets.xlsx (~12k, 10 cols)
manifests.push(
  writeXlsx(
    '04_support_tickets.xlsx',
    'Tickets',
    range(12000, (i) => ({
      ticket_id: `T-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 7),
      customer_id: customerId(i + 7),
      channel: ['email', 'chat', 'phone', 'portal'][i % 4],
      priority: ['low', 'med', 'high', 'urgent'][i % 4],
      status: ['open', 'pending', 'solved', 'closed'][i % 4],
      subject: `Issue ${i + 1}`,
      product_sku: `SKU-${String(1 + (i % 500)).padStart(4, '0')}`,
      opened_at: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      csat: 1 + (i % 5),
    })),
  ),
)

// 5 — web_events.xlsx (~15k, 8 cols)
manifests.push(
  writeXlsx(
    '05_web_events.xlsx',
    'WebEvents',
    range(15000, (i) => ({
      event_id: `WE-${String(i + 1).padStart(6, '0')}`,
      email: emailFor(i),
      customer_id: customerId(i),
      event_name: ['page_view', 'click', 'signup', 'checkout', 'search'][i % 5],
      path: `/app/${['home', 'pricing', 'docs', 'billing', 'settings'][i % 5]}`,
      session_id: `sess_${customerId(i)}_${i % 900}`,
      device: ['desktop', 'mobile', 'tablet'][i % 3],
      ts: `2024-06-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
    })),
  ),
)

// 6 — invoices.xlsx (~7k, 9 cols)
manifests.push(
  writeXlsx(
    '06_invoices.xlsx',
    'Invoices',
    range(7000, (i) => ({
      invoice_id: `INV-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 19),
      customer_id: customerId(i + 19),
      amount_usd: Math.round(((i * 47) % 9000) + 10),
      currency: ['USD', 'EUR', 'GBP', 'INR'][i % 4],
      status: ['draft', 'sent', 'paid', 'void'][i % 4],
      due_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-28`,
      order_ref: `ORD-${100 + (i % 3500)}`,
      tax_code: ['US-CA', 'US-NY', 'EU-DE', 'IN-GST'][i % 4],
    })),
  ),
)

// 7 — products_catalog.xlsx (~5k, 12 cols)
manifests.push(
  writeXlsx(
    '07_products_catalog.xlsx',
    'Products',
    range(5000, (i) => ({
      sku: `SKU-${String(i + 1).padStart(4, '0')}`,
      name: `Product ${i + 1}`,
      category: ['widgets', 'gadgets', 'bolts', 'kits', 'parts'][i % 5],
      unit_price: Math.round((5 + (i % 95)) * 100) / 100,
      cost: Math.round((2 + (i % 40)) * 100) / 100,
      vendor: `Vendor ${(i % 50) + 1}`,
      warehouse: ['WH-EAST', 'WH-WEST', 'WH-EU'][i % 3],
      active: i % 17 !== 0,
      weight_kg: Math.round(((i % 20) + 0.1) * 10) / 10,
      length_cm: 10 + (i % 40),
      width_cm: 5 + (i % 20),
      height_cm: 2 + (i % 15),
    })),
  ),
)

// 8 — nps_responses.csv (~6k, 5 cols)
manifests.push(
  writeCsv(
    '08_nps_responses.csv',
    range(6000, (i) => ({
      response_id: `NPS-${i + 1}`,
      email: emailFor(i + 23),
      customer_id: customerId(i + 23),
      score: i % 11,
      comment: i % 5 === 0 ? `Feedback note ${i}` : '',
    })),
  ),
)

// 9 — marketing_touch.csv (~10k, 6 cols)
manifests.push(
  writeCsv(
    '09_marketing_touch.csv',
    range(10000, (i) => ({
      touch_id: `MT-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 29),
      customer_id: customerId(i + 29),
      channel: ['email', 'ads', 'social', 'partner'][i % 4],
      campaign_id: `cmp-${String(1 + (i % 8000)).padStart(5, '0')}`,
      touched_at: `2024-05-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
  ),
)

// 10 — refunds.csv (~4k, 8 cols)
manifests.push(
  writeCsv(
    '10_refunds.csv',
    range(4000, (i) => ({
      refund_id: `RF-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 31),
      customer_id: customerId(i + 31),
      invoice_id: `INV-${String(1 + (i % 7000)).padStart(5, '0')}`,
      amount_usd: Math.round(((i * 11) % 500) + 1),
      reason: ['duplicate', 'fraud', 'goodwill', 'defect'][i % 4],
      status: ['pending', 'approved', 'rejected'][i % 3],
      created_at: `2024-07-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
  ),
)

// 11 — referrals.csv (~5k, 4 cols)
manifests.push(
  writeCsv(
    '11_referrals.csv',
    range(5000, (i) => ({
      referral_id: `REF-${i + 1}`,
      referrer_email: emailFor(i),
      invitee_email: emailFor(i + 50),
      status: ['sent', 'accepted', 'expired'][i % 3],
    })),
  ),
)

// 12 — subscriptions.xlsx (~6k, 11 cols)
manifests.push(
  writeXlsx(
    '12_subscriptions.xlsx',
    'Subscriptions',
    range(6000, (i) => ({
      subscription_id: `SUB-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 41),
      customer_id: customerId(i + 41),
      plan: ['free', 'pro', 'enterprise'][i % 3],
      mrr_usd: [0, 49, 299][i % 3],
      seats: 1 + (i % 20),
      status: ['trialing', 'active', 'past_due', 'canceled'][i % 4],
      started_at: `2023-${String((i % 12) + 1).padStart(2, '0')}-01`,
      renews_at: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
      payment_method: ['card', 'invoice', 'ach'][i % 3],
      region_code: ['NA', 'EU', 'APAC', 'LATAM'][i % 4],
    })),
  ),
)

// 13 — device_registry.csv (~3k, 15 cols)
manifests.push(
  writeCsv(
    '13_device_registry.csv',
    range(3000, (i) => ({
      device_id: `DEV-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 13),
      customer_id: customerId(i + 13),
      os: ['ios', 'android', 'windows', 'macos', 'linux'][i % 5],
      os_version: `${10 + (i % 5)}.${i % 9}`,
      app_version: `1.${i % 9}.${i % 5}`,
      manufacturer: ['Apple', 'Samsung', 'Google', 'Dell', 'Lenovo'][i % 5],
      model: `Model-${(i % 40) + 1}`,
      push_enabled: i % 2 === 0,
      locale: ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'hi-IN'][i % 5],
      timezone: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata'][i % 4],
      last_seen: `2024-08-${String((i % 28) + 1).padStart(2, '0')}`,
      battery_pct: (i * 7) % 100,
      network: ['wifi', 'cellular', 'ethernet'][i % 3],
      rooted: i % 23 === 0,
    })),
  ),
)

// 14 — geo_ip_lookup.csv (~2k, 3 cols) — skinny file
manifests.push(
  writeCsv(
    '14_geo_ip_lookup.csv',
    range(2000, (i) => ({
      ip: `10.${(i >> 8) % 256}.${i % 256}.${(i * 3) % 256}`,
      country: ['US', 'IN', 'DE', 'GB', 'BR', 'JP'][i % 6],
      region_code: ['NA', 'EU', 'APAC', 'LATAM'][i % 4],
    })),
  ),
)

// 15 — order_shipments.xlsx (~8k, 14 cols)
manifests.push(
  writeXlsx(
    '15_order_shipments.xlsx',
    'Shipments',
    range(8000, (i) => ({
      shipment_id: `SHP-${String(i + 1).padStart(5, '0')}`,
      email: emailFor(i + 17),
      customer_id: customerId(i + 17),
      order_id: 1 + ((i * 41) % 3500),
      carrier: ['UPS', 'FedEx', 'DHL', 'USPS'][i % 4],
      tracking: `TRK${100000 + i}`,
      status: ['label', 'in_transit', 'delivered', 'exception'][i % 4],
      ship_city: `City ${(i % 80) + 1}`,
      ship_state: ['CA', 'NY', 'TX', 'WA', 'MA'][i % 5],
      ship_zip: String(10000 + (i % 89999)),
      weight_kg: Math.round(((i % 25) + 0.2) * 10) / 10,
      shipped_at: `2024-04-${String((i % 28) + 1).padStart(2, '0')}`,
      delivered_at: i % 4 === 2 ? `2024-04-${String(((i + 3) % 28) + 1).padStart(2, '0')}` : '',
      cost_usd: Math.round(((i * 3) % 40) + 5),
    })),
  ),
)

const totalRows = manifests.reduce((s, m) => s + m.rows, 0)
const totalColsAvg =
  manifests.reduce((s, m) => s + m.cols, 0) / Math.max(manifests.length, 1)

const summary = {
  generatedAt: new Date().toISOString(),
  outputDir: OUT,
  fileCount: manifests.length,
  totalRows,
  avgColumns: Math.round(totalColsAvg * 10) / 10,
  joinKeys: ['email', 'owner_email', 'customer_id', 'referrer_email', 'invitee_email'],
  files: manifests.map((m) => ({
    file: m.path.split(/[/\\]/).pop(),
    rows: m.rows,
    cols: m.cols,
    bytes: statSync(m.path).size,
  })),
}

writeFileSync(resolve(OUT, 'MANIFEST.json'), JSON.stringify(summary, null, 2), 'utf8')

console.log(`Wrote ${manifests.length} files → ${OUT}`)
console.log(`TOTAL rows: ${totalRows}`)
for (const f of summary.files) {
  console.log(
    `  ${f.file.padEnd(28)} rows=${String(f.rows).padStart(6)} cols=${String(f.cols).padStart(2)}  ${(f.bytes / 1024).toFixed(1)} KB`,
  )
}
console.log('Join keys: email / customer_id (aligns with Postgres + Mongo customer_demo)')
