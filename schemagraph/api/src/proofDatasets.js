/**
 * S6 — Anonymized proof datasets (finance + healthcare) with golden pairs.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TESTING_ROOT = join(__dirname, '../../docs/testing')

const cache = new Map()

export const PROOF_DATASETS = [
  {
    id: 'finance',
    label: 'Finance reconciliation (anonymized)',
    industry: 'Finance',
    monkPackId: 'finance-v1',
    goldenPairsFile: 'finance/finance-golden-pairs.json',
    schemaFile: 'finance/anonymized-schema.json',
  },
  {
    id: 'healthcare',
    label: 'Healthcare claims (anonymized)',
    industry: 'Healthcare',
    monkPackId: 'healthcare-v1',
    goldenPairsFile: 'healthcare/healthcare-golden-pairs.json',
    schemaFile: 'healthcare/anonymized-schema.json',
  },
]

function readJson(relativePath) {
  const key = relativePath
  if (cache.has(key)) return cache.get(key)
  const full = join(TESTING_ROOT, relativePath)
  const data = JSON.parse(readFileSync(full, 'utf8'))
  cache.set(key, data)
  return data
}

export function listProofDatasets() {
  return PROOF_DATASETS.map((d) => ({
    id: d.id,
    label: d.label,
    industry: d.industry,
    monkPackId: d.monkPackId,
    goldenPairCount: loadProofGoldenPairs(d.goldenPairsFile).length,
    tableCount: loadProofSchema(d.schemaFile).tables?.length || 0,
  }))
}

export function loadProofGoldenPairs(relativePath) {
  const raw = readJson(relativePath)
  return Array.isArray(raw.pairs) ? raw.pairs : []
}

export function loadProofSchema(relativePath) {
  return readJson(relativePath)
}

export function getProofDataset(datasetId) {
  const meta = PROOF_DATASETS.find((d) => d.id === datasetId)
  if (!meta) return null
  return {
    ...meta,
    goldenPairs: loadProofGoldenPairs(meta.goldenPairsFile),
    schema: loadProofSchema(meta.schemaFile),
  }
}

export function loadGoldenPairsForPack(pack) {
  if (!pack?.goldenPairSource) return []
  return loadProofGoldenPairs(pack.goldenPairSource)
}

export function seedProofGoldenSchedule(workspaceId, datasetId, userId = null) {
  const ds = getProofDataset(datasetId)
  if (!ds) return null
  return import('./scheduledGoldenEval.js').then(({ upsertGoldenEvalSchedule }) =>
    upsertGoldenEvalSchedule(workspaceId, {
      enabled: true,
      intervalHours: 24,
      pairs: ds.goldenPairs,
      userId,
      label: `proof:${datasetId}`,
    }).then((schedule) => ({
      datasetId,
      pairs: ds.goldenPairs.length,
      schedule,
    })),
  )
}
