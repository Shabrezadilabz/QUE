/**
 * SSM-B — synthetic labeled traces for offline training (no row payloads).
 */
import { SSM_INTENTS } from './ssmFeatureExtractor.js'

const MESSAGE_TEMPLATES = {
  studio_board: [
    'build revenue dashboard for exec board',
    'create a BI report with KPI charts',
    'scaffold sportedge exec board visuals',
    'publish dashboard for leadership review',
    'add bar chart to the report studio board',
  ],
  create_job: [
    'create a job for revenue mart',
    'build a transform pipeline for orders',
    'draft SQL notebook combining customers and orders',
    'materialize stitched tables into a job',
    'scaffold a pipeline job for sync data',
  ],
  create_table: [
    'create a table for customer 360 mart',
    'materialize orders view in warehouse',
    'build a CTAS table from joined sources',
    'scaffold mart table for analytics',
  ],
  edit_job: [
    'edit job to add returns table',
    'update the revenue transform job',
    'modify notebook job sql for dedupe',
  ],
  metric: [
    'define certified revenue KPI metric',
    'create OKR measure for active users',
    'add metric for gross margin',
  ],
  duplicate_fix: [
    'fix duplicate rows in orders profile',
    'run dedup quality check on customers',
    'repair schema drift on payments table',
    'profile duplicates in line items',
  ],
  question: [
    'what tables do we have in the workspace',
    'how are orders and customers joined',
    'show me recent sync status',
    'explain the revenue mart lineage',
    'which connections are certified',
  ],
}

const EVENT_PROFILES = {
  studio_board: [
    { eventType: 'board_published', meta: { tableName: 'orders' } },
    { eventType: 'dataset_certified', meta: { tableName: 'orders' } },
    { eventType: 'sync_completed', meta: { tableName: 'orders' } },
  ],
  create_job: [
    { eventType: 'job_created', meta: { jobId: 'job-1', tableName: 'orders' } },
    { eventType: 'sync_completed', meta: { tableName: 'orders' } },
    { eventType: 'join_promoted', meta: { tableName: 'customers' } },
  ],
  create_table: [
    { eventType: 'job_created', meta: { tableName: 'mart_orders' } },
    { eventType: 'dataset_certified', meta: { tableName: 'raw_orders' } },
  ],
  edit_job: [
    { eventType: 'job_created', meta: { jobId: 'job-42' } },
    { eventType: 'job_run_completed', meta: { jobId: 'job-42' } },
  ],
  metric: [
    { eventType: 'dataset_certified', meta: { tableName: 'revenue_mart' } },
    { eventType: 'board_published', meta: { tableName: 'revenue_mart' } },
  ],
  duplicate_fix: [
    { eventType: 'schema_drift', meta: { tableName: 'orders' } },
    { eventType: 'sync_completed', meta: { tableName: 'orders' } },
  ],
  question: [
    { eventType: 'chat_query', meta: {} },
    { eventType: 'connector_added', meta: { connectionName: 'postgres' } },
  ],
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function stampEvents(profile, offsetMs = 0) {
  const now = Date.now()
  return profile.map((e, i) => ({
    ...e,
    createdAt: new Date(now - offsetMs - i * 120_000).toISOString(),
    meta: { ...(e.meta || {}) },
  }))
}

/**
 * @param {number} [countPerIntent=24]
 */
export function generateSyntheticSsmTraces(countPerIntent = 24) {
  const traces = []
  for (const intent of SSM_INTENTS) {
    const messages = MESSAGE_TEMPLATES[intent] || ['help with data']
    const profile = EVENT_PROFILES[intent] || []
    for (let i = 0; i < countPerIntent; i += 1) {
      traces.push({
        id: `syn-${intent}-${i}`,
        message: pick(messages),
        label: intent,
        events: stampEvents(profile, i * 1000),
        synthetic: true,
      })
    }
  }
  return traces
}

/**
 * Merge workspace export samples with heuristic pseudo-labels.
 * @param {object[]} exportSamples
 * @param {function} labelFn
 */
export function augmentTracesFromExport(exportSamples = [], labelFn) {
  return exportSamples
    .filter((s) => s.eventType)
    .slice(0, 80)
    .map((s, i) => {
      const events = [
        {
          eventType: s.eventType,
          createdAt: s.createdAt || new Date().toISOString(),
          meta: s.meta || {},
        },
      ]
      const message = `workspace event ${s.eventType} on ${s.meta?.tableName || 'table'}`
      const label = labelFn(message, events)
      return {
        id: `ws-${i}`,
        message,
        label,
        events,
        synthetic: false,
      }
    })
}

export function splitTrainHoldout(traces, holdoutRatio = 0.15) {
  const shuffled = [...traces].sort(() => Math.random() - 0.5)
  const holdout = Math.max(1, Math.floor(shuffled.length * holdoutRatio))
  return {
    train: shuffled.slice(holdout),
    holdout: shuffled.slice(0, holdout),
  }
}
