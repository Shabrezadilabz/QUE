/**
 * Generate SportEdge Excel, CSV, and Databricks fixture files (local disk).
 *   npm run fixtures:sportedge
 *
 * Output:
 *   docs/tester-fixtures/sportedge/excel/   (3 marketing xlsx + 2 vendor xlsx)
 *   docs/tester-fixtures/sportedge/csv/     (3 marketing csv + 2 vendor csv)
 *   api/fixtures/sportedge_databricks_demo.json (20 tables)
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const EXCEL_OUT = resolve(ROOT, 'docs/tester-fixtures/sportedge/excel')
const CSV_OUT = resolve(ROOT, 'docs/tester-fixtures/sportedge/csv')
const DBX_OUT = resolve(ROOT, 'api/fixtures/sportedge_databricks_demo.json')

mkdirSync(EXCEL_OUT, { recursive: true })
mkdirSync(CSV_OUT, { recursive: true })

const CUSTOMER_N = 2500
const BRANDS = ['PUMA', 'NIKE']
const REGIONS = ['IN-WEST', 'IN-NORTH', 'IN-SOUTH', 'IN-EAST']
const WAREHOUSES = ['WH-MUM-01', 'WH-DEL-01', 'WH-BLR-01', 'WH-CHN-01', 'WH-KOL-01']

function emailFor(i) {
  if (i === 1) return 'ada@example.com'
  if (i === 2) return 'grace@example.com'
  if (i === 3) return 'alan@example.com'
  return `user${i}@example.com`
}

function customerId(i) {
  return 1 + (i % CUSTOMER_N)
}

function productSku(g) {
  const n = 1 + (g % 250)
  return g % 2 === 0 ? `PUMA-SKU-${String(n).padStart(5, '0')}` : `NIKE-SKU-${String(n).padStart(5, '0')}`
}

function orderId(g) {
  return `ORD-${String(1 + (g % 3500)).padStart(8, '0')}`
}

function range(n, fn) {
  return Array.from({ length: n }, (_, i) => fn(i))
}

function writeXlsx(dir, filename, sheetName, rows) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName.slice(0, 31))
  XLSX.writeFile(wb, resolve(dir, filename))
  return { file: filename, rows: rows.length, cols: Object.keys(rows[0] || {}).length }
}

function writeCsv(dir, filename, rows) {
  const headers = Object.keys(rows[0] || {})
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  writeFileSync(
    resolve(dir, filename),
    [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n'),
    'utf8',
  )
  return { file: filename, rows: rows.length, cols: headers.length }
}

const manifest = { excel: [], csv: [], generatedAt: new Date().toISOString() }

// --- Marketing Excel (3 files) ---
manifest.excel.push(
  writeXlsx(
    EXCEL_OUT,
    'mkt_products_catalog.xlsx',
    'Products',
    range(5000, (i) => ({
      sku: productSku(i),
      brand_code: BRANDS[i % 2],
      name: `${BRANDS[i % 2]} Product ${i + 1}`,
      category: ['footwear', 'apparel', 'accessories'][i % 3],
      mrp: 999 + ((i * 137) % 8900),
      size_run: 'S-XXL',
      color: ['black', 'white', 'red', 'blue'][i % 4],
      launch_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
      is_active: i % 17 !== 0,
      regional_stock_flag: i % 3 === 0,
      marketing_tag: ['bestseller', 'new', 'sale', 'limited'][i % 4],
      vendor_id: i % 2 === 0 ? 'V-PUMA-01' : 'V-NIKE-01',
    })),
  ),
)

manifest.excel.push(
  writeXlsx(
    EXCEL_OUT,
    'mkt_ad_campaigns.xlsx',
    'Campaigns',
    range(8000, (i) => ({
      campaign_id: `CMP-${String(i + 1).padStart(5, '0')}`,
      brand_code: BRANDS[i % 2],
      channel: ['meta', 'google', 'instagram', 'youtube'][i % 4],
      budget_inr: 5000 + ((i * 211) % 495000),
      start_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
      end_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-28`,
      owner_email: emailFor(1 + (i % CUSTOMER_N)),
      target_region: REGIONS[i % 4],
      sku_focus: productSku(i),
      status: ['live', 'paused', 'completed'][i % 3],
    })),
  ),
)

manifest.excel.push(
  writeXlsx(
    EXCEL_OUT,
    'mkt_ad_reach_daily.xlsx',
    'AdReach',
    range(10000, (i) => ({
      campaign_id: `CMP-${String(1 + (i % 8000)).padStart(5, '0')}`,
      reach_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      impressions: 1000 + ((i * 53) % 500000),
      clicks: 10 + (i % 8000),
      spend_inr: 100 + ((i * 17) % 50000),
      conversions: i % 40,
      region_code: REGIONS[i % 4],
      brand_code: BRANDS[i % 2],
    })),
  ),
)

// --- Vendor Excel (2 files) ---
manifest.excel.push(
  writeXlsx(
    EXCEL_OUT,
    'vendor_master.xlsx',
    'Vendors',
    range(200, (i) => ({
      vendor_id: i % 2 === 0 ? 'V-PUMA-01' : 'V-NIKE-01',
      brand_code: BRANDS[i % 2],
      vendor_name: `${BRANDS[i % 2]} Vendor ${i + 1}`,
      contact_email: `vendor${i + 1}@sportedge.test`,
      city: ['Mumbai', 'Delhi', 'Bangalore'][i % 3],
      gstin: `27AABCU${String(9603 + i).padStart(4, '0')}Z${i % 9}`,
      contract_tier: ['gold', 'silver', 'bronze'][i % 3],
    })),
  ),
)

manifest.excel.push(
  writeXlsx(
    EXCEL_OUT,
    'vendor_catalog.xlsx',
    'VendorCatalog',
    range(5000, (i) => ({
      vendor_id: i % 2 === 0 ? 'V-PUMA-01' : 'V-NIKE-01',
      sku: productSku(i),
      cost_price: 300 + ((i * 11) % 3000),
      moq: 10 + (i % 100),
      lead_time_days: 3 + (i % 21),
      brand_code: BRANDS[i % 2],
    })),
  ),
)

// --- Marketing CSV (3 files) ---
manifest.csv.push(
  writeCsv(
    CSV_OUT,
    'mkt_leads.csv',
    range(10000, (i) => ({
      lead_id: `LEAD-${String(i + 1).padStart(6, '0')}`,
      email: emailFor(customerId(i + 11)),
      customer_id: customerId(i + 11),
      campaign_id: `CMP-${String(1 + ((i * 3) % 8000)).padStart(5, '0')}`,
      brand_code: BRANDS[i % 2],
      status: ['open', 'qualified', 'won', 'lost'][i % 4],
      score: (i * 13) % 100,
      created_at: `2024-03-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
  ),
)

manifest.csv.push(
  writeCsv(
    CSV_OUT,
    'mkt_web_events.csv',
    range(15000, (i) => ({
      event_id: `EVT-${String(i + 1).padStart(7, '0')}`,
      session_id: `SES-${String(1 + (i % 5000)).padStart(6, '0')}`,
      customer_id: customerId(i),
      email: emailFor(customerId(i)),
      event_type: ['view', 'add_to_cart', 'checkout', 'purchase'][i % 4],
      sku: productSku(i),
      brand_code: BRANDS[i % 2],
      event_at: `2024-06-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`,
      region_code: REGIONS[i % 4],
    })),
  ),
)

manifest.csv.push(
  writeCsv(
    CSV_OUT,
    'mkt_regional_stock.csv',
    range(8000, (i) => ({
      sku: productSku(i),
      brand_code: BRANDS[i % 2],
      region_code: REGIONS[i % 4],
      stock_qty: 5 + (i % 500),
      reserved_qty: i % 50,
      updated_at: `2024-08-${String((i % 28) + 1).padStart(2, '0')}`,
    })),
  ),
)

// --- Vendor CSV (2 files) ---
manifest.csv.push(
  writeCsv(
    CSV_OUT,
    'vendor_purchase_orders.csv',
    range(5000, (i) => ({
      po_id: `PO-${String(i + 1).padStart(6, '0')}`,
      vendor_id: i % 2 === 0 ? 'V-PUMA-01' : 'V-NIKE-01',
      sku: productSku(i),
      qty: 10 + (i % 200),
      status: ['open', 'shipped', 'received', 'closed'][i % 4],
      brand_code: BRANDS[i % 2],
      warehouse_id: WAREHOUSES[i % 5],
    })),
  ),
)

manifest.csv.push(
  writeCsv(
    CSV_OUT,
    'vendor_commissions.csv',
    range(4000, (i) => ({
      vendor_id: i % 2 === 0 ? 'V-PUMA-01' : 'V-NIKE-01',
      order_id: orderId(i),
      customer_id: customerId(i),
      commission_pct: 5 + (i % 15),
      commission_inr: 50 + ((i * 7) % 2000),
      brand_code: BRANDS[i % 2],
    })),
  ),
)

writeFileSync(resolve(EXCEL_OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))

// --- Databricks fixture (20 tables, schema + samples) ---
const sample = (vals) => vals.map((v) => String(v))

function col(name, dataType, keyKind, samples, extra = {}) {
  return { name, dataType, keyKind, nullable: keyKind !== 'pk', samples: sample(samples), ...extra }
}

const dbxTables = [
  { name: 'dim_brand', columns: [
    col('brand_id', 'INT', 'pk', [1, 2]),
    col('brand_code', 'STRING', 'unique', ['PUMA', 'NIKE']),
    col('name', 'STRING', 'none', ['Puma India', 'Nike India']),
  ]},
  { name: 'dim_warehouse', columns: [
    col('warehouse_id', 'STRING', 'pk', WAREHOUSES.slice(0, 3)),
    col('city', 'STRING', 'none', ['Mumbai', 'Delhi', 'Bangalore']),
    col('region_code', 'STRING', 'none', REGIONS.slice(0, 3)),
  ]},
  { name: 'dim_customer', columns: [
    col('customer_sk', 'BIGINT', 'pk', [1001, 1002, 1003]),
    col('pg_customer_id', 'INT', 'fk', [1, 2, 3, 4, 5]),
    col('email', 'STRING', 'unique', ['ada@example.com', 'grace@example.com', 'user4@example.com']),
    col('region_code', 'STRING', 'none', REGIONS),
  ]},
  { name: 'dim_product', columns: [
    col('product_sk', 'BIGINT', 'pk', [2001, 2002, 2003]),
    col('sku', 'STRING', 'unique', ['PUMA-SKU-00001', 'NIKE-SKU-00001', 'PUMA-SKU-00002']),
    col('brand_code', 'STRING', 'fk', BRANDS),
    col('category', 'STRING', 'none', ['footwear', 'apparel']),
  ]},
  { name: 'dim_vendor', columns: [
    col('vendor_id', 'STRING', 'pk', ['V-PUMA-01', 'V-NIKE-01']),
    col('brand_code', 'STRING', 'none', BRANDS),
    col('vendor_name', 'STRING', 'none', ['Puma Vendor', 'Nike Vendor']),
  ]},
  { name: 'dim_date', columns: [
    col('date_key', 'INT', 'pk', [20240101, 20240102, 20240103]),
    col('year', 'INT', 'none', [2024, 2024, 2024]),
    col('month', 'INT', 'none', [1, 1, 1]),
  ]},
  { name: 'fact_orders', columns: [
    col('order_sk', 'BIGINT', 'pk', [9001, 9002, 9003]),
    col('order_id', 'STRING', 'unique', ['ORD-00000001', 'ORD-00000002', 'ORD-00000003']),
    col('pg_customer_id', 'INT', 'fk', [1, 2, 3]),
    col('brand_code', 'STRING', 'none', BRANDS),
    col('order_total_inr', 'DECIMAL(12,2)', 'none', ['1299.00', '4599.00', '899.00']),
    col('warehouse_id', 'STRING', 'fk', WAREHOUSES.slice(0, 3)),
  ]},
  { name: 'fact_order_items', columns: [
    col('order_item_sk', 'BIGINT', 'pk', [9101, 9102, 9103]),
    col('order_id', 'STRING', 'fk', ['ORD-00000001', 'ORD-00000001', 'ORD-00000002']),
    col('sku', 'STRING', 'fk', ['PUMA-SKU-00001-S', 'PUMA-SKU-00001-M', 'NIKE-SKU-00001-L']),
    col('quantity', 'INT', 'none', [1, 2, 1]),
    col('unit_price_inr', 'DECIMAL(12,2)', 'none', ['1299.00', '1299.00', '4599.00']),
  ]},
  { name: 'fact_shipments', columns: [
    col('shipment_sk', 'BIGINT', 'pk', [9201, 9202]),
    col('order_id', 'STRING', 'fk', ['ORD-00000001', 'ORD-00000002']),
    col('warehouse_id', 'STRING', 'fk', ['WH-MUM-01', 'WH-DEL-01']),
    col('shipped_at', 'TIMESTAMP', 'none', ['2024-06-01T10:00:00Z', '2024-06-02T11:00:00Z']),
  ]},
  { name: 'fact_returns', columns: [
    col('return_sk', 'BIGINT', 'pk', [9301, 9302]),
    col('order_id', 'STRING', 'fk', ['ORD-00000010', 'ORD-00000011']),
    col('sku', 'STRING', 'none', ['PUMA-SKU-00005-M', 'NIKE-SKU-00012-L']),
    col('refund_amount_inr', 'DECIMAL(12,2)', 'none', ['999.00', '2499.00']),
  ]},
  { name: 'fact_payments', columns: [
    col('payment_sk', 'BIGINT', 'pk', [9401, 9402]),
    col('order_id', 'STRING', 'fk', ['ORD-00000001', 'ORD-00000005']),
    col('method', 'STRING', 'none', ['upi', 'cod']),
    col('amount_inr', 'DECIMAL(12,2)', 'none', ['1299.00', '4599.00']),
    col('is_cod', 'BOOLEAN', 'none', ['false', 'true']),
  ]},
  { name: 'fact_ad_spend', columns: [
    col('campaign_id', 'STRING', 'fk', ['CMP-00001', 'CMP-00002']),
    col('date_key', 'INT', 'fk', [20240101, 20240102]),
    col('brand_code', 'STRING', 'none', BRANDS),
    col('spend_inr', 'DECIMAL(12,2)', 'none', ['5000.00', '12000.00']),
    col('impressions', 'BIGINT', 'none', ['50000', '120000']),
  ]},
  { name: 'fact_wishlist_daily', columns: [
    col('date_key', 'INT', 'pk', [20240101, 20240102]),
    col('sku', 'STRING', 'pk', ['PUMA-SKU-00001', 'NIKE-SKU-00001']),
    col('wishlist_count', 'INT', 'none', [120, 85]),
    col('brand_code', 'STRING', 'none', BRANDS),
  ]},
  { name: 'fact_fraud', columns: [
    col('order_id', 'STRING', 'pk', ['ORD-00000099', 'ORD-00000100']),
    col('fraud_score', 'DOUBLE', 'none', ['0.82', '0.91']),
    col('signal_type', 'STRING', 'none', ['cod_risk', 'velocity']),
  ]},
  { name: 'fact_inventory_daily', columns: [
    col('date_key', 'INT', 'pk', [20240101, 20240101]),
    col('warehouse_id', 'STRING', 'pk', ['WH-MUM-01', 'WH-DEL-01']),
    col('sku', 'STRING', 'pk', ['PUMA-SKU-00001', 'NIKE-SKU-00001']),
    col('qty_on_hand', 'INT', 'none', [200, 150]),
  ]},
  { name: 'fact_cod_reconciliation', columns: [
    col('order_id', 'STRING', 'pk', ['ORD-00000005', 'ORD-00000010']),
    col('expected_inr', 'DECIMAL(12,2)', 'none', ['4599.00', '1299.00']),
    col('collected_inr', 'DECIMAL(12,2)', 'none', ['4599.00', '1200.00']),
    col('variance_inr', 'DECIMAL(12,2)', 'none', ['0.00', '-99.00']),
  ]},
  { name: 'fact_vendor_payouts', columns: [
    col('vendor_id', 'STRING', 'pk', ['V-PUMA-01', 'V-NIKE-01']),
    col('period_month', 'STRING', 'pk', ['2024-06', '2024-06']),
    col('payout_inr', 'DECIMAL(14,2)', 'none', ['250000.00', '380000.00']),
  ]},
  { name: 'bridge_campaign_product', columns: [
    col('campaign_id', 'STRING', 'pk', ['CMP-00001', 'CMP-00002']),
    col('sku', 'STRING', 'pk', ['PUMA-SKU-00001', 'NIKE-SKU-00001']),
    col('brand_code', 'STRING', 'none', BRANDS),
  ]},
  { name: 'bridge_order_offer', columns: [
    col('order_id', 'STRING', 'pk', ['ORD-00000001', 'ORD-00000002']),
    col('offer_code', 'STRING', 'pk', ['OFFER10', 'OFFER20']),
    col('discount_inr', 'DECIMAL(12,2)', 'none', ['100.00', '200.00']),
  ]},
  { name: 'agg_daily_revenue_by_brand', columns: [
    col('date_key', 'INT', 'pk', [20240101, 20240101]),
    col('brand_code', 'STRING', 'pk', BRANDS),
    col('revenue_inr', 'DECIMAL(14,2)', 'none', ['1250000.00', '980000.00']),
    col('order_count', 'INT', 'none', [420, 380]),
  ]},
].map((t) => ({ ...t, entityKind: 'TABLE' }))

writeFileSync(
  DBX_OUT,
  JSON.stringify(
    {
      catalog: 'main',
      schema: 'sportedge',
      notes: 'SportEdge Databricks fixture — 20 tables. Join keys: pg_customer_id, order_id, sku, brand_code.',
      tables: dbxTables,
      foreignKeys: [
        { fromTable: 'fact_orders', fromColumn: 'pg_customer_id', toTable: 'dim_customer', toColumn: 'pg_customer_id', constraintName: 'fk_orders_customer' },
        { fromTable: 'fact_order_items', fromColumn: 'order_id', toTable: 'fact_orders', toColumn: 'order_id', constraintName: 'fk_items_order' },
      ],
    },
    null,
    2,
  ),
)

const excelRows = manifest.excel.reduce((s, f) => s + f.rows, 0)
const csvRows = manifest.csv.reduce((s, f) => s + f.rows, 0)
console.log('SportEdge fixtures generated:')
console.log(`  Excel: ${manifest.excel.length} files, ${excelRows} rows → ${EXCEL_OUT}`)
console.log(`  CSV:   ${manifest.csv.length} files, ${csvRows} rows → ${CSV_OUT}`)
console.log(`  Databricks: 20 tables → ${DBX_OUT}`)
console.log('\nNext: npm run bootstrap:sportedge-all')
