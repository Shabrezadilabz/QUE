/**
 * Explainable cross-source join suggestions (P0.1 engine).
 * Multi-signal confidence + evidence_json — never auto-promotes.
 *
 * Signals: exact/alias/fuzzy name, FK prefix, references_label,
 * type compat, key hints, sample overlap/uniqueness, prior approve/reject.
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

export function norm(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}

export function leafName(name) {
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
  // Soft bridge: ObjectId / UUID / text identifiers often join across systems
  const idish = new Set(['objectid', 'uuid', 'text', 'varchar', 'character varying', 'string', 'str'])
  if (idish.has(x) && idish.has(y)) {
    return { ok: true, exact: false }
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
  const aDistinct = a.size
  const bDistinct = b.size
  const aArr = Array.isArray(aSamples) ? aSamples.filter((v) => String(v).trim()) : []
  const bArr = Array.isArray(bSamples) ? bSamples.filter((v) => String(v).trim()) : []
  const aUnique = aArr.length > 0 && aDistinct === aArr.length
  const bUnique = bArr.length > 0 && bDistinct === bArr.length
  return {
    inter,
    union,
    ratio,
    aSize: a.size,
    bSize: b.size,
    aUnique,
    bUnique,
  }
}

/** Min Jaccard overlap (0–1) required to suggest an AI join. Default 0.5. */
export function sampleMatchMinRatio() {
  const n = Number(process.env.QUE_JOIN_SAMPLE_MIN_RATIO)
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n
  return 0.5
}

/**
 * Whether AI-inferred evidence proves sample match (for canvas filter of legacy rows).
 */
export function evidenceHasSampleMatch(evidence) {
  if (!evidence || typeof evidence !== 'object') return false
  const signals = Array.isArray(evidence.signals) ? evidence.signals : []
  if (signals.some((s) => s && s.code === 'sample_no_overlap')) return false
  if (
    signals.some(
      (s) =>
        s &&
        (s.code === 'sample_overlap' ||
          s.code === 'sample_unique_overlap' ||
          s.code === 'pinned_overlap'),
    )
  ) {
    const pinned = evidence.pinnedOverlap
    if (pinned && (pinned.band === 'none' || pinned.band === 'low')) return false
    return true
  }
  return false
}

/** Levenshtein distance for short column names */
function levenshtein(a, b) {
  const s = String(a)
  const t = String(b)
  if (s === t) return 0
  if (!s.length) return t.length
  if (!t.length) return s.length
  const row = Array.from({ length: t.length + 1 }, (_, i) => i)
  for (let i = 0; i < s.length; i += 1) {
    let prev = i + 1
    for (let j = 0; j < t.length; j += 1) {
      const cur =
        s[i] === t[j] ? row[j] : 1 + Math.min(row[j], row[j + 1], prev)
      row[j] = prev
      prev = cur
    }
    row[t.length] = prev
  }
  return row[t.length]
}

/**
 * Fuzzy name similarity in [0,1] via token overlap + normalized edit distance.
 */
export function fuzzyNameSimilarity(a, b) {
  const na = leafName(a)
  const nb = leafName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const tokensA = new Set(na.split('_').filter((t) => t.length > 1))
  const tokensB = new Set(nb.split('_').filter((t) => t.length > 1))
  let tokenInter = 0
  for (const t of tokensA) if (tokensB.has(t)) tokenInter += 1
  const tokenUnion = tokensA.size + tokensB.size - tokenInter
  const tokenRatio = tokenUnion === 0 ? 0 : tokenInter / tokenUnion

  const maxLen = Math.max(na.length, nb.length)
  const editRatio = maxLen === 0 ? 0 : 1 - levenshtein(na, nb) / maxLen

  return Math.max(tokenRatio * 0.55 + editRatio * 0.45, tokenRatio, editRatio * 0.9)
}

function refLabelMentions(refLabel, tableName, colName) {
  const ref = norm(refLabel)
  if (!ref) return false
  const t = norm(tableName)
  const c = leafName(colName)
  if (ref.includes(t) && (ref.includes(c) || c === 'id')) return true
  if (ref.includes(`${t}_${c}`) || ref.includes(`${t}.${c}`)) return true
  return false
}

/**
 * Score a candidate pair into confidence + evidence signals.
 * @returns {null | { confidence, evidence, reason, directionPreferred }}
 */
export function scoreJoinCandidate({
  fromCol,
  fromTable,
  fromType,
  fromKey,
  fromSamples,
  fromRefLabel,
  toCol,
  toTable,
  toType,
  toKey,
  toSamples,
  toRefLabel,
  priorApproved = false,
  priorRejected = false,
}) {
  const signals = []
  let score = 0
  const na = leafName(fromCol)
  const nb = leafName(toCol)
  let nameGatePassed = false

  // Name signals
  if (na === nb && na !== 'id' && na !== '_id') {
    signals.push({
      code: 'exact_name',
      label: `Exact column name “${na}”`,
      weight: 0.38,
    })
    score += 0.38
    nameGatePassed = true
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
      nameGatePassed = true
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
        nameGatePassed = true
        break
      }
    }
  }

  // Fuzzy name (secondary gate or boost)
  if (!nameGatePassed) {
    const sim = fuzzyNameSimilarity(na, nb)
    if (sim >= 0.72 && na !== 'id' && nb !== 'id') {
      const w = Math.min(0.26, 0.14 + sim * 0.12)
      signals.push({
        code: 'fuzzy_name',
        label: `Fuzzy name match ${Math.round(sim * 100)}% (“${na}” ≈ “${nb}”)`,
        weight: Number(w.toFixed(3)),
      })
      score += w
      nameGatePassed = true
    }
  } else {
    const sim = fuzzyNameSimilarity(na, nb)
    if (sim < 1 && sim >= 0.85) {
      signals.push({
        code: 'fuzzy_name_boost',
        label: `Strong name similarity ${Math.round(sim * 100)}%`,
        weight: 0.04,
      })
      score += 0.04
    }
  }

  // Declared references_label from introspection
  if (
    refLabelMentions(fromRefLabel, toTable, toCol) ||
    refLabelMentions(toRefLabel, fromTable, fromCol)
  ) {
    signals.push({
      code: 'references_label',
      label: 'Column references_label points at peer table/column',
      weight: 0.25,
    })
    score += 0.25
    nameGatePassed = true
  }

  if (!nameGatePassed) return null

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

  // Key kinds + preferred direction (FK-ish → PK-ish)
  const fromFkish =
    fromKey === 'fk' || leafName(fromCol).endsWith('_id')
  const toFkish = toKey === 'fk' || leafName(toCol).endsWith('_id')
  const fromPkish = fromKey === 'pk' || fromKey === 'unique'
  const toPkish = toKey === 'pk' || toKey === 'unique'
  const fkish = fromFkish || toFkish
  const pkish = fromPkish || toPkish
  let directionPreferred = 'keep' // keep | swap (from should be FK side)
  if (toFkish && fromPkish && !fromFkish) directionPreferred = 'swap'
  if (fromFkish && toPkish) directionPreferred = 'keep'

  if (fkish && pkish) {
    signals.push({
      code: 'fk_pk',
      label: 'FK-ish → PK/unique pattern',
      weight: 0.18,
    })
    score += 0.18
    if (directionPreferred !== 'keep' || (fromFkish && toPkish)) {
      signals.push({
        code: 'direction_hint',
        label:
          directionPreferred === 'swap'
            ? `Prefer ${toTable}.${toCol} → ${fromTable}.${fromCol}`
            : `Prefer ${fromTable}.${fromCol} → ${toTable}.${toCol}`,
        weight: 0.03,
      })
      score += 0.03
    }
  } else if (fkish || pkish) {
    signals.push({
      code: 'key_hint',
      label: 'Join-key naming or key_kind hint',
      weight: 0.08,
    })
    score += 0.08
  }

  // Sample overlap — HARD GATE for AI suggestions (schema-first, capped samples only).
  // Require both sides to have samples and a strong Jaccard match before suggesting.
  const ov = sampleOverlap(fromSamples, toSamples)
  const minRatio = sampleMatchMinRatio()
  if (!ov) {
    // Missing samples on either side → do not invent a join
    return null
  }
  if (ov.inter <= 0 || ov.ratio < minRatio) {
    // Samples present but do not match well enough
    return null
  }

  const w = Math.min(0.22, 0.08 + ov.ratio * 0.14)
  signals.push({
    code: 'sample_overlap',
    label: `Sample overlap ${Math.round(ov.ratio * 100)}% (${ov.inter} shared of ${ov.aSize}/${ov.bSize}) · gate ≥${Math.round(minRatio * 100)}%`,
    weight: Number(w.toFixed(3)),
  })
  score += w
  if (ov.ratio >= 0.5 && (ov.aUnique || ov.bUnique)) {
    signals.push({
      code: 'sample_unique_overlap',
      label: 'High overlap with distinct samples (1:1-ish proxy)',
      weight: 0.1,
    })
    score += 0.1
  }
  // Cardinality hint from capped samples (not warehouse counts)
  if (ov.aUnique && !ov.bUnique && ov.inter > 0) {
    signals.push({
      code: 'cardinality_hint',
      label: `Likely 1:N (${fromTable}.${fromCol} unique-ish → ${toTable}.${toCol})`,
      weight: 0.04,
    })
    score += 0.04
  } else if (!ov.aUnique && ov.bUnique && ov.inter > 0) {
    signals.push({
      code: 'cardinality_hint',
      label: `Likely N:1 (${fromTable}.${fromCol} → unique-ish ${toTable}.${toCol})`,
      weight: 0.04,
    })
    score += 0.04
  } else if (ov.aUnique && ov.bUnique && ov.ratio >= 0.5) {
    signals.push({
      code: 'cardinality_hint',
      label: 'Likely 1:1 (both sides distinct in capped samples)',
      weight: 0.05,
    })
    score += 0.05
  }

  // Composite-key hint: shared multi-token stems (e.g. org_id+user_id pairs deferred;
  // surface when both columns look like compound join keys)
  if (
    (na.includes('_') && nb.includes('_') && fkish && pkish) ||
    (na.endsWith('_id') && nb.endsWith('_id') && na !== nb)
  ) {
    const stemA = na.replace(/_id$/, '')
    const stemB = nb.replace(/_id$/, '')
    if (stemA && stemB && stemA !== stemB && (fkish || pkish)) {
      signals.push({
        code: 'composite_hint',
        label:
          'Possible multi-key relationship — promote single keys carefully; composite keys need human review',
        weight: 0.02,
      })
      score += 0.02
    }
  }

  // Org memory: prior approved / rejected
  if (priorApproved) {
    signals.push({
      code: 'prior_approved',
      label: 'Similar join was previously promoted in this workspace',
      weight: 0.12,
    })
    score += 0.12
  }
  if (priorRejected) {
    signals.push({
      code: 'prior_rejected',
      label: 'Similar join was previously rejected in this workspace',
      weight: -0.15,
    })
    score -= 0.15
  }

  if (score < 0.28) return null

  const confidence = Math.max(0.35, Math.min(0.97, Number(score.toFixed(3))))
  const summary = signals
    .filter((s) => s.weight > 0)
    .map((s) => s.label)
    .join(' · ')

  return {
    confidence,
    evidence: { signals, summary, scoredAt: new Date().toISOString() },
    reason: summary,
    directionPreferred,
  }
}

/**
 * Load workspace join memory (approved + rejected column-pair keys).
 */
export async function loadWorkspaceJoinMemory(workspaceId) {
  const { rows } = await query(
    `SELECT r.status,
            lower(fc.name) AS from_col, lower(tc.name) AS to_col,
            lower(fo.name) AS from_table, lower(too.name) AS to_table
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects too ON too.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1 AND r.status IN ('accepted', 'rejected')`,
    [workspaceId],
  )
  const approved = new Set()
  const rejected = new Set()
  for (const r of rows) {
    const leaf = `${leafName(r.from_col)}|${leafName(r.to_col)}`
    const leafRev = `${leafName(r.to_col)}|${leafName(r.from_col)}`
    const full = `${norm(r.from_table)}.${leafName(r.from_col)}|${norm(r.to_table)}.${leafName(r.to_col)}`
    const target = r.status === 'accepted' ? approved : rejected
    target.add(leaf)
    target.add(leafRev)
    target.add(full)
  }
  return { approved, rejected }
}

/** @deprecated use loadWorkspaceJoinMemory */
async function loadPriorApprovedPairs(workspaceId) {
  const mem = await loadWorkspaceJoinMemory(workspaceId)
  return mem.approved
}

function memoryHit(set, fromCol, fromTable, toCol, toTable) {
  return (
    set.has(`${leafName(fromCol)}|${leafName(toCol)}`) ||
    set.has(
      `${norm(fromTable)}.${leafName(fromCol)}|${norm(toTable)}.${leafName(toCol)}`,
    )
  )
}

/**
 * Suggest joins from `connectionId` columns to columns in other connections.
 * Budgeted for wide schemas (diligence T4).
 * @returns {Promise<{ created: number, scanned: number, durationMs: number, truncated?: boolean, budget?: object }>}
 */
export async function inferCrossSourceJoins(workspaceId, connectionId, options = {}) {
  const started = Date.now()
  const maxCandidates = Math.min(
    Math.max(
      Number(
        options.maxCandidates ??
          process.env.QUE_JOIN_MAX_CANDIDATES ??
          25000,
      ),
      100,
    ),
    200000,
  )
  const maxSuggestions = Math.min(
    Math.max(
      Number(
        options.maxSuggestions ??
          process.env.QUE_JOIN_MAX_SUGGESTIONS ??
          200,
      ),
      10,
    ),
    2000,
  )
  const maxMs = Math.min(
    Math.max(
      Number(options.maxMs ?? process.env.QUE_JOIN_MAX_MS ?? 15000),
      500,
    ),
    120000,
  )

  const { rows: cols } = await query(
    `SELECT c.id AS column_id, c.name AS column_name, c.data_type, c.key_kind,
            c.sample_values, c.references_label,
            o.id AS object_id, o.name AS object_name, o.connection_id
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     WHERE c.workspace_id = $1`,
    [workspaceId],
  )

  const mine = cols.filter((c) => c.connection_id === connectionId)
  const others = cols.filter((c) => c.connection_id !== connectionId)
  if (mine.length === 0 || others.length === 0) {
    return {
      created: 0,
      scanned: 0,
      durationMs: Date.now() - started,
      budget: { maxCandidates, maxSuggestions, maxMs },
    }
  }

  const memory = await loadWorkspaceJoinMemory(workspaceId)

  // Prefer pinned samples for overlap (stable across syncs)
  let pinnedByTableCol = new Map()
  try {
    const { loadPinnedColumnValueMap } = await import('./pinnedSamples.js')
    pinnedByTableCol = await loadPinnedColumnValueMap(workspaceId)
  } catch {
    /* pinned table may be missing before migrate */
  }

  const { rows: existing } = await query(
    `SELECT from_column_id, to_column_id FROM relationships
     WHERE workspace_id = $1`,
    [workspaceId],
  )
  const existingPairs = new Set(
    existing.map((r) => `${r.from_column_id}|${r.to_column_id}`),
  )

  let created = 0
  let scanned = 0
  let truncated = false
  outer: for (const from of mine) {
    if (!looksLikeJoinKey(from.column_name, from.key_kind)) continue
    for (const to of others) {
      if (!looksLikeJoinKey(to.column_name, to.key_kind)) continue
      if (scanned >= maxCandidates || Date.now() - started > maxMs) {
        truncated = true
        break outer
      }
      if (created >= maxSuggestions) {
        truncated = true
        break outer
      }
      scanned += 1

      const priorApproved = memoryHit(
        memory.approved,
        from.column_name,
        from.object_name,
        to.column_name,
        to.object_name,
      )
      const priorRejected = memoryHit(
        memory.rejected,
        from.column_name,
        from.object_name,
        to.column_name,
        to.object_name,
      )

      const fromPinned =
        pinnedByTableCol.get(`${from.object_name}\0${from.column_name}`) || null
      const toPinned =
        pinnedByTableCol.get(`${to.object_name}\0${to.column_name}`) || null

      const hit = scoreJoinCandidate({
        fromCol: from.column_name,
        fromTable: from.object_name,
        fromType: from.data_type,
        fromKey: from.key_kind,
        fromSamples: fromPinned?.length ? fromPinned : from.sample_values,
        fromRefLabel: from.references_label,
        toCol: to.column_name,
        toTable: to.object_name,
        toType: to.data_type,
        toKey: to.key_kind,
        toSamples: toPinned?.length ? toPinned : to.sample_values,
        toRefLabel: to.references_label,
        priorApproved,
        priorRejected,
      })
      if (!hit) continue
      if (fromPinned?.length && toPinned?.length) {
        hit.evidence = hit.evidence || { signals: [] }
        hit.evidence.signals = [
          ...(hit.evidence.signals || []),
          {
            code: 'pinned_samples',
            label: 'Overlap scored on pinned scrubbed samples (fixed until re-pin)',
            weight: 0.02,
          },
        ]
        hit.evidence.pinnedSamples = true
      }

      let a = from
      let b = to
      // Prefer FK-ish → PK-ish direction
      if (hit.directionPreferred === 'swap') {
        a = to
        b = from
      } else if (from.key_kind === 'pk' && to.key_kind !== 'pk') {
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
  return {
    created,
    scanned,
    durationMs: Date.now() - started,
    truncated,
    budget: { maxCandidates, maxSuggestions, maxMs },
  }
}

/**
 * Re-run join inference for one connection or all connections in a workspace.
 */
export async function inferJoinsForWorkspace(workspaceId, options = {}) {
  const started = Date.now()
  const { connectionId = null } = options

  let connectionIds = []
  if (connectionId) {
    connectionIds = [connectionId]
  } else {
    const { rows } = await query(
      `SELECT id FROM connections WHERE workspace_id = $1 ORDER BY created_at ASC`,
      [workspaceId],
    )
    connectionIds = rows.map((r) => r.id)
  }

  let created = 0
  let scanned = 0
  for (const cid of connectionIds) {
    const result = await inferCrossSourceJoins(workspaceId, cid)
    // Back-compat: older callers expected a number
    if (typeof result === 'number') {
      created += result
    } else {
      created += result.created || 0
      scanned += result.scanned || 0
    }
  }

  return {
    ok: true,
    created,
    scanned,
    connections: connectionIds.length,
    durationMs: Date.now() - started,
  }
}

/**
 * Pick best scored ON clause between two table shapes (for chat SQL draft).
 * Tables: { name, columns: [{ name, dataType, keyKind, samples?, references? }] }
 */
export function bestJoinOnClause(tableA, tableB) {
  let best = null
  for (const ac of tableA.columns || []) {
    if (!looksLikeJoinKey(ac.name, ac.keyKind)) continue
    for (const bc of tableB.columns || []) {
      if (!looksLikeJoinKey(bc.name, bc.keyKind)) continue
      const hit = scoreJoinCandidate({
        fromCol: ac.name,
        fromTable: tableA.name,
        fromType: ac.dataType,
        fromKey: ac.keyKind,
        fromSamples: ac.samples,
        fromRefLabel: ac.references,
        toCol: bc.name,
        toTable: tableB.name,
        toType: bc.dataType,
        toKey: bc.keyKind,
        toSamples: bc.samples,
        toRefLabel: bc.references,
      })
      if (!hit) continue
      if (!best || hit.confidence > best.confidence) {
        best = {
          confidence: hit.confidence,
          on: `a.${ac.name} = b.${bc.name}`,
          evidence: hit.evidence,
        }
      }
    }
  }
  return best
}

// Keep sync callers that expect a number working via thin wrapper used carefully
export { loadPriorApprovedPairs }
