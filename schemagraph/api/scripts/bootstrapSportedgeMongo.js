/**
 * SportEdge Mongo warehouse ops — 10 collections, aligned join keys.
 *   set SPORTEDGE_MONGO_URI=mongodb+srv://user:pass@cluster/sportedge_warehouse
 *   npm run bootstrap:sportedge-mongo
 */
import { MongoClient } from 'mongodb'

const URI = process.env.SPORTEDGE_MONGO_URI || process.env.STITCH_MONGO_URI
const DB = process.env.SPORTEDGE_MONGO_DB || 'sportedge_warehouse'

const N = {
  inventory: Number(process.env.SPORTEDGE_MONGO_INVENTORY || 5000),
  pickPack: Number(process.env.SPORTEDGE_MONGO_PICKPACK || 8000),
  returns: Number(process.env.SPORTEDGE_MONGO_RETURNS || 2000),
  fraud: Number(process.env.SPORTEDGE_MONGO_FRAUD || 1500),
  missing: Number(process.env.SPORTEDGE_MONGO_MISSING || 800),
  cod: Number(process.env.SPORTEDGE_MONGO_COD || 2500),
  offers: Number(process.env.SPORTEDGE_MONGO_OFFERS || 3000),
  inbound: Number(process.env.SPORTEDGE_MONGO_INBOUND || 2000),
  sla: Number(process.env.SPORTEDGE_MONGO_SLA || 365),
  audit: Number(process.env.SPORTEDGE_MONGO_AUDIT || 4000),
}

const WAREHOUSES = ['WH-MUM-01', 'WH-DEL-01', 'WH-BLR-01', 'WH-CHN-01', 'WH-KOL-01']
const BRANDS = ['PUMA', 'NIKE']

function sku(g) {
  const n = 1 + (g % 500)
  return g % 2 === 0
    ? `PUMA-SKU-${String(n).padStart(5, '0')}`
    : `NIKE-SKU-${String(n).padStart(5, '0')}`
}

function orderId(g) {
  return `ORD-${String(1 + (g % 3500)).padStart(8, '0')}`
}

function customerId(g) {
  return 1 + (g % 2500)
}

async function chunked(coll, docs, size = 1000) {
  for (let i = 0; i < docs.length; i += size) {
    await coll.insertMany(docs.slice(i, i + size), { ordered: false })
  }
}

async function main() {
  if (!URI) {
    console.error('Set SPORTEDGE_MONGO_URI (MongoDB Atlas connection string).')
    process.exit(1)
  }

  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 20_000 })
  await client.connect()
  const db = client.db(DB)

  const collections = [
    'warehouse_inventory_snapshots',
    'pick_pack_events',
    'returns_intake',
    'fraud_signals',
    'missing_item_reports',
    'cod_collection_events',
    'offer_redemptions',
    'inbound_shipments',
    'warehouse_sla_metrics',
    'fulfillment_audit_logs',
  ]
  for (const c of collections) await db.collection(c).deleteMany({})

  await chunked(
    db.collection('warehouse_inventory_snapshots'),
    Array.from({ length: N.inventory }, (_, g) => ({
      warehouse_id: WAREHOUSES[g % WAREHOUSES.length],
      sku: sku(g),
      brand_code: BRANDS[g % 2],
      size_code: ['S', 'M', 'L', 'XL'][g % 4],
      qty_on_hand: 10 + (g % 500),
      snapshot_at: new Date(Date.now() - (g % 7) * 86400000),
    })),
  )

  await chunked(
    db.collection('pick_pack_events'),
    Array.from({ length: N.pickPack }, (_, g) => ({
      order_id: orderId(g),
      customer_id: customerId(g),
      warehouse_id: WAREHOUSES[g % WAREHOUSES.length],
      event: ['picked', 'packed', 'labeled', 'handed_to_carrier'][g % 4],
      sku: sku(g),
      event_at: new Date(Date.now() - (g % 30) * 3600000),
    })),
  )

  await chunked(
    db.collection('returns_intake'),
    Array.from({ length: N.returns }, (_, g) => ({
      return_id: `RET-${String(g + 1).padStart(6, '0')}`,
      order_id: orderId(g),
      customer_id: customerId(g),
      sku: sku(g),
      reason: ['size_issue', 'defect', 'wrong_item'][g % 3],
      condition: ['good', 'damaged'][g % 2],
      received_at: new Date(Date.now() - (g % 60) * 86400000),
    })),
  )

  await chunked(
    db.collection('fraud_signals'),
    Array.from({ length: N.fraud }, (_, g) => ({
      order_id: orderId(g),
      customer_id: customerId(g),
      fraud_score: (g % 100) / 100,
      signal_type: ['velocity', 'address_mismatch', 'cod_risk'][g % 3],
      detected_at: new Date(Date.now() - (g % 14) * 86400000),
    })),
  )

  await chunked(
    db.collection('missing_item_reports'),
    Array.from({ length: N.missing }, (_, g) => ({
      order_id: orderId(g),
      sku: sku(g),
      warehouse_id: WAREHOUSES[g % WAREHOUSES.length],
      reported_at: new Date(Date.now() - (g % 20) * 86400000),
    })),
  )

  await chunked(
    db.collection('cod_collection_events'),
    Array.from({ length: N.cod }, (_, g) => ({
      order_id: orderId(g),
      customer_id: customerId(g),
      amount_collected: 500 + (g % 9000),
      rider_id: `RIDER-${(g % 200) + 1}`,
      collected_at: new Date(Date.now() - (g % 45) * 86400000),
    })),
  )

  await chunked(
    db.collection('offer_redemptions'),
    Array.from({ length: N.offers }, (_, g) => ({
      order_id: orderId(g),
      offer_code: `OFFER${(g % 50) + 1}`,
      brand_code: BRANDS[g % 2],
      discount_amount: 50 + (g % 500),
      redeemed_at: new Date(Date.now() - (g % 90) * 86400000),
    })),
  )

  await chunked(
    db.collection('inbound_shipments'),
    Array.from({ length: N.inbound }, (_, g) => ({
      shipment_id: `INB-${String(g + 1).padStart(6, '0')}`,
      vendor_id: g % 2 === 0 ? 'V-PUMA-01' : 'V-NIKE-01',
      sku: sku(g),
      qty_expected: 10 + (g % 200),
      warehouse_id: WAREHOUSES[g % WAREHOUSES.length],
      eta: new Date(Date.now() + (g % 14) * 86400000),
    })),
  )

  await chunked(
    db.collection('warehouse_sla_metrics'),
    Array.from({ length: N.sla }, (_, g) => ({
      warehouse_id: WAREHOUSES[g % WAREHOUSES.length],
      metric_date: new Date(Date.now() - g * 86400000),
      orders_shipped: 50 + (g % 200),
      avg_fulfillment_hours: 4 + (g % 20),
    })),
  )

  await chunked(
    db.collection('fulfillment_audit_logs'),
    Array.from({ length: N.audit }, (_, g) => ({
      order_id: orderId(g),
      warehouse_id: WAREHOUSES[g % WAREHOUSES.length],
      action: ['assign', 'pick', 'pack', 'ship'][g % 4],
      actor: `ops_${(g % 30) + 1}`,
      logged_at: new Date(Date.now() - (g % 60) * 3600000),
    })),
  )

  console.log(`Mongo SportEdge ready: ${DB}`)
  for (const c of collections) {
    const n = await db.collection(c).countDocuments()
    console.log(`  ${c}: ${n}`)
  }
  await client.close()
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
