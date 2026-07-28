/**
 * Join inference golden-set eval — precision / recall / F1 on labeled pairs.
 * Run: npm run eval:joins
 * Exit 1 if precision or recall below thresholds (diligence gate).
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreJoinCandidate } from '../src/inferJoins.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIN_PRECISION = Number(process.env.QUE_JOIN_MIN_PRECISION || 0.75)
const MIN_RECALL = Number(process.env.QUE_JOIN_MIN_RECALL || 0.7)

const golden = JSON.parse(
  readFileSync(resolve(__dirname, 'join-golden-set.json'), 'utf8'),
)

let tp = 0
let fp = 0
let fn = 0
let tn = 0
const failures = []

for (const c of golden.cases) {
  const hit = scoreJoinCandidate({
    fromCol: c.from.col,
    fromTable: c.from.table,
    fromType: c.from.type,
    fromKey: c.from.key,
    fromSamples: c.from.samples,
    fromRefLabel: c.from.ref,
    toCol: c.to.col,
    toTable: c.to.table,
    toType: c.to.type,
    toKey: c.to.key,
    toSamples: c.to.samples,
    toRefLabel: c.to.ref,
    priorApproved: Boolean(c.priorApproved),
    priorRejected: Boolean(c.priorRejected),
  })
  const predicted = Boolean(hit)
  const positive = c.label === 'positive'

  if (positive && predicted) tp += 1
  else if (!positive && predicted) {
    fp += 1
    failures.push({ id: c.id, kind: 'false_positive', conf: hit?.confidence })
  } else if (positive && !predicted) {
    fn += 1
    failures.push({ id: c.id, kind: 'false_negative' })
  } else tn += 1
}

const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
const f1 =
  precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

const report = {
  cases: golden.cases.length,
  tp,
  fp,
  fn,
  tn,
  precision: Number(precision.toFixed(3)),
  recall: Number(recall.toFixed(3)),
  f1: Number(f1.toFixed(3)),
  thresholds: { minPrecision: MIN_PRECISION, minRecall: MIN_RECALL },
  failures,
}

console.log(JSON.stringify(report, null, 2))

const pass = precision >= MIN_PRECISION && recall >= MIN_RECALL
if (!pass) {
  console.error(
    `[Que] join eval FAILED — precision ${report.precision} (need ≥${MIN_PRECISION}), recall ${report.recall} (need ≥${MIN_RECALL})`,
  )
  process.exit(1)
}
console.log('[Que] join eval PASSED')
