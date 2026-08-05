/**
 * Bulk Mongo seed for Que tester walkthrough.
 * DB: customer_demo — shares emails with Postgres customer_demo for cross-source joins.
 *
 *   node scripts/applyCustomerDemoMongoBulk.js
 */
import { MongoClient } from 'mongodb'

const URI = process.env.STITCH_MONGO_URI || 'mongodb://localhost:27017'
const DB = process.env.STITCH_DEMO_MONGO_DB || 'customer_demo'

const EVENT_N = Number(process.env.QUE_MONGO_EVENTS || 8000)
const SESSION_N = Number(process.env.QUE_MONGO_SESSIONS || 3000)
const PROFILE_N = Number(process.env.QUE_MONGO_PROFILES || 2500)

function emailFor(g) {
  if (g === 1) return 'ada@example.com'
  if (g === 2) return 'grace@example.com'
  if (g === 3) return 'alan@example.com'
  return `user${g}@example.com`
}

function nameFor(g) {
  if (g === 1) return 'Ada Lovelace'
  if (g === 2) return 'Grace Hopper'
  if (g === 3) return 'Alan Turing'
  return `Customer ${g}`
}

function chunkedInsert(coll, docs, size = 1000) {
  const ops = []
  for (let i = 0; i < docs.length; i += size) {
    ops.push(coll.insertMany(docs.slice(i, i + size), { ordered: false }))
  }
  return Promise.all(ops)
}

async function main() {
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10_000 })
  await client.connect()
  const db = client.db(DB)

  await db.collection('events').deleteMany({})
  await db.collection('sessions').deleteMany({})
  await db.collection('profiles').deleteMany({})

  const eventTypes = ['login', 'purchase', 'signup', 'page_view', 'logout']
  const browsers = ['chrome', 'safari', 'firefox', 'edge']
  const statuses = ['pending', 'shipped', 'cancelled', 'delivered']

  const profiles = []
  for (let g = 1; g <= PROFILE_N; g++) {
    profiles.push({
      customer_key: g,
      email: emailFor(g),
      full_name: nameFor(g),
      tier: ['free', 'pro', 'enterprise'][g % 3],
      pg_customer_id: g, // aligns with Postgres customers.id after bulk seed
      prefs: { marketing: g % 2 === 0, locale: g % 2 === 0 ? 'en-US' : 'en-GB' },
      created_at: new Date(Date.now() - (g % 400) * 86400000),
    })
  }

  const events = []
  for (let g = 1; g <= EVENT_N; g++) {
    const cust = 1 + ((g * 37) % PROFILE_N)
    events.push({
      user_id: `a1b2c3d4-${String(cust).padStart(4, '0')}-4000-8000-000000000001`,
      email: emailFor(cust),
      pg_customer_id: cust,
      event_type: eventTypes[g % eventTypes.length],
      severity: 1 + (g % 3),
      meta: {
        browser: browsers[g % browsers.length],
        ip: `10.${(g >> 8) % 256}.${g % 256}.${(g * 3) % 256}`,
      },
      payload:
        g % 5 === 0
          ? { sku: `SKU-${String(1 + (g % 500)).padStart(4, '0')}`, amount: (g % 90) + 5 }
          : undefined,
      status_hint: statuses[g % statuses.length],
      created_at: new Date(Date.now() - (g % 365) * 86400000),
    })
  }

  const sessions = []
  for (let g = 1; g <= SESSION_N; g++) {
    const cust = 1 + ((g * 41) % PROFILE_N)
    sessions.push({
      user_id: `a1b2c3d4-${String(cust).padStart(4, '0')}-4000-8000-000000000001`,
      email: emailFor(cust),
      pg_customer_id: cust,
      session_token: `sess_${cust}_${g}`,
      device: {
        os: ['ios', 'android', 'web'][g % 3],
        app_version: `1.${g % 9}.${g % 5}`,
      },
      started_at: new Date(Date.now() - (g % 180) * 86400000),
      duration_sec: 30 + (g % 3600),
    })
  }

  await chunkedInsert(db.collection('profiles'), profiles)
  await chunkedInsert(db.collection('events'), events)
  await chunkedInsert(db.collection('sessions'), sessions)

  await db.collection('profiles').createIndex({ email: 1 })
  await db.collection('profiles').createIndex({ pg_customer_id: 1 })
  await db.collection('events').createIndex({ email: 1 })
  await db.collection('events').createIndex({ pg_customer_id: 1 })
  await db.collection('sessions').createIndex({ email: 1 })

  const counts = {
    profiles: await db.collection('profiles').countDocuments(),
    events: await db.collection('events').countDocuments(),
    sessions: await db.collection('sessions').countDocuments(),
  }
  const total = counts.profiles + counts.events + counts.sessions
  console.log(`Mongo bulk ready: ${DB} @ ${URI}`)
  console.log(`  profiles: ${counts.profiles}`)
  console.log(`  events:   ${counts.events}`)
  console.log(`  sessions: ${counts.sessions}`)
  console.log(`  TOTAL:    ${total}`)
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
