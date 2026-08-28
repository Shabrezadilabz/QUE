/**

 * Phase P3.6 — SSM-B ML export + route A/B (heuristic vs trained / stub).

 */

import {

  buildSsmStateVector,

  routeSsmIntent,

  rankFocusTablesFromEvents,

} from './ssmRouter.js'

import { listRecentWorkspaceEvents } from './workspaceEvents.js'

import {

  ensureDefaultSsmModelAsync,

  getSsmTrainedModel,

  predictSsmModel,

  trainSsmModelForWorkspace,

} from './ssmTrainedModel.js'

import { extractSsmFeatures } from './ssmFeatureExtractor.js'

import { generateSyntheticSsmTraces } from './ssmSyntheticTraces.js'



const STUDIO_RE = /\b(dashboard|report|board|bi|chart|visual|kpi)\b/i

const JOB_RE =

  /\b(create|build|make|draft|materialize|scaffold|combine|merge|stitch)\b/i



/**

 * Lite-ML stub — weights event vector + keyword boosts (fallback before train).

 * @param {string} message

 * @param {object[]} events

 */

export function routeSsmMlStub(message, events = []) {

  const vec = buildSsmStateVector(events)

  const g = String(message || '').toLowerCase()

  const focusTableNames = rankFocusTablesFromEvents(events)



  let intent = 'question'

  let score = 0.5



  if (STUDIO_RE.test(g) && (vec.hasRecentBoard || vec.eventCounts.board_published > 0)) {

    intent = 'studio_board'

    score = 0.78 + Math.min(0.12, vec.recencyScore * 0.02)

  } else if (JOB_RE.test(g) && vec.eventCounts.job_created > 0) {

    intent = 'create_job'

    score = 0.76 + Math.min(0.1, vec.eventCounts.sync_completed * 0.03)

  } else if (vec.eventCounts.schema_drift > 0 && /\b(drift|fix|repair)\b/i.test(g)) {

    intent = 'duplicate_fix'

    score = 0.72

  } else if (vec.eventCounts.dataset_certified > 0 && /\b(metric|kpi)\b/i.test(g)) {

    intent = 'metric'

    score = 0.74

  }



  return {

    intent,

    focusTableNames,

    confidence: Math.min(0.95, score),

    model: 'ssm-b-lite-stub-v0',

    source: 'stub',

    stateVector: vec,

  }

}



/**

 * Trained SSM-B route when model exists.

 * @param {string} message

 * @param {object[]} events

 * @param {{ workspaceId?: string }} [opts]

 */

export function routeSsmMlTrained(message, events = [], opts = {}) {

  const model = getSsmTrainedModel(opts.workspaceId)

  if (!model) return null



  const pred = predictSsmModel(model, extractSsmFeatures(message, events))

  return {

    intent: pred.intent,

    focusTableNames: rankFocusTablesFromEvents(events),

    confidence: pred.confidence,

    model: model.modelId,

    source: 'trained',

    probabilities: pred.probabilities,

    stateVector: buildSsmStateVector(events),

    metrics: model.metrics,

  }

}



/**

 * Prefer trained model; fall back to stub.

 */

export function routeSsmMl(message, events = [], opts = {}) {

  return routeSsmMlTrained(message, events, opts) ?? routeSsmMlStub(message, events)

}



/**

 * Compare heuristic router vs ML (trained or stub); pick winner by confidence.

 */

export function compareSsmRoutes(message, events = [], opts = {}) {

  const heuristic = routeSsmIntent(message, {

    events,

    pageContext: opts.pageContext,

    mentions: opts.mentions,

  })

  const ml = routeSsmMl(message, events, opts)



  const mlWinnerKey = ml.source === 'trained' ? 'ml_trained' : 'ml_stub'

  const winner =

    ml.confidence > heuristic.confidence + 0.05 ? mlWinnerKey : 'heuristic'



  return {

    message: String(message || '').slice(0, 500),

    eventCount: events.length,

    heuristic: {

      intent: heuristic.intent,

      confidence: heuristic.confidence,

      focusTableNames: heuristic.focusTableNames,

      workspaceStateSummary: heuristic.workspaceStateSummary,

    },

    ml: {

      intent: ml.intent,

      confidence: ml.confidence,

      focusTableNames: ml.focusTableNames,

      model: ml.model,

      source: ml.source,

    },

    mlStub: {

      intent: ml.intent,

      confidence: ml.confidence,

      focusTableNames: ml.focusTableNames,

      model: ml.model,

    },

    winner,

    agreed: heuristic.intent === ml.intent,

    recommendedIntent: winner.startsWith('ml') ? ml.intent : heuristic.intent,

  }

}



/**

 * Production SSM-B routing — merge A/B winner into full ssmRoute shape.

 * @param {string} message

 * @param {object[]} events

 * @param {{ pageContext?: object, mentions?: object, useAb?: boolean, workspaceId?: string }} [opts]

 */

export function resolveSsmRouteWithAb(message, events = [], opts = {}) {

  const heuristic = routeSsmIntent(message, {

    events,

    pageContext: opts.pageContext,

    mentions: opts.mentions,

  })



  if (opts.useAb === false) {

    return {

      ssmRoute: { ...heuristic, routingSource: 'heuristic' },

      ssmAb: null,

      recommendedIntent: heuristic.intent,

    }

  }



  const comparison = compareSsmRoutes(message, events, opts)

  const useMl = comparison.winner.startsWith('ml')

  const ml = routeSsmMl(message, events, opts)



  const ssmRoute = {

    ...heuristic,

    intent: comparison.recommendedIntent,

    routingSource: useMl ? comparison.winner : 'heuristic',

    confidence: useMl ? ml.confidence : comparison.heuristic.confidence,

    focusTableNames:

      useMl && ml.focusTableNames?.length

        ? ml.focusTableNames

        : heuristic.focusTableNames,

    mlModel: useMl ? ml.model : null,

    abWinner: comparison.winner,

    abAgreed: comparison.agreed,

  }



  return {

    ssmRoute,

    ssmAb: comparison,

    recommendedIntent: comparison.recommendedIntent,

  }

}



/**

 * Train SSM-B from synthetic traces + optional workspace export samples.

 * @param {string} workspaceId

 * @param {{ syntheticPerIntent?: number, exportSamples?: object[] }} [opts]

 */

export function trainSsmRoutingModel(workspaceId, opts = {}) {

  return trainSsmModelForWorkspace(workspaceId, opts)

}



/**

 * @param {string} [workspaceId]

 */

export function getSsmModelStatus(workspaceId) {

  const model = getSsmTrainedModel(workspaceId)

  if (!model) {

    return {

      trained: false,

      modelId: null,

      sampleCount: 0,

      metrics: null,

    }

  }

  return {

    trained: true,

    modelId: model.modelId,

    trainedAt: model.trainedAt,

    sampleCount: model.sampleCount,

    syntheticCount: model.syntheticCount,

    metrics: model.metrics,

  }

}



/**

 * Export training bundle — events + state vectors (no row payloads).

 * @param {string} workspaceId

 * @param {{ limit?: number }} [opts]

 */

export async function buildSsmTrainingExport(workspaceId, opts = {}) {

  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500)

  const events = await listRecentWorkspaceEvents(workspaceId, limit)

  const stateVector = buildSsmStateVector(events)



  const samples = events.slice(0, 80).map((e) => ({

    eventType: e.eventType,

    createdAt: e.createdAt,

    meta: {

      tableName: e.meta?.tableName ?? null,

      jobId: e.meta?.jobId ?? null,

      connectionName: e.meta?.connectionName ?? null,

      suggestedCount: e.meta?.suggestedCount ?? null,

    },

    stateVector: buildSsmStateVector([e, ...events.slice(0, 20)]),

  }))



  const syntheticPreview = generateSyntheticSsmTraces(4)



  return {

    workspaceId,

    generatedAt: new Date().toISOString(),

    format: 'que-ssm-b-export-v1',

    eventCount: events.length,

    aggregateStateVector: stateVector,

    samples,

    syntheticPreview: syntheticPreview.slice(0, 12).map((t) => ({

      message: t.message,

      label: t.label,

      eventTypes: t.events.map((e) => e.eventType),

    })),

    modelStatus: getSsmModelStatus(workspaceId),

    note: 'No row payloads — safe for offline SSM-B training or A/B eval.',

  }

}



const workspaceTrainPromises = new Map()



/**

 * Ensure global default model + optional per-workspace fine-tune from event log.

 * @param {string} workspaceId

 * @param {object[]} [events]

 */

export async function ensureWorkspaceSsmModelAsync(workspaceId, events = []) {

  await ensureDefaultSsmModelAsync()

  if (!workspaceId || workspaceId === '__default__') {

    return getSsmTrainedModel('__default__')

  }

  const existing = getSsmTrainedModel(workspaceId)

  if (existing) return existing



  if ((events || []).length < 5) {

    return getSsmTrainedModel('__default__')

  }



  if (!workspaceTrainPromises.has(workspaceId)) {

    workspaceTrainPromises.set(

      workspaceId,

      Promise.resolve().then(() => {

        try {

          return trainSsmModelForWorkspace(workspaceId, {

            syntheticPerIntent: 12,

            exportSamples: events.slice(0, 60).map((e) => ({

              eventType: e.eventType,

              createdAt: e.createdAt,

              meta: e.meta || {},

            })),

          })

        } catch {

          return getSsmTrainedModel('__default__')

        }

      }),

    )

  }



  return workspaceTrainPromises.get(workspaceId)

}



export { ensureDefaultSsmModelAsync }


