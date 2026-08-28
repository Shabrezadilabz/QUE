/**
 * Shared fixture introspection for India commerce connectors (S9).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_ROOT = resolve(__dirname, '../..')

export function resolveFixturePath(p, defaultRelative) {
  if (!p) return resolve(API_ROOT, defaultRelative)
  if (p.match(/^[a-zA-Z]:[\\/]/) || p.startsWith('/')) return p
  return resolve(API_ROOT, p)
}

function simpleKeyKind(name, type) {
  const n = String(name || '')
  const t = String(type || '').toLowerCase()
  if (n === 'id' || n.endsWith('_id') || t === 'id') return n === 'id' || n.endsWith('_id') ? 'pk' : 'fk'
  if (t === 'email' || n.toLowerCase().includes('email')) return 'unique'
  return 'none'
}

/**
 * @param {object} config
 * @param {string} defaultFixtureRelative e.g. fixtures/shopify_demo.json
 * @param {string} defaultSchema
 */
export function introspectFromJsonFixture(config = {}, defaultFixtureRelative, defaultSchema) {
  const path = resolveFixturePath(config.fixturesPath, defaultFixtureRelative)
  if (!existsSync(path)) {
    return {
      schema: defaultSchema,
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
    schema: raw.schema || defaultSchema,
    tables,
    foreignKeys,
    meta: { mode: 'fixture', path },
  }
}
