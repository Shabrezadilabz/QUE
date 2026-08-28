/**
 * Phase 2 — SSM-B lite: intent routing + focus table selection from event log.
 * Rule + graph heuristics (no trained SSM yet).
 */
import { findTablesMentioned } from '../schemaContext.js'

const CREATE_JOB_RE =
  /\b(create|build|make|draft|materialize|scaffold|combine|merge|stitch)\b/i
const JOB_TARGET_RE = /\b(job|transform|sql|notebook|pipeline)\b/i
const TABLE_TARGET_RE = /\b(table|mart|view|materialize|ctas)\b/i
const STUDIO_TARGET_RE = /\b(dashboard|report|board|bi|chart|visual)\b/i
const EDIT_JOB_RE = /\b(edit|update|change|modify|rename)\b.*\bjob\b/i
const METRIC_RE = /\b(metric|kpi|measure|okr)\b/i
const DUPLICATE_RE = /\b(duplicate|dup|quality|profile|profil|dedup)\b/i

/**
 * Compress recent events into a short state summary (no row payloads).
 * @param {object[]} events newest-first
 */
export function compressWorkspaceEvents(events = []) {
  if (!events.length) return ''
  const counts = new Map()
  for (const e of events.slice(0, 30)) {
    counts.set(e.eventType, (counts.get(e.eventType) || 0) + 1)
  }
  const parts = []
  for (const [type, n] of counts) {
    parts.push(`${type}×${n}`)
  }
  const latest = events[0]
  const tail =
    latest?.meta?.connectionName ||
    latest?.meta?.tableName ||
    latest?.meta?.jobId ||
    ''
  return `Recent: ${parts.join(', ')}${tail ? ` · last: ${latest.eventType} (${tail})` : ''}`
}

/**
 * Tables mentioned in recent sync / Monk / job events.
 * @param {object[]} events
 * @param {object|null} [mentions]
 */
export function rankFocusTablesFromEvents(events = [], mentions = null) {
  const scores = new Map()
  const bump = (name, weight) => {
    const k = String(name || '').trim()
    if (!k) return
    scores.set(k, (scores.get(k) || 0) + weight)
  }

  for (const m of mentions?.tables || []) {
    bump(m, 5)
  }
  for (const c of mentions?.columns || []) {
    bump(c.table, 4)
  }

  for (const e of events.slice(0, 25)) {
    const meta = e.meta || {}
    const ageMs = Date.now() - new Date(e.createdAt || 0).getTime()
    const driftBoost = e.eventType === 'schema_drift' && ageMs < 86400_000 ? 4 : 0
    const syncBoost = e.eventType === 'sync_completed' && ageMs < 3600_000 ? 2 : 0
    if (meta.tableName) bump(meta.tableName, 3 + driftBoost + syncBoost)
    if (Array.isArray(meta.tableNames)) {
      for (const t of meta.tableNames) bump(t, 2)
    }
    if (meta.sourceTable) bump(meta.sourceTable, 2)
    if (e.eventType === 'sync_completed') bump(meta.connectionName, 1)
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name)
}

/**
 * @param {object} pack
 * @param {string} message
 * @param {object[]} events
 * @param {string[]} [seedNames]
 */
export function rankFocusTables(pack, message, events = [], seedNames = []) {
  const fromMsg = findTablesMentioned(pack, message, []).map((t) => t.name)
  const fromEvents = rankFocusTablesFromEvents(events)
  const merged = [...new Set([...seedNames, ...fromMsg, ...fromEvents])]
  if (merged.length) return merged.slice(0, 16)
  return (pack.tables || []).slice(0, 8).map((t) => t.name)
}

/**
 * @param {string} message
 * @param {{ events?: object[], pageContext?: object, mentions?: object|null }} [opts]
 */
export function routeSsmIntent(message, opts = {}) {
  const t = String(message || '').trim()
  const g = t.toLowerCase()
  const events = opts.events || []

  let intent = 'question'
  if (EDIT_JOB_RE.test(g) || opts.pageContext?.jobId) {
    intent = 'edit_job'
  } else if (CREATE_JOB_RE.test(g)) {
    if (TABLE_TARGET_RE.test(g) && !JOB_TARGET_RE.test(g)) {
      intent = 'create_table'
    } else if (STUDIO_TARGET_RE.test(g)) {
      intent = 'studio_board'
    } else if (JOB_TARGET_RE.test(g)) {
      intent = 'create_job'
    } else if (TABLE_TARGET_RE.test(g)) {
      intent = 'create_table'
    } else {
      intent = 'create_job'
    }
  } else if (METRIC_RE.test(g)) {
    intent = 'metric'
  } else if (DUPLICATE_RE.test(g)) {
    intent = 'duplicate_fix'
  }

  const focusTableNames = rankFocusTablesFromEvents(events, opts.mentions)

  return {
    intent,
    focusTableNames,
    workspaceStateSummary: compressWorkspaceEvents(events),
    joinPathRank: intent === 'question' ? 'graph_bfs' : 'recent_events',
    confidence: scoreIntentConfidence(intent, g, events),
    stateVector: buildSsmStateVector(events),
  }
}

/** P3.6 — structured state features for SSM-B ML path (no row payloads). */
export function buildSsmStateVector(events = []) {
  const types = [
    'connector_added',
    'sync_completed',
    'monk_started',
    'join_inferred',
    'join_promoted',
    'job_created',
    'job_run_completed',
    'dataset_certified',
    'chat_query',
    'board_published',
    'schema_drift',
  ]
  const counts = Object.fromEntries(types.map((t) => [t, 0]))
  const now = Date.now()
  let recencyScore = 0
  for (const e of events.slice(0, 40)) {
    counts[e.eventType] = (counts[e.eventType] || 0) + 1
    const ageMs = now - new Date(e.createdAt || 0).getTime()
    if (ageMs < 3600_000) recencyScore += 1
    if (e.eventType === 'schema_drift' && ageMs < 86400_000) recencyScore += 2
  }
  return {
    eventCounts: counts,
    totalEvents: events.length,
    recencyScore,
    driftBoost: (counts.schema_drift || 0) + (counts.sync_completed || 0) * 0.5,
    hasRecentCert: (counts.dataset_certified || 0) > 0,
    hasRecentBoard: (counts.board_published || 0) > 0,
  }
}

function scoreIntentConfidence(intent, message, events) {
  let score = 0.55
  if (intent === 'question') score = 0.7
  if (CREATE_JOB_RE.test(message) && JOB_TARGET_RE.test(message)) score = 0.85
  if (STUDIO_TARGET_RE.test(message)) score = 0.82
  if (METRIC_RE.test(message)) score = 0.8
  if (events.length > 5) score += 0.05
  return Math.min(0.98, score)
}
