/**
 * S3.3 — Semantic layer export (metrics YAML + dbt semantic stub).
 */
import { listMetrics } from './metricDefinitions.js'
import { getLatestPackCertification } from './packCertification.js'
import { getIndustryPack } from './packs/index.js'

function yamlEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
}

/**
 * @param {string} workspaceId
 * @param {{ packId?: string, certifiedOnly?: boolean }} [opts]
 */
export async function exportSemanticLayerBundle(workspaceId, opts = {}) {
  const packId = opts.packId || 'ecommerce-v1'
  const pack = getIndustryPack(packId)
  const cert = await getLatestPackCertification(workspaceId, packId).catch(() => null)
  const certifiedOnly = opts.certifiedOnly !== false

  const all = await listMetrics(workspaceId)
  let metrics = all.filter(
    (m) =>
      (m.tags || []).includes('monk-mode') ||
      (m.tags || []).includes('pack') ||
      (m.tags || []).includes('auto-scaffold'),
  )
  if (!metrics.length) metrics = all
  if (certifiedOnly) {
    metrics = metrics.filter((m) => m.certified)
  }

  const yamlMetrics = metrics.map((m) => ({
    name: m.slug || m.name,
    label: m.name,
    description: m.description || '',
    type: 'simple',
    type_params: {
      measure: m.expressionSql || 'COUNT(*)',
    },
    meta: {
      que_metric_id: m.id,
      dataset_id: m.datasetId,
      certified: m.certified,
    },
  }))

  const yamlLines = [
    '# Que semantic layer export',
    `version: 2`,
    `generated_at: ${new Date().toISOString()}`,
    `pack_id: ${packId}`,
    `certification_status: ${cert?.status || 'unknown'}`,
    '',
    'metrics:',
    ...yamlMetrics.map(
      (m) =>
        `  - name: ${m.name}\n` +
        `    label: "${yamlEscape(m.label)}"\n` +
        `    type: ${m.type}\n` +
        `    type_params:\n` +
        `      measure: "${yamlEscape(m.type_params.measure)}"`,
    ),
  ]

  const dbtSemantic = {
    semantic_models: [
      {
        name: `${packId.replace(/-/g, '_')}_mart`,
        defaults: { agg_time_dimension: 'event_date' },
        entities: [],
        measures: yamlMetrics.map((m) => ({
          name: m.name,
          agg: 'sum',
          expr: m.type_params.measure,
        })),
      },
    ],
    metrics: yamlMetrics.map((m) => ({
      name: m.name,
      label: m.label,
      type: 'simple',
      type_params: { measure: m.name },
    })),
  }

  return {
    format: 'que_semantic_v1',
    packId,
    packName: pack?.displayName || packId,
    certification: cert
      ? {
          status: cert.status,
          goldenRecall: cert.goldenRecall,
          certifiedAt: cert.certifiedAt,
        }
      : null,
    metricCount: yamlMetrics.length,
    files: [
      {
        path: `semantic/${packId}/metrics.yaml`,
        content: yamlLines.join('\n'),
      },
      {
        path: `semantic/${packId}/dbt_semantic.json`,
        content: JSON.stringify(dbtSemantic, null, 2),
      },
    ],
    metrics: yamlMetrics,
  }
}
