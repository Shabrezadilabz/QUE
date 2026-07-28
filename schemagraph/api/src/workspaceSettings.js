/**
 * Workspace settings — summary + preference flags (no secrets).
 */
import { query } from './db.js'
import { listAvailableModels } from './ai/models.js'
import { embeddingMode } from './ai/embeddings.js'
import {
  getAiChunkStats,
  vectorExtensionReady,
} from './ai/vectorStore.js'
import { feedbackStats } from './ai/feedback.js'
import { getSecretsStatus, resolveProviderKeys } from './secrets.js'
import { getSsoConfig } from './auth.js'

const DEFAULT_SETTINGS = {
  includeSamplesDefault: true,
  inferJoinsOnSync: true,
  preferLlmChat: false,
  aiModelId: 'gpt-4o-mini',
  ragTopK: 8,
  ragIncludeDocs: true,
  /** Block dbt/json/sql export when open high-severity drift or broken contract */
  blockExportOnDrift: true,
  /** Block export when suggested (unreviewed) joins touch job tables */
  blockExportOnUnreviewedJoins: true,
  /** Emit contract/drift events to outbox (+ optional webhook) */
  emitContractEvents: true,
  contractWebhookUrl: '',
  /** Additive dbt / GitHub export layer (no secrets — token is env GITHUB_TOKEN) */
  githubOwner: '',
  githubRepo: '',
  githubBaseBranch: 'main',
  dbtModelsPath: 'models/que',
}

function mergeSettings(raw) {
  return { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) }
}

export async function getWorkspaceSettings(workspaceId) {
  const { rows } = await query(
    `SELECT id, name, slug, created_at, settings_json
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (rows.length === 0) return null
  const ws = rows[0]

  const [conn, objs, rels, jobs, snaps] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM connections WHERE workspace_id = $1`, [
      workspaceId,
    ]),
    query(
      `SELECT COUNT(*)::int AS n FROM schema_objects WHERE workspace_id = $1`,
      [workspaceId],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM relationships
       WHERE workspace_id = $1 AND status <> 'rejected'`,
      [workspaceId],
    ),
    query(`SELECT COUNT(*)::int AS n FROM jobs WHERE workspace_id = $1`, [
      workspaceId,
    ]),
    query(
      `SELECT id, label, created_at FROM schema_snapshots
       WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    ),
  ])

  let vectorReady = false
  let chunkStats = null
  let feedback = { up: 0, down: 0 }
  try {
    vectorReady = await vectorExtensionReady()
    if (vectorReady) {
      chunkStats = await getAiChunkStats(workspaceId)
      feedback = await feedbackStats(workspaceId)
    }
  } catch {
    /* AI tables may be missing */
  }

  let secretsStatus = null
  let keys = { openai: null, anthropic: null }
  try {
    secretsStatus = await getSecretsStatus(workspaceId)
    keys = await resolveProviderKeys(workspaceId)
  } catch {
    /* secrets table may be missing */
  }

  const models = listAvailableModels(keys)
  const embMode = embeddingMode(keys.openai)

  return {
    workspace: {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      createdAt: ws.created_at,
    },
    settings: mergeSettings(ws.settings_json),
    stats: {
      connections: conn.rows[0].n,
      tables: objs.rows[0].n,
      relationships: rels.rows[0].n,
      jobs: jobs.rows[0].n,
    },
    latestSnapshot: snaps.rows[0]
      ? {
          id: snaps.rows[0].id,
          label: snaps.rows[0].label,
          createdAt: snaps.rows[0].created_at,
        }
      : null,
    capabilities: {
      connectors: [
        'postgresql',
        'excel',
        'csv',
        'mongodb',
        'databricks',
        'snowflake',
      ],
      llm: {
        openaiConfigured: Boolean(keys.openai),
        anthropicConfigured: Boolean(keys.anthropic),
        openaiSource: keys.openaiSource,
        anthropicSource: keys.anthropicSource,
        byok: true,
      },
      secrets: secretsStatus,
      ai: {
        vectorReady,
        embeddingMode: embMode,
        models,
        docsIndexed: (chunkStats?.docChunks || 0) > 0,
        chunkStats,
        feedback,
        pillars: {
          nlp: true,
          rag: vectorReady,
          generativeInference: models.length > 0,
          agenticSkills: true,
          recommendationJoins: true,
          limitedMemory: true,
          feedbackLoop: true,
          byok: true,
          computerVision: false,
          customModelTraining: false,
        },
      },
      github: {
        tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
        dbtExport: true,
      },
      sso: getSsoConfig(),
      brand: 'Que',
      wedge:
        'Schema-only stitch layer between messy sources and production jobs.',
    },
  }
}

export async function updateWorkspaceSettings(workspaceId, patch = {}) {
  const current = await getWorkspaceSettings(workspaceId)
  if (!current) return null

  const next = mergeSettings({
    ...current.settings,
    ...pickAllowed(patch),
  })

  await query(
    `UPDATE workspaces SET settings_json = $2::jsonb WHERE id = $1`,
    [workspaceId, JSON.stringify(next)],
  )

  return getWorkspaceSettings(workspaceId)
}

function pickAllowed(patch) {
  const out = {}
  if (typeof patch.includeSamplesDefault === 'boolean') {
    out.includeSamplesDefault = patch.includeSamplesDefault
  }
  if (typeof patch.inferJoinsOnSync === 'boolean') {
    out.inferJoinsOnSync = patch.inferJoinsOnSync
  }
  if (typeof patch.preferLlmChat === 'boolean') {
    out.preferLlmChat = patch.preferLlmChat
  }
  if (typeof patch.aiModelId === 'string' && patch.aiModelId.trim()) {
    out.aiModelId = patch.aiModelId.trim().slice(0, 80)
  }
  if (typeof patch.ragTopK === 'number' && Number.isFinite(patch.ragTopK)) {
    out.ragTopK = Math.min(32, Math.max(1, Math.round(patch.ragTopK)))
  }
  if (typeof patch.ragIncludeDocs === 'boolean') {
    out.ragIncludeDocs = patch.ragIncludeDocs
  }
  if (typeof patch.blockExportOnDrift === 'boolean') {
    out.blockExportOnDrift = patch.blockExportOnDrift
  }
  if (typeof patch.blockExportOnUnreviewedJoins === 'boolean') {
    out.blockExportOnUnreviewedJoins = patch.blockExportOnUnreviewedJoins
  }
  if (typeof patch.emitContractEvents === 'boolean') {
    out.emitContractEvents = patch.emitContractEvents
  }
  if (typeof patch.contractWebhookUrl === 'string') {
    out.contractWebhookUrl = patch.contractWebhookUrl.trim().slice(0, 500)
  }
  if (typeof patch.githubOwner === 'string') {
    out.githubOwner = patch.githubOwner.trim().slice(0, 100)
  }
  if (typeof patch.githubRepo === 'string') {
    out.githubRepo = patch.githubRepo.trim().slice(0, 100)
  }
  if (typeof patch.githubBaseBranch === 'string') {
    out.githubBaseBranch =
      patch.githubBaseBranch.trim().slice(0, 100) || 'main'
  }
  if (typeof patch.dbtModelsPath === 'string') {
    out.dbtModelsPath =
      patch.dbtModelsPath.trim().replace(/^\/+|\/+$/g, '').slice(0, 200) ||
      'models/que'
  }
  return out
}
