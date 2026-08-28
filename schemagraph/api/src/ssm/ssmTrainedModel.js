/**
 * SSM-B — trained softmax classifier (pure JS, no row payloads).
 */
import { extractSsmFeatures, SSM_INTENTS } from './ssmFeatureExtractor.js'
import {
  augmentTracesFromExport,
  generateSyntheticSsmTraces,
  splitTrainHoldout,
} from './ssmSyntheticTraces.js'
import { routeSsmIntent } from './ssmRouter.js'

const MODEL_ID = 'ssm-b-trained-v1'
const globalModels = new Map()

function softmax(logits) {
  const max = Math.max(...logits)
  const exps = logits.map((z) => Math.exp(z - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

function initWeights(featureCount, classCount) {
  const weights = []
  for (let c = 0; c < classCount; c += 1) {
    weights.push(new Array(featureCount).fill(0).map(() => (Math.random() - 0.5) * 0.05))
  }
  return weights
}

/**
 * @param {object[]} traces — { message, label, events }
 * @param {{ epochs?: number, lr?: number }} [opts]
 */
export function trainSsmClassifier(traces, opts = {}) {
  const samples = traces.filter((t) => SSM_INTENTS.includes(t.label))
  if (samples.length < 8) {
    const err = new Error('need at least 8 labeled traces to train')
    err.status = 400
    throw err
  }

  const featureCount = extractSsmFeatures('', []).length
  const classCount = SSM_INTENTS.length
  const weights = initWeights(featureCount, classCount)
  const epochs = opts.epochs ?? 120
  const lr = opts.lr ?? 0.08

  for (let ep = 0; ep < epochs; ep += 1) {
    for (const sample of samples) {
      const x = extractSsmFeatures(sample.message, sample.events || [])
      const y = SSM_INTENTS.indexOf(sample.label)
      const logits = weights.map((w) => w.reduce((s, wi, i) => s + wi * x[i], 0))
      const probs = softmax(logits)
      for (let c = 0; c < classCount; c += 1) {
        const err = probs[c] - (c === y ? 1 : 0)
        for (let f = 0; f < featureCount; f += 1) {
          weights[c][f] -= lr * err * x[f]
        }
      }
    }
  }

  const { train, holdout } = splitTrainHoldout(samples, 0.2)
  const model = {
    modelId: MODEL_ID,
    intents: [...SSM_INTENTS],
    featureCount,
    weights,
    trainedAt: new Date().toISOString(),
    sampleCount: samples.length,
    syntheticCount: samples.filter((t) => t.synthetic).length,
  }

  const trainAcc = evaluateSsmModel(model, train)
  const holdoutAcc = evaluateSsmModel(model, holdout)

  return {
    ...model,
    metrics: {
      trainAccuracy: trainAcc,
      holdoutAccuracy: holdoutAcc,
    },
  }
}

/**
 * @param {object} model
 * @param {object[]} traces
 */
export function evaluateSsmModel(model, traces) {
  if (!traces.length) return 0
  let correct = 0
  for (const t of traces) {
    const pred = predictSsmModel(model, extractSsmFeatures(t.message, t.events || []))
    if (pred.intent === t.label) correct += 1
  }
  return Math.round((correct / traces.length) * 1000) / 1000
}

/**
 * @param {object} model
 * @param {number[]} features
 */
export function predictSsmModel(model, features) {
  const logits = model.weights.map((w) =>
    w.reduce((s, wi, i) => s + wi * (features[i] ?? 0), 0),
  )
  const probs = softmax(logits)
  let best = 0
  for (let i = 1; i < probs.length; i += 1) {
    if (probs[i] > probs[best]) best = i
  }
  return {
    intent: model.intents[best],
    confidence: Math.min(0.98, Math.max(0.5, probs[best])),
    probabilities: Object.fromEntries(
      model.intents.map((intent, i) => [intent, Math.round(probs[i] * 1000) / 1000]),
    ),
  }
}

/**
 * @param {string} workspaceId
 * @param {{ syntheticPerIntent?: number, exportSamples?: object[] }} [opts]
 */
export function trainSsmModelForWorkspace(workspaceId, opts = {}) {
  const synthetic = generateSyntheticSsmTraces(opts.syntheticPerIntent ?? 20)
  let traces = [...synthetic]

  if (opts.exportSamples?.length) {
    const augmented = augmentTracesFromExport(opts.exportSamples, (msg, ev) =>
      routeSsmIntent(msg, { events: ev }).intent,
    )
    traces = [...traces, ...augmented]
  }

  const model = trainSsmClassifier(traces)
  globalModels.set(workspaceId, model)
  globalModels.set('__default__', model)
  return model
}

/**
 * @param {string} [workspaceId]
 */
export function getSsmTrainedModel(workspaceId) {
  return globalModels.get(workspaceId) || globalModels.get('__default__') || null
}

let defaultInitPromise = null

/** Lazy-train default model from synthetic traces on first prod route. */
export function ensureDefaultSsmModel() {
  if (globalModels.has('__default__')) {
    return globalModels.get('__default__')
  }
  if (!defaultInitPromise) {
    defaultInitPromise = Promise.resolve().then(() => {
      const model = trainSsmModelForWorkspace('__default__', { syntheticPerIntent: 24 })
      return model
    })
  }
  return null
}

export async function ensureDefaultSsmModelAsync() {
  const existing = getSsmTrainedModel('__default__')
  if (existing) return existing
  if (!defaultInitPromise) {
    ensureDefaultSsmModel()
  }
  return defaultInitPromise
}

export function clearSsmModelsForTests() {
  globalModels.clear()
  defaultInitPromise = null
}
