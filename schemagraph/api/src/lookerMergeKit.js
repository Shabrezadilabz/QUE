/**
 * Sprint 10 — Looker merge kit (RS-6): drop-in LookML from exportLookerPack.
 */
import { exportLookerPack, formatBiExportMarkdown } from './biPlatformExport.js'

export function buildLookerMergeInstructions(pack) {
  return {
    title: 'Que → Looker merge kit',
    steps: [
      'Export LookML views from Que (`GET .../export/looker` or Report Studio ribbon).',
      'Copy `views/que_*.view.lkml` into your Looker project under `views/que/`.',
      'Add explores in your existing model file — do not replace customer explores.',
      'Point explores at certified mart tables in your warehouse.',
      'Run `looker compile` — fix any dialect-specific SQL.',
      'Grant access via existing Looker groups; Que attestation badge stays upstream.',
    ],
    targetPaths: {
      views: 'views/que/',
      modelPatch: 'models/your_model.model.lkml',
    },
    timeEstimate: '< 1 hour for existing Looker shops',
    disclaimer: pack?.disclaimer || 'Merge kit — not a full Looker project generator.',
  }
}

export async function buildLookerMergeKit(workspaceId, opts = {}) {
  const pack = await exportLookerPack(workspaceId, opts)
  const instructions = buildLookerMergeInstructions(pack)
  const sampleRepo = {
    name: 'que-looker-merge-sample',
    structure: [
      'views/que/revenue_by_brand.view.lkml',
      'views/que/order_count.view.lkml',
      'models/que_explores.model.lkml',
      'README.md',
    ],
    readme: `# Que Looker merge sample

Drop \`views/que/*.view.lkml\` into your Looker repo.
Add explores from \`models/que_explores.model.lkml\` to your model.

Generated: ${pack.generatedAt}
`,
  }

  return {
    schemaVersion: 1,
    kind: 'que.looker_merge_kit',
    generatedAt: new Date().toISOString(),
    workspaceId,
    instructions,
    lookerExport: pack,
    sampleRepo,
    files: pack.files || [],
    markdown: formatBiExportMarkdown(pack),
  }
}

/** Pure merge kit from mock export — unit tests. */
export function buildLookerMergeKitFromExport(pack) {
  return {
    kind: 'que.looker_merge_kit',
    instructions: buildLookerMergeInstructions(pack),
    fileCount: (pack.files || []).length,
    explores: pack.lookml?.explores?.length || 0,
  }
}
