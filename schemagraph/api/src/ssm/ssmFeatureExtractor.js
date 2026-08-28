/**
 * SSM-B — feature extraction for trained routing (no row payloads).
 */
import { buildSsmStateVector } from './ssmRouter.js'

const STUDIO_RE = /\b(dashboard|report|board|bi|chart|visual|kpi)\b/i
const JOB_RE =
  /\b(create|build|make|draft|materialize|scaffold|combine|merge|stitch)\b/i
const JOB_TARGET_RE = /\b(job|transform|sql|notebook|pipeline)\b/i
const TABLE_TARGET_RE = /\b(table|mart|view|materialize|ctas)\b/i
const METRIC_RE = /\b(metric|kpi|measure|okr)\b/i
const DUPLICATE_RE = /\b(duplicate|dup|quality|profile|profil|dedup|drift|fix|repair)\b/i
const EDIT_JOB_RE = /\b(edit|update|change|modify|rename)\b.*\bjob\b/i
const QUESTION_RE = /\b(what|how|why|show|list|explain|which|where)\b/i

export const SSM_INTENTS = [
  'question',
  'create_job',
  'create_table',
  'studio_board',
  'edit_job',
  'metric',
  'duplicate_fix',
]

/**
 * @param {string} message
 * @param {object[]} [events]
 */
export function extractSsmFeatures(message, events = []) {
  const g = String(message || '').toLowerCase()
  const vec = buildSsmStateVector(events)
  const c = vec.eventCounts || {}
  const total = Math.max(1, vec.totalEvents || 0)

  return [
    1,
    STUDIO_RE.test(g) ? 1 : 0,
    JOB_RE.test(g) ? 1 : 0,
    JOB_TARGET_RE.test(g) ? 1 : 0,
    TABLE_TARGET_RE.test(g) ? 1 : 0,
    METRIC_RE.test(g) ? 1 : 0,
    DUPLICATE_RE.test(g) ? 1 : 0,
    EDIT_JOB_RE.test(g) ? 1 : 0,
    QUESTION_RE.test(g) ? 1 : 0,
    (c.job_created || 0) / total,
    (c.board_published || 0) / total,
    (c.dataset_certified || 0) / total,
    (c.schema_drift || 0) / total,
    (c.sync_completed || 0) / total,
    Math.min(1, (vec.recencyScore || 0) / 10),
    vec.hasRecentCert ? 1 : 0,
    vec.hasRecentBoard ? 1 : 0,
    Math.min(1, (vec.driftBoost || 0) / 5),
    Math.min(1, total / 40),
  ]
}

export const SSM_FEATURE_NAMES = [
  'bias',
  'kw_studio',
  'kw_create',
  'kw_job_target',
  'kw_table',
  'kw_metric',
  'kw_dup',
  'kw_edit_job',
  'kw_question',
  'ev_job_created',
  'ev_board',
  'ev_certified',
  'ev_drift',
  'ev_sync',
  'recency',
  'has_cert',
  'has_board',
  'drift_boost',
  'event_density',
]
