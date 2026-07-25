/**
 * MongoDB connector — schema probe via sampled documents (not a full dump).
 * Flattens nested fields (dot paths) up to a capped depth.
 */
import { MongoClient, ObjectId } from 'mongodb'

/**
 * @typedef {object} MongoConfig
 * @property {string} [uri]
 * @property {string} [host]
 * @property {number} [port]
 * @property {string} [database]
 * @property {string} [user]
 * @property {string} [password]
 * @property {string[]} [collections]  // optional allow-list
 * @property {number} [sampleSize]     // docs to probe per collection
 * @property {boolean} [includeSamples]
 * @property {number} [sampleLimit]
 * @property {number} [maxDepth]
 */

/**
 * @param {MongoConfig} config
 */
export function buildMongoUri(config = {}) {
  if (config.uri) return config.uri
  const host = config.host ?? 'localhost'
  const port = Number(config.port ?? 27017)
  const user = config.user
  const pass = config.password ?? process.env.STITCH_SOURCE_MONGO_PASSWORD
  if (user && pass) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`
  }
  return `mongodb://${host}:${port}`
}

/**
 * @param {MongoConfig} config
 */
export async function introspectMongo(config = {}) {
  const database = config.database ?? 'customer_demo'
  const sampleSize = Math.min(Number(config.sampleSize ?? 50), 200)
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)
  const maxDepth = Math.min(Number(config.maxDepth ?? 3), 5)
  const allow =
    Array.isArray(config.collections) && config.collections.length
      ? new Set(config.collections)
      : null

  const uri = buildMongoUri(config)
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
  })

  try {
    await client.connect()
    const db = client.db(database)
    const listed = await db.listCollections({}, { nameOnly: true }).toArray()
    const names = listed
      .map((c) => c.name)
      .filter((n) => !n.startsWith('system.'))
      .filter((n) => (allow ? allow.has(n) : true))
      .sort()

    const tables = []
    for (const name of names) {
      const coll = db.collection(name)
      const docs = await coll
        .aggregate([{ $sample: { size: sampleSize } }])
        .toArray()
      // Fallback if $sample empty on tiny collections
      const probed =
        docs.length > 0
          ? docs
          : await coll.find({}).limit(sampleSize).toArray()

      const fieldStats = new Map()
      for (const doc of probed) {
        walkDoc(doc, '', 0, maxDepth, fieldStats)
      }

      const columns = [...fieldStats.entries()]
        .sort(([a], [b]) => {
          if (a === '_id') return -1
          if (b === '_id') return 1
          return a.localeCompare(b)
        })
        .map(([field, stats], ordinal) => {
          const dataType = pickType(stats.types)
          return {
            name: field,
            dataType,
            keyKind: guessKeyKind(field, dataType),
            isNullable: stats.present < probed.length,
            ordinal,
            referencesLabel: null,
            sampleValues: includeSamples
              ? stats.samples.slice(0, sampleLimit)
              : [],
          }
        })

      tables.push({
        name,
        entityKind: 'COLLECTION',
        columns,
      })
    }

    return {
      schema: database,
      tables,
      foreignKeys: [],
    }
  } finally {
    await client.close().catch(() => {})
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {number} depth
 * @param {number} maxDepth
 * @param {Map<string, { types: Map<string, number>, samples: string[], present: number }>} fieldStats
 */
function walkDoc(value, path, depth, maxDepth, fieldStats) {
  if (value == null) return

  if (Array.isArray(value)) {
    record(fieldStats, path || '_root', 'ARRAY', summarize(value))
    // Probe first element shape lightly
    if (value.length && depth < maxDepth) {
      const first = value[0]
      if (isPlainObject(first)) {
        for (const [k, v] of Object.entries(first)) {
          const child = path ? `${path}[].${k}` : `[].${k}`
          walkDoc(v, child, depth + 1, maxDepth, fieldStats)
        }
      } else {
        record(
          fieldStats,
          path ? `${path}[]` : '[]',
          typeOf(first),
          summarize(first),
        )
      }
    }
    return
  }

  if (isPlainObject(value) && depth < maxDepth) {
    // Also record the object node itself when nested
    if (path) record(fieldStats, path, 'OBJECT', '{…}')
    for (const [k, v] of Object.entries(value)) {
      const child = path ? `${path}.${k}` : k
      walkDoc(v, child, depth + 1, maxDepth, fieldStats)
    }
    return
  }

  if (path) {
    record(fieldStats, path, typeOf(value), summarize(value))
  }
}

function record(fieldStats, path, type, sample) {
  if (!path) return
  let stats = fieldStats.get(path)
  if (!stats) {
    stats = { types: new Map(), samples: [], present: 0 }
    fieldStats.set(path, stats)
  }
  stats.present += 1
  stats.types.set(type, (stats.types.get(type) ?? 0) + 1)
  if (sample != null && stats.samples.length < 8) {
    const s = String(sample)
    if (!stats.samples.includes(s)) stats.samples.push(s)
  }
}

function isPlainObject(v) {
  return (
    v != null &&
    typeof v === 'object' &&
    !(v instanceof Date) &&
    !(v instanceof ObjectId) &&
    !Array.isArray(v) &&
    !Buffer.isBuffer(v)
  )
}

function typeOf(v) {
  if (v == null) return 'NULL'
  if (v instanceof ObjectId) return 'OBJECTID'
  if (v instanceof Date) return 'TIMESTAMP'
  if (typeof v === 'boolean') return 'BOOLEAN'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? 'INTEGER' : 'NUMERIC'
  }
  if (typeof v === 'string') return 'TEXT'
  if (Array.isArray(v)) return 'ARRAY'
  if (typeof v === 'object') return 'OBJECT'
  return 'TEXT'
}

function pickType(typeCounts) {
  let best = 'TEXT'
  let n = -1
  for (const [t, c] of typeCounts) {
    if (t === 'NULL') continue
    if (c > n) {
      best = t
      n = c
    }
  }
  return best
}

function summarize(v) {
  if (v instanceof ObjectId) return v.toHexString()
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}…` : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[${v.length}]`
  if (v && typeof v === 'object') return '{…}'
  return String(v)
}

function guessKeyKind(name, dataType) {
  const n = String(name).toLowerCase()
  const leaf = n.includes('.') ? n.slice(n.lastIndexOf('.') + 1) : n
  if (leaf === '_id' || leaf === 'id') return 'pk'
  if (leaf.endsWith('_id') || leaf.endsWith('id')) return 'fk'
  if (leaf.includes('email') && dataType === 'TEXT') return 'unique'
  return 'none'
}
