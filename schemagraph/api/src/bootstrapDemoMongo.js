/**
 * Ensure local Mongo demo DB + sample collections for the Stitch connector.
 * Expects Docker container stitch-mongo (or any Mongo on localhost:27017).
 */
import { MongoClient } from 'mongodb'

const URI = process.env.STITCH_MONGO_URI || 'mongodb://localhost:27017'
const DB = process.env.STITCH_DEMO_MONGO_DB || 'customer_demo'

async function main() {
  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 8_000,
  })
  await client.connect()
  const db = client.db(DB)

  await db.collection('events').deleteMany({})
  await db.collection('sessions').deleteMany({})

  await db.collection('events').insertMany([
    {
      user_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      email: 'ada@example.com',
      event_type: 'login',
      severity: 1,
      meta: { browser: 'chrome', ip: '10.0.0.12' },
      created_at: new Date('2024-03-02T10:00:00Z'),
    },
    {
      user_id: 'a1b2c3d4-0002-4000-8000-000000000002',
      email: 'grace@example.com',
      event_type: 'purchase',
      severity: 2,
      meta: { browser: 'safari', ip: '10.0.0.44' },
      payload: { sku: 'WIDGET-1', amount: 12.5 },
      created_at: new Date('2024-06-20T14:30:00Z'),
    },
    {
      user_id: 'a1b2c3d4-0003-4000-8000-000000000003',
      email: 'alan@example.com',
      event_type: 'signup',
      severity: 1,
      meta: { browser: 'firefox', ip: '10.0.1.9' },
      created_at: new Date('2024-09-05T08:15:00Z'),
    },
  ])

  await db.collection('sessions').insertMany([
    {
      user_id: 'a1b2c3d4-0001-4000-8000-000000000001',
      email: 'ada@example.com',
      session_token: 'sess_ada_1',
      device: { os: 'ios', app_version: '1.4.0' },
      started_at: new Date('2024-03-02T09:55:00Z'),
    },
    {
      user_id: 'a1b2c3d4-0002-4000-8000-000000000002',
      email: 'grace@example.com',
      session_token: 'sess_grace_1',
      device: { os: 'android', app_version: '1.3.2' },
      started_at: new Date('2024-06-20T14:00:00Z'),
    },
  ])

  const events = await db.collection('events').countDocuments()
  const sessions = await db.collection('sessions').countDocuments()
  console.log(
    `Mongo demo ready: ${DB} (events=${events}, sessions=${sessions}) @ ${URI}`,
  )
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
