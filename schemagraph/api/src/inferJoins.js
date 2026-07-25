/**
 * Explainable cross-source join suggestions.
 * Multi-signal confidence + evidence_json — never auto-promotes.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

const ALIASES = [
  ['email', 'user_email'],
  ['email', 'email_address'],
  ['email', 'owner_email'],
  ['email', 'manager_email'],
  ['user_id', 'userid'],
  ['customer_id', 'cust_id'],
  ['org_id', 'organization_id'],
]

const ID_PREFIX_TABLES = {
  user: ['user', 'users', 'users_main'],
  org: ['org', 'orgs', 'organization', 'organizations'],
  customer: ['customer', 'customers'],
}

function norm(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}

function leafName(name) {
  const n = norm(name)
  const parts = n.split('.').filter(Boolean)
  const last = parts[parts.length - 1] || n
  return last.replace(/\[\]$/, '')
}

function typeCompatible(a, b) {
  const x = String(a || '').toLowerCase()
  const y = String(b || '').toLowerCase()
  if (x === y) return { ok: true, exact: true }
  if (x === 'objectid' || y === 'objectid') {
    return { ok: x === y, exact: x === y }
  }
  const groups = [
    ['uuid', 'text', 'varchar', 'character varying'],
    [
      'integer',
      'int',
      'bigint',
      'smallint',
      'numeric',
      'decimal',
      'real',
      'double precision',
    ],
    [
      'timestamp',
      'timestamptz',
      'date',
      'timestamp without time zone',
      'timestamp with time zone',
    ],
    ['boolean', 'bool'],
    ['text', 'varchar', 'character varying', 'str', 'string'],
  ]
  const ok = groups.some((g) => g.includes(x) && g.includes(y))
  return { ok, exact: false }
}

function looksLikeJoinKey(name, keyKind) {
  const leaf = leafName(name)
  if (leaf === '_id') return false
  if (keyKind === 'pk' || keyKind === 'fk' || keyKind === 'unique') return true
  if (leaf === 'id' || leaf.endsWith('_id')) return true
  if (leaf.includes('email')) return true
  return false
}

function tableFitsPrefix(tableName, prefix) {
  const t = norm(tableName)
  const allowed = ID_PREFIX_TABLES[prefix]
  if (!allowed) return t === prefix || t === `${prefix}s` || t.startsWith(prefix)
  return allowed.some((a) => t === a || t.startsWith(a))
}

function sampleOverlap(aSamples, bSamples) {
  const a = new Set(
    (Array.isArray(aSamples) ? aSamples : [])
      .map((v) => String(v).trim().toLowerCase())
      .filter((v) => v.length > 0),
  )
  const b = new Set(
    (Array.isArray(bSamples) ? bSamples : [])
      .map((v) => String(v).trim().toLowerCase())
      .filter((v) => v.length > 0),
  )
  if (a.size === 0 || b.size === 0) return null
  let inter = 0
  for (const v of a) if (b.has(v)) inter += 1
  const union = a.size + b.size - inter
  const ratio = union === 0 ? 0 : inter / union
  return { inter, union, ratio, aSize: a.size, bSize: b.size }
}

/**
 * Score a candidate pair into confidence + evidence signals.
 */
export function scoreJoinCandidate({
  fromCol,
  fromTable,
  fromType,
  fromKey,
  fromSamples,
  toCol,
  toTable,
  toType,
  toKey,
  toSamples,
  priorApproved = false,
}) {
  const signals = []
  let score = 0
  const na = leafName(fromCol)
  const nb = leafName(toCol)

  // Name signals
  if (na === nb && na !== 'id' && na !== '_id') {
    signals.push({
      code: 'exact_name',
      label: `Exact column name “${na}”`,
      weight: 0.38,
    })
    score += 0.38
  } else {
    let aliasHit = null
    for (const [x, y] of ALIASES) {
      if ((na === x && nb === y) || (na === y && nb === x)) {
        aliasHit = `${x} ≈ ${y}`
        break
      }
    }
    if (aliasHit) {
      signals.push({
        code: 'alias_name',
        label: `Alias match (${aliasHit})`,
        weight: 0.3,
      })
      score += 0.3
    } else {
      const pairs = [
        [na, nb, toTable],
        [nb, na, fromTable],
      ]
      for (const [fk, pk, pkTable] of pairs) {
        if (pk !== 'id' || !fk.endsWith('_id')) continue
        const prefix = fk.slice(0, -3)
        if (!tableFitsPrefix(pkTable, prefix)) continue
        signals.push({
          code: 'fk_prefix',
          label: `${fk} fits table ${pkTable}.${pk}`,
          weight: 0.28,
        })
        score += 0.28
        break
      }
    }
  }

  if (signals.length === 0) return null

  // Type
  const types = typeCompatible(fromType, toType)
  if (!types.ok) return null
  signals.push({
    code: types.exact ? 'type_exact' : 'type_compatible',
    label: types.exact
      ? `Same type (${fromType || 'unknown'})`
      : `Compatible types (${fromType || '?'} ≈ ${toType || '?'})`,
    weight: types.exact ? 0.18 : 0.12,
  })
  score += types.exact ? 0.18 : 0.12

  // Key kinds
  const fkish =
    fromKey === 'fk' ||
    toKey === 'fk' ||
    leafName(fromCol).endsWith('_id') ||
    leafName(toCol).endsWith('_id')
  const pkish = fromKey === 'pk' || toKey === 'pk' || fromKey === 'unique' || toKey === 'unique'
  if (fkish && pkish) {
    signals.push({
      code: 'fk_pk',
      label: 'FK-ish → PK/unique pattern',
      weight: 0.18,
    })
    score += 0.18
  } else if (fkish || pkish) {
    signals.push({
      code: 'key_hint',
      label: 'Join-key naming or key_kind hint',
      weight: 0.08,
    })
    score += 0.08
  }

  // Sample overlap (capped metadata only)
  const ov = sampleOverlap(fromSamples, toSamples)
  if (ov && ov.inter > 0) {
    const w = Math.min(0.22, 0.08 + ov.ratio * 0.14)
    signals.push({
      code: 'sample_overlap',
      label: `Sample overlap ${Math.round(ov.ratio * 100)}% (${ov.inter} shared of ${ov.aSize}/${ov.bSize})`,
      weight: Number(w.toFixed(3)),
    })
    score += w
  } else if (ov) {
    signals.push({
      code: 'sample_no_overlap',
      label: 'Samples present but no overlap (review carefully)',
      weight: -0.05,
    })
    score -= 0.05
  }

  // Org memory: prior approved similar join
  if (priorApproved) {
    signals.push({
      code: 'prior_approved',
      label: 'Similar join was previously promoted in this workspace',
      weight: 0.12,
    })
    score += 0.12
  }

  const confidence = Math.max(0.35, Math.min(0.97, Number(score.toFixed(3))))
  const summary = signals
    .filter((s) => s.weight > 0)
    .map((s) => s.label)
    .join(' · ')

  return {
    confidence,
    evidence: { signals, summary, scoredAt: new Date().toISOString() },
    reason: summary,
  }
}

async function loadPriorApprovedPairs(workspaceId) {
  const { rows } = await query(
    `SELECT lower(fc.name) AS from_col, lower(tc.name) AS to_col,
            lower(fo.name) AS from_table, lower(too.name) AS to_table
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects too ON too.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1 AND r.status = 'accepted'`,
    [workspaceId],
  )
  const keys = new Set()
  for (const r of rows) {
    keys.add(`${r.from_col}|${r.to_col}`)
    keys.add(`${r.to_col}|${r.from_col}`)
    keys.add(`${r.from_table}.${r.from_col}|${r.to_table}.${r.to_col}`)
  }
  return keys
}

/**
 * Suggest joins from `connectionId` columns to columns in other connections.
 * @returns {Promise<number>} number of new suggested edges
 */
export async function inferCrossSourceJoins(workspaceId, connectionId) {
  const { rows: cols } = await query(
    `SELECT c.id AS column_id, c.name AS column_name, c.data_type, c.key_kind,
            c.sample_values,
            o.id AS object_id, o.name AS object_name, o.connection_id
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     WHERE c.workspace_id = $1`,
    [workspaceId],
  )

  const mine = cols.filter((c) => c.connection_id === connectionId)
  const others = cols.filter((c) => c.connection_id !== connectionId)
  if (mine.length === 0 || others.length === 0) return 0

  const prior = await loadPriorApprovedPairs(workspaceId)

  const { rows: existing } = await query(
    `SELECT from_column_id, to_column_id FROM relationships
     WHERE workspace_id = $1`,
    [workspaceId],
  )
  const existingPairs = new Set(
    existing.map((r) => `${r.from_column_id}|${r.to_column_id}`),
  )

  let created = 0
  for (const from of mine) {
    if (!looksLikeJoinKey(from.column_name, from.key_kind)) continue
    for (const to of others) {
      if (!looksLikeJoinKey(to.column_name, to.key_kind)) continue

      const priorApproved =
        prior.has(
          `${leafName(from.column_name)}|${leafName(to.column_name)}`,
        ) ||
        prior.has(
          `${norm(from.object_name)}.${leafName(from.column_name)}|${norm(to.object_name)}.${leafName(to.column_name)}`,
        )

      const hit = scoreJoinCandidate({
        fromCol: from.column_name,
        fromTable: from.object_name,
        fromType: from.data_type,
        fromKey: from.key_kind,
        fromSamples: from.sample_values,
        toCol: to.column_name,
        toTable: to.object_name,
        toType: to.data_type,
        toKey: to.key_kind,
        toSamples: to.sample_values,
        priorApproved,
      })
      if (!hit) continue

      let a = from
      let b = to
      if (from.key_kind === 'pk' && to.key_kind !== 'pk') {
        a = to
        b = from
      }

      const pair = `${a.column_id}|${b.column_id}`
      const reverse = `${b.column_id}|${a.column_id}`
      if (existingPairs.has(pair) || existingPairs.has(reverse)) continue

      const label = `${a.object_name}.${a.column_name} → ${b.object_name}.${b.column_name}`
      const joinCriteria = `${label} (${hit.reason})`
      const aiNotes = `Why ${Math.round(hit.confidence * 100)}%: ${hit.reason}. Review before promoting.`

      await query(
        `INSERT INTO relationships (
           id, workspace_id, from_object_id, from_column_id,
           to_object_id, to_column_id, relation_type, status, confidence,
           join_criteria, label, ai_notes, evidence_json
         ) VALUES ($1,$2,$3,$4,$5,$6,'ai-inferred','suggested',$7,$8,$9,$10,$11::jsonb)`,
        [
          randomUUID(),
          workspaceId,
          a.object_id,
          a.column_id,
          b.object_id,
          b.column_id,
          hit.confidence,
          joinCriteria,
          label,
          aiNotes,
          JSON.stringify(hit.evidence),
        ],
      )
      existingPairs.add(pair)
      created += 1
    }
  }
  return created
}
