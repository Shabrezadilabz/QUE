/**
 * Salesforce connector — sObject describe introspection (Wave 4.1).
 *
 * Modes:
 * - fixture: api/fixtures/salesforce_demo.json
 * - live: REST describeGlobal + describe (instanceUrl + access token)
 *
 * Schema metadata only — optional capped sample via SOQL LIMIT.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '../..')

const SF_API = 'v59.0'

/**
 * @param {object} config
 */
export async function introspectSalesforce(config = {}) {
  const mode =
    config.mode ||
    (config.instanceUrl && (config.token || config.accessToken)
      ? 'live'
      : 'fixture')

  if (mode === 'fixture') {
    return introspectFromFixture(config)
  }
  return introspectLive(config)
}

function resolveFixturePath(p) {
  if (!p) return resolve(API_ROOT, 'fixtures/salesforce_demo.json')
  if (p.match(/^[a-zA-Z]:[\\/]/) || p.startsWith('/')) return p
  return resolve(API_ROOT, p)
}

function simpleKeyKind(name, type) {
  const n = String(name || '')
  const t = String(type || '').toLowerCase()
  if (n === 'Id' || t === 'id') return 'pk'
  if (t === 'reference' || n.endsWith('Id')) return 'fk'
  if (t === 'email' || n.toLowerCase().includes('email')) return 'unique'
  return 'none'
}

function introspectFromFixture(config) {
  const path = resolveFixturePath(config.fixturesPath)
  if (!existsSync(path)) {
    return {
      schema: 'salesforce',
      tables: [],
      foreignKeys: [],
      meta: { mode: 'fixture', fixtureMissing: path },
    }
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const includeSamples = config.includeSamples !== false
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 5)

  const tables = (raw.tables || []).map((t) => ({
    name: t.name,
    entityKind: t.entityKind === 'VIEW' ? 'VIEW' : 'TABLE',
    columns: (t.columns || []).map((c, ordinal) => ({
      name: c.name,
      dataType: c.dataType || 'string',
      keyKind: c.keyKind || simpleKeyKind(c.name, c.dataType),
      isNullable: c.nullable !== false,
      ordinal: c.ordinal ?? ordinal,
      referencesLabel: c.references || null,
      sampleValues: includeSamples
        ? (c.samples || []).slice(0, sampleLimit).map(String)
        : [],
    })),
  }))

  const foreignKeys = (raw.foreignKeys || []).map((fk) => ({
    fromTable: fk.fromTable,
    fromColumn: fk.fromColumn,
    toTable: fk.toTable,
    toColumn: fk.toColumn,
  }))

  return {
    schema: raw.schema || 'salesforce',
    tables,
    foreignKeys,
    meta: { mode: 'fixture', path },
  }
}

/**
 * Live Salesforce REST describe.
 * Requires: instanceUrl, token (access token).
 * Optional: objects[] allowlist, maxObjects (default 40), includeSamples.
 */
async function introspectLive(config) {
  let instanceUrl = String(config.instanceUrl || config.host || '').replace(
    /\/$/,
    '',
  )
  if (instanceUrl && !/^https?:\/\//i.test(instanceUrl)) {
    instanceUrl = `https://${instanceUrl}`
  }
  const token =
    config.token ||
    config.accessToken ||
    process.env.SALESFORCE_ACCESS_TOKEN ||
    process.env.STITCH_SALESFORCE_TOKEN
  const maxObjects = Math.min(Math.max(Number(config.maxObjects) || 40, 1), 120)
  const includeSamples = config.includeSamples === true
  const sampleLimit = Math.min(Number(config.sampleLimit ?? 3), 5)
  const allow =
    Array.isArray(config.objects) && config.objects.length
      ? new Set(config.objects.map(String))
      : null

  if (!instanceUrl) {
    throw Object.assign(
      new Error('Salesforce live mode needs instanceUrl'),
      { status: 400 },
    )
  }
  if (!token) {
    throw Object.assign(
      new Error(
        'Salesforce live mode needs access token (config.token or SALESFORCE_ACCESS_TOKEN)',
      ),
      { status: 400 },
    )
  }

  const global = await sfFetch(
    `${instanceUrl}/services/data/${SF_API}/sobjects`,
    token,
  )
  let sobjects = (global.sobjects || []).filter(
    (o) => o.queryable && !o.deprecatedAndHidden,
  )
  if (allow) {
    sobjects = sobjects.filter((o) => allow.has(o.name))
  } else {
    // Prefer common CRM objects first, then fill
    const preferred = [
      'Account',
      'Contact',
      'Opportunity',
      'Lead',
      'Case',
      'User',
      'Campaign',
      'Product2',
      'Order',
      'OrderItem',
    ]
    const prefSet = new Set(preferred)
    const first = preferred
      .map((n) => sobjects.find((o) => o.name === n))
      .filter(Boolean)
    const rest = sobjects.filter((o) => !prefSet.has(o.name))
    sobjects = [...first, ...rest].slice(0, maxObjects)
  }
  sobjects = sobjects.slice(0, maxObjects)

  const tables = []
  const foreignKeys = []

  for (const sobj of sobjects) {
    const desc = await sfFetch(
      `${instanceUrl}/services/data/${SF_API}/sobjects/${encodeURIComponent(sobj.name)}/describe`,
      token,
    )
    const fields = Array.isArray(desc.fields) ? desc.fields : []
    const columns = fields.map((f, ordinal) => {
      const refs = Array.isArray(f.referenceTo) ? f.referenceTo : []
      const referencesLabel =
        refs.length === 1 && f.name.endsWith('Id')
          ? `${refs[0]}.Id`
          : null
      if (referencesLabel) {
        foreignKeys.push({
          fromTable: sobj.name,
          fromColumn: f.name,
          toTable: refs[0],
          toColumn: 'Id',
        })
      }
      return {
        name: f.name,
        dataType: f.type || 'string',
        keyKind: simpleKeyKind(f.name, f.type),
        isNullable: f.nillable !== false,
        ordinal,
        referencesLabel,
        sampleValues: [],
      }
    })

    if (includeSamples && columns.length) {
      try {
        const pick = columns
          .filter((c) =>
            ['Id', 'Name', 'Email', 'AccountId', 'Amount', 'StageName'].includes(
              c.name,
            ),
          )
          .slice(0, 6)
        const cols = (pick.length ? pick : columns.slice(0, 4))
          .map((c) => c.name)
          .join(', ')
        const soql = `SELECT ${cols} FROM ${sobj.name} LIMIT ${sampleLimit}`
        const q = await sfFetch(
          `${instanceUrl}/services/data/${SF_API}/query?q=${encodeURIComponent(soql)}`,
          token,
        )
        const records = Array.isArray(q.records) ? q.records : []
        for (const c of columns) {
          const samples = []
          for (const rec of records) {
            if (rec[c.name] != null && rec[c.name] !== '') {
              samples.push(String(rec[c.name]).slice(0, 120))
            }
          }
          c.sampleValues = samples.slice(0, sampleLimit)
        }
      } catch {
        /* samples optional */
      }
    }

    tables.push({
      name: sobj.name,
      entityKind: 'TABLE',
      columns,
    })
  }

  // Drop FKs whose target object was not introspected
  const tableNames = new Set(tables.map((t) => t.name))
  const fks = foreignKeys.filter(
    (fk) => tableNames.has(fk.fromTable) && tableNames.has(fk.toTable),
  )

  return {
    schema: 'salesforce',
    tables,
    foreignKeys: fks,
    meta: {
      mode: 'live',
      instanceUrl,
      objectCount: tables.length,
      engine: 'salesforce',
    },
  }
}

async function sfFetch(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      (Array.isArray(json) && json[0]?.message) ||
      json?.message ||
      `Salesforce HTTP ${res.status}`
    const err = new Error(msg)
    err.status = res.status === 401 || res.status === 403 ? 401 : 502
    err.healthKind = res.status === 401 || res.status === 403 ? 'auth' : 'network'
    throw err
  }
  return json
}

/**
 * Apply per-object field allowlist from config.fieldMap.
 * fieldMap: { Account: ['Id','Name','Industry'], Contact: ['Id','Email'] }
 */
export function applySalesforceFieldMap(tables, fieldMap = {}) {
  if (!fieldMap || typeof fieldMap !== 'object') return tables
  return tables.map((t) => {
    const allow = fieldMap[t.name]
    if (!Array.isArray(allow) || !allow.length) return t
    const set = new Set(allow.map(String))
    return {
      ...t,
      columns: (t.columns || []).filter((c) => set.has(c.name)),
    }
  })
}

function resolveSalesforceFields(table, config) {
  const fieldMap = config.fieldMap || {}
  const allow = fieldMap[table.name]
  if (Array.isArray(allow) && allow.length) {
    return allow.map(String)
  }
  const preferred = [
    'Id',
    'Name',
    'Email',
    'AccountId',
    'Amount',
    'StageName',
    'SystemModstamp',
    'LastModifiedDate',
  ]
  const fromCols = (table.columns || []).map((c) => c.name)
  const pick = preferred.filter((p) => fromCols.includes(p))
  if (pick.length >= 3) return pick
  return fromCols.slice(0, 12)
}

/**
 * S5.1 — Incremental sample fetch via SystemModstamp (schema-only; capped rows).
 */
export async function runSalesforceIncrementalSamples(
  config,
  tables,
  syncState = {},
) {
  let instanceUrl = String(config.instanceUrl || config.host || '').replace(
    /\/$/,
    '',
  )
  if (instanceUrl && !/^https?:\/\//i.test(instanceUrl)) {
    instanceUrl = `https://${instanceUrl}`
  }
  const token =
    config.token ||
    config.accessToken ||
    process.env.SALESFORCE_ACCESS_TOKEN
  if (!instanceUrl || !token) {
    return { tables, syncState, recordsFetched: 0, skipped: 'not_live' }
  }

  const sampleLimit = Math.min(Number(config.sampleLimit ?? 5), 10)
  const newState = {
    ...syncState,
    objects: { ...(syncState.objects || {}) },
    updatedAt: new Date().toISOString(),
  }
  let recordsFetched = 0

  for (const table of tables) {
    const objectName = table.name
    const cursor = newState.objects[objectName]?.lastModstamp || null
    const fields = resolveSalesforceFields(table, config)
    if (!fields.includes('SystemModstamp') && table.columns?.some((c) => c.name === 'SystemModstamp')) {
      fields.push('SystemModstamp')
    }
    const fieldList = [...new Set(fields)].join(', ')
    let soql = cursor
      ? `SELECT ${fieldList} FROM ${objectName} WHERE SystemModstamp > ${cursor} ORDER BY SystemModstamp ASC LIMIT ${sampleLimit}`
      : `SELECT ${fieldList} FROM ${objectName} ORDER BY SystemModstamp DESC LIMIT ${sampleLimit}`

    try {
      const q = await sfFetch(
        `${instanceUrl}/services/data/${SF_API}/query?q=${encodeURIComponent(soql)}`,
        token,
      )
      const records = Array.isArray(q.records) ? q.records : []
      recordsFetched += records.length
      let maxMod = cursor
      for (const col of table.columns || []) {
        const samples = []
        for (const rec of records) {
          if (rec[col.name] != null && rec[col.name] !== '') {
            samples.push(String(rec[col.name]).slice(0, 120))
          }
          if (col.name === 'SystemModstamp' && rec.SystemModstamp) {
            maxMod = !maxMod || rec.SystemModstamp > maxMod ? rec.SystemModstamp : maxMod
          }
        }
        if (samples.length) col.sampleValues = samples.slice(0, sampleLimit)
      }
      if (maxMod) {
        newState.objects[objectName] = {
          lastModstamp: maxMod,
          lastSyncAt: new Date().toISOString(),
          recordsThisSync: records.length,
        }
      }
    } catch {
      /* object may not support SystemModstamp query — keep describe samples */
    }
  }

  return { tables, syncState: newState, recordsFetched }
}
