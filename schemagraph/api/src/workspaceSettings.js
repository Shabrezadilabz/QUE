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
import { getSecretsStatus, resolveProviderKeys, resolveGithubToken } from './secrets.js'
import { getSsoConfig } from './auth.js'

const DEFAULT_SETTINGS = {
  includeSamplesDefault: false,
  scrubSamples: true,
  /**
   * Production — AI chat/agent may use pinned scrubbed 5–10 row samples.
   * Never full tables. Default ON for join/SQL quality.
   */
  aiMayUsePinnedSamples: true,
  /** Rows pinned per table (5–10) */
  pinnedSampleRows: 10,
  /** Offer B — Que-hosted job output store for Excel/SQL customers */
  enableManagedDataPlane: false,
  /** Default job landing: customer | managed | que */
  defaultExecutionPlane: 'customer',
  /** Offer B quotas / retention */
  managedMaxDatasets: 25,
  managedMaxRowsPerDataset: 50000,
  managedRetentionDays: 90,
  inferJoinsOnSync: true,
  /** S2 — after sync webhook (Airflow/n8n/Kestra) */
  postSyncWebhookUrl: '',
  /** S2 — queue Monk run after successful sync (default off) */
  postSyncQueueMonk: false,
  postSyncMonkPackId: 'ecommerce-v1',
  /** S2 — CEO chat limited to certified marts + glossary */
  ceoChatCertifiedOnly: true,
  /** S2 — last sync banner hint (UI) */
  lastPostSync: null,
  preferLlmChat: false,
  aiModelId: 'gpt-4o-mini',
  ragTopK: 8,
  ragIncludeDocs: true,
  /** Block dbt/json/sql export when open high-severity drift or broken contract */
  blockExportOnDrift: true,
  /** Block dbt-pr when open column-level drift touches job tables */
  blockPrOnColumnDrift: true,
  /** Block export when suggested (unreviewed) joins touch job tables */
  blockExportOnUnreviewedJoins: true,
  /** Emit contract/drift events to outbox (+ optional webhook) */
  emitContractEvents: true,
  contractWebhookUrl: '',
  /** Wave 2.3 — Slack/webhook + email list for high drift */
  driftAlertsEnabled: true,
  driftAlertOnHigh: true,
  driftAlertWebhookUrl: '',
  driftAlertEmails: '',
  /** Additive dbt / GitHub export layer — token via workspace secret or env */
  githubOwner: '',
  githubRepo: '',
  githubBaseBranch: 'main',
  dbtModelsPath: 'models/que',
  /** Databricks query-history assisted joins (MVP) */
  databricksQueryJoinAssist: true,
  /** Snowflake query-history assisted joins (MVP) */
  snowflakeQueryJoinAssist: true,
  /** Feature activation flags (admin toggles) */
  /** @deprecated use enableQueAgent — kept for migration */
  enableStitchAgent: true,
  /** Unified Que Agent (chat + genie) — default ON */
  enableQueAgent: true,
  enableLiveValidate: true,
  enableMaterialize: true,
  /**
   * Phase 3 — optional auto-Promote for low-risk suggested joins only.
   * Default false: HITL Promote remains required.
   */
  enableAutoPromoteLowRisk: false,
  /**
   * CEO P0 — minimum golden-set recall (0–1) before Green auto-Promote runs.
   * Default 0.9. Set 0 to skip the recall gate (still needs enableAutoPromoteLowRisk).
   */
  autoPromoteMinRecall: 0.9,
  /** Last golden eval snapshot { recall, precision, at, pairCount } */
  lastGoldenEval: null,
  /** CEO Yellow one-click Promote min role */
  yellowPromoteMinRole: 'member',
  /** Red tier Promote min role (DE/admin) */
  redPromoteMinRole: 'admin',
  /** Phase 4 — catalog / governance expansion (optional) */
  enableCatalogGovernance: false,
  /** Prefer steward-oriented nav copy / default landings when true */
  stewardUxMode: false,
  ticketProvider: 'webhook',
  ticketWebhookUrl: '',
  ticketWebhookAuthHeader: '',
  jiraWebhookUrl: '',
  serviceNowWebhookUrl: '',
  /** Phase 5 — enterprise control plane */
  enforceSso: false,
  siemExportEnabled: false,
  siemWebhookUrl: '',
  dataRegion: '',
  dataResidency: '',
  slaUptimeTarget: '99.9%',
  slaRpoHours: 24,
  slaRtoHours: 4,
  /** Comma/newline-separated GitHub branches allowed for dbt PRs */
  githubAllowedBranches: 'main',
  /** Lowest role allowed to open PRs to githubBaseBranch (member|admin|owner) */
  githubPrMinRole: 'member',
  /** Phase 2 Team OS — propose vs promote */
  joinProposeMinRole: 'member',
  joinPromoteMinRole: 'member',
  /** Slack/Teams webhooks */
  joinReviewNotifyEnabled: true,
  joinReviewWebhookUrl: '',
  /** Slack channel ID/name for interactive Block Kit (requires SLACK_BOT_TOKEN) */
  slackNotifyChannel: '',
  joinPromoteNotify: false,
  driftDigestEnabled: true,
  driftDigestWebhookUrl: '',
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
  let keys = { openai: null, anthropic: null, openrouter: null }
  try {
    secretsStatus = await getSecretsStatus(workspaceId)
    keys = await resolveProviderKeys(workspaceId)
  } catch {
    /* secrets table may be missing */
  }

  const models = listAvailableModels(keys)
  const embMode = embeddingMode(keys)

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
        'bigquery',
        'salesforce',
      ],
      llm: {
        openaiConfigured: Boolean(keys.openai),
        anthropicConfigured: Boolean(keys.anthropic),
        openrouterConfigured: Boolean(keys.openrouter),
        openaiSource: keys.openaiSource,
        anthropicSource: keys.anthropicSource,
        openrouterSource: keys.openrouterSource,
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
      github: await (async () => {
        const gh = await resolveGithubToken(workspaceId)
        return {
          tokenConfigured: Boolean(gh.token),
          tokenSource: gh.source,
          dbtExport: true,
        }
      })(),
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
  if (typeof patch.blockPrOnColumnDrift === 'boolean') {
    out.blockPrOnColumnDrift = patch.blockPrOnColumnDrift
  }
  if (typeof patch.scrubSamples === 'boolean') {
    out.scrubSamples = patch.scrubSamples
  }
  if (typeof patch.aiMayUsePinnedSamples === 'boolean') {
    out.aiMayUsePinnedSamples = patch.aiMayUsePinnedSamples
  }
  if (
    typeof patch.pinnedSampleRows === 'number' &&
    Number.isFinite(patch.pinnedSampleRows)
  ) {
    out.pinnedSampleRows = Math.min(
      10,
      Math.max(5, Math.round(patch.pinnedSampleRows)),
    )
  }
  if (typeof patch.enableManagedDataPlane === 'boolean') {
    out.enableManagedDataPlane = patch.enableManagedDataPlane
  }
  if (typeof patch.defaultExecutionPlane === 'string') {
    const p = patch.defaultExecutionPlane.trim().toLowerCase()
    if (['customer', 'managed', 'que'].includes(p)) {
      out.defaultExecutionPlane = p
    }
  }
  if (
    typeof patch.managedMaxDatasets === 'number' &&
    Number.isFinite(patch.managedMaxDatasets)
  ) {
    out.managedMaxDatasets = Math.min(
      200,
      Math.max(1, Math.round(patch.managedMaxDatasets)),
    )
  }
  if (
    typeof patch.managedMaxRowsPerDataset === 'number' &&
    Number.isFinite(patch.managedMaxRowsPerDataset)
  ) {
    out.managedMaxRowsPerDataset = Math.min(
      100000,
      Math.max(100, Math.round(patch.managedMaxRowsPerDataset)),
    )
  }
  if (
    typeof patch.managedRetentionDays === 'number' &&
    Number.isFinite(patch.managedRetentionDays)
  ) {
    out.managedRetentionDays = Math.min(
      365,
      Math.max(1, Math.round(patch.managedRetentionDays)),
    )
  }
  if (typeof patch.databricksQueryJoinAssist === 'boolean') {
    out.databricksQueryJoinAssist = patch.databricksQueryJoinAssist
  }
  if (typeof patch.snowflakeQueryJoinAssist === 'boolean') {
    out.snowflakeQueryJoinAssist = patch.snowflakeQueryJoinAssist
  }
  if (typeof patch.enableStitchAgent === 'boolean') {
    out.enableStitchAgent = patch.enableStitchAgent
  }
  if (typeof patch.enableQueAgent === 'boolean') {
    out.enableQueAgent = patch.enableQueAgent
  }
  if (typeof patch.enableLiveValidate === 'boolean') {
    out.enableLiveValidate = patch.enableLiveValidate
  }
  if (typeof patch.enableMaterialize === 'boolean') {
    out.enableMaterialize = patch.enableMaterialize
  }
  if (typeof patch.enableAutoPromoteLowRisk === 'boolean') {
    out.enableAutoPromoteLowRisk = patch.enableAutoPromoteLowRisk
  }
  if (
    typeof patch.autoPromoteMinRecall === 'number' &&
    Number.isFinite(patch.autoPromoteMinRecall)
  ) {
    out.autoPromoteMinRecall = Math.min(
      1,
      Math.max(0, Number(patch.autoPromoteMinRecall)),
    )
  }
  if (patch.lastGoldenEval && typeof patch.lastGoldenEval === 'object') {
    const recall = Number(patch.lastGoldenEval.recall)
    const precision = Number(patch.lastGoldenEval.precision)
    out.lastGoldenEval = {
      recall: Number.isFinite(recall) ? recall : null,
      precision: Number.isFinite(precision) ? precision : null,
      at: String(patch.lastGoldenEval.at || new Date().toISOString()),
      pairCount: patch.lastGoldenEval.pairCount ?? null,
    }
  }
  for (const key of ['yellowPromoteMinRole', 'redPromoteMinRole']) {
    if (typeof patch[key] === 'string') {
      const role = patch[key].trim().toLowerCase()
      if (['member', 'admin', 'owner'].includes(role)) out[key] = role
    }
  }
  if (typeof patch.enableCatalogGovernance === 'boolean') {
    out.enableCatalogGovernance = patch.enableCatalogGovernance
  }
  if (typeof patch.stewardUxMode === 'boolean') {
    out.stewardUxMode = patch.stewardUxMode
  }
  if (typeof patch.ticketProvider === 'string') {
    const p = patch.ticketProvider.trim().toLowerCase()
    if (['webhook', 'jira', 'servicenow'].includes(p)) out.ticketProvider = p
  }
  for (const key of [
    'ticketWebhookUrl',
    'ticketWebhookAuthHeader',
    'jiraWebhookUrl',
    'serviceNowWebhookUrl',
    'siemWebhookUrl',
    'dataRegion',
    'dataResidency',
    'slaUptimeTarget',
  ]) {
    if (typeof patch[key] === 'string') {
      out[key] = patch[key].trim().slice(0, 500)
    }
  }
  if (typeof patch.enforceSso === 'boolean') {
    out.enforceSso = patch.enforceSso
  }
  if (typeof patch.siemExportEnabled === 'boolean') {
    out.siemExportEnabled = patch.siemExportEnabled
  }
  if (typeof patch.slaRpoHours === 'number' && Number.isFinite(patch.slaRpoHours)) {
    out.slaRpoHours = Math.min(168, Math.max(1, Math.round(patch.slaRpoHours)))
  }
  if (typeof patch.slaRtoHours === 'number' && Number.isFinite(patch.slaRtoHours)) {
    out.slaRtoHours = Math.min(168, Math.max(1, Math.round(patch.slaRtoHours)))
  }
  if (typeof patch.githubAllowedBranches === 'string') {
    out.githubAllowedBranches = patch.githubAllowedBranches
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40)
      .join(', ')
      .slice(0, 500) || 'main'
  }
  if (typeof patch.githubPrMinRole === 'string') {
    const role = patch.githubPrMinRole.trim().toLowerCase()
    if (['member', 'admin', 'owner'].includes(role)) {
      out.githubPrMinRole = role
    }
  }
  for (const key of ['joinProposeMinRole', 'joinPromoteMinRole']) {
    if (typeof patch[key] === 'string') {
      const role = patch[key].trim().toLowerCase()
      if (['member', 'admin', 'owner'].includes(role)) {
        out[key] = role
      }
    }
  }
  if (typeof patch.joinReviewNotifyEnabled === 'boolean') {
    out.joinReviewNotifyEnabled = patch.joinReviewNotifyEnabled
  }
  if (typeof patch.joinPromoteNotify === 'boolean') {
    out.joinPromoteNotify = patch.joinPromoteNotify
  }
  if (typeof patch.driftDigestEnabled === 'boolean') {
    out.driftDigestEnabled = patch.driftDigestEnabled
  }
  if (typeof patch.joinReviewWebhookUrl === 'string') {
    out.joinReviewWebhookUrl = patch.joinReviewWebhookUrl.trim().slice(0, 500)
  }
  if (typeof patch.slackNotifyChannel === 'string') {
    out.slackNotifyChannel = patch.slackNotifyChannel.trim().slice(0, 80)
  }
  if (typeof patch.driftDigestWebhookUrl === 'string') {
    out.driftDigestWebhookUrl = patch.driftDigestWebhookUrl.trim().slice(0, 500)
  }
  if (typeof patch.emitContractEvents === 'boolean') {
    out.emitContractEvents = patch.emitContractEvents
  }
  if (typeof patch.contractWebhookUrl === 'string') {
    out.contractWebhookUrl = patch.contractWebhookUrl.trim().slice(0, 500)
  }
  if (typeof patch.driftAlertsEnabled === 'boolean') {
    out.driftAlertsEnabled = patch.driftAlertsEnabled
  }
  if (typeof patch.driftAlertOnHigh === 'boolean') {
    out.driftAlertOnHigh = patch.driftAlertOnHigh
  }
  if (typeof patch.driftAlertWebhookUrl === 'string') {
    out.driftAlertWebhookUrl = patch.driftAlertWebhookUrl.trim().slice(0, 500)
  }
  if (typeof patch.driftAlertEmails === 'string') {
    out.driftAlertEmails = patch.driftAlertEmails.trim().slice(0, 500)
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
  if (typeof patch.postSyncWebhookUrl === 'string') {
    out.postSyncWebhookUrl = patch.postSyncWebhookUrl.trim().slice(0, 500)
  }
  if (typeof patch.postSyncQueueMonk === 'boolean') {
    out.postSyncQueueMonk = patch.postSyncQueueMonk
  }
  if (typeof patch.postSyncMonkPackId === 'string') {
    out.postSyncMonkPackId = patch.postSyncMonkPackId.trim().slice(0, 80)
  }
  if (typeof patch.ceoChatCertifiedOnly === 'boolean') {
    out.ceoChatCertifiedOnly = patch.ceoChatCertifiedOnly
  }
  return out
}

/** Merge arbitrary settings keys (internal — post-sync banner, etc.). */
export async function patchWorkspaceSettingsJson(workspaceId, partial = {}) {
  const { rows } = await query(
    `SELECT settings_json FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (!rows.length) return null
  const merged = {
    ...mergeSettings(rows[0].settings_json),
    ...(partial && typeof partial === 'object' ? partial : {}),
  }
  await query(
    `UPDATE workspaces SET settings_json = $2::jsonb WHERE id = $1`,
    [workspaceId, JSON.stringify(merged)],
  )
  return merged
}
