import express from 'express'
import cors from 'cors'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { buildSchemaContextPack } from './schemaContext.js'
import { answerChat } from './chatEngine.js'
import {
  createJob,
  createStitchJobFromTables,
  exportJob,
  getJob,
  listJobs,
  updateJob,
} from './jobs.js'
import { getJobRun, listJobRuns, listWorkspaceJobRuns, runJob } from './jobRunner.js'
import {
  createConnection,
  deleteConnection,
  getConnection,
  listConnections,
  updateConnection,
} from './connections.js'
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from './workspaceSettings.js'
import { reindexAll, reindexWorkspace } from './ai/indexer.js'
import { saveFeedback } from './ai/feedback.js'
import {
  getAiChunkStats,
  vectorExtensionReady,
} from './ai/vectorStore.js'
import { embeddingMode } from './ai/embeddings.js'
import { listAvailableModels } from './ai/models.js'
import {
  acknowledgeDrift,
  getOpenHighDrift,
  listRecentDrift,
  getJobContractStatus,
} from './contracts/contractFreeze.js'
import { listOutbox } from './adapters/contractEvents.js'
import { inferJoinsForWorkspace } from './inferJoins.js'
import { runStitchSession } from './stitchSession.js'
import {
  attachUploadedFiles,
  createSpreadsheetFromUploads,
  parseUploadOptions,
  spreadsheetMemoryUploadMiddleware,
  spreadsheetUploadMiddleware,
} from './uploads.js'
import { getSecretsStatus, setSecret } from './secrets.js'
import {
  authDisabled,
  createWorkspace,
  ensureDevUserPassword,
  getSsoConfig,
  listWorkspacesForUser,
  listUserSessions,
  login,
  logout,
  optionalAuth,
  register,
  requireAuth,
  requireMinRole,
  requireWorkspaceMember,
  revokeOtherUserSessions,
  revokeUserSession,
  ROLE_RANK,
} from './auth.js'
import {
  listDomains,
  getDomain,
  createDomain,
  updateDomain,
  deleteDomain,
} from './domains.js'
import {
  listJobTemplates,
  createJobTemplate,
  deleteJobTemplate,
  applyJobTemplate,
} from './jobTemplates.js'
import {
  notifyJoinReviewPending,
  notifyJoinPromoted,
  sendDriftDigest,
  roleMeetsMin,
} from './teamNotify.js'
import {
  buildAuthorizeRedirectUrl,
  buildSsoErrorRedirect,
  completeOidcCallback,
} from './oidc.js'
import { requestLogMiddleware } from './logger.js'
import { rateLimitMiddleware } from './rateLimit.js'
import {
  createAgentSession,
  listAgentSessions,
  getAgentSession,
  advanceAgentCheckpoint,
  continueAgentAfterPromote,
  listJoinMemory,
} from './agentSessions.js'
import {
  generateValidationSuite,
  runValidationSuite,
  getValidationSuite,
} from './validationSuite.js'
import {
  listDriftFixSuggestions,
  proposeDriftFixes,
  resolveDriftFix,
} from './driftAgent.js'
import {
  applyJoinActionFromToken,
  handleSlackInteractionPayload,
} from './joinActionWebhook.js'
import { maybeAutoPromoteLowRisk, recordGoldenEvalScore } from './autoPromote.js'
import {
  listOutcomes,
  getOutcome,
  createOutcome,
  refreshOutcome,
  patchOutcomeStatus,
  runOutcomeStep,
  advanceOutcomeAgent,
} from './outcomes.js'
import {
  listShipEvents,
  getShipEvent,
  createShipDraft,
  approveShip,
  rollbackShip,
  linkShipMaterialization,
} from './shipToBi.js'
import {
  listGlossaryTerms,
  createGlossaryTerm,
  updateGlossaryTerm,
  deleteGlossaryTerm,
  listTermLinks,
  linkTermToColumn,
} from './glossary.js'
import {
  listCatalogAssets,
  createCatalogAsset,
  updateCatalogAsset,
  deleteCatalogAsset,
  listAssetDeps,
} from './catalogAssets.js'
import {
  listCertifications,
  certifyTarget,
  expireCertification,
  getStewardQueue,
} from './stewardship.js'
import { getColumnLineage } from './columnLineage.js'
import {
  listPolicyPacks,
  createPolicyPack,
  updatePolicyPack,
  deletePolicyPack,
  ensureDefaultPolicyPacks,
  applyPiiPolicyPack,
} from './policyPacks.js'
import {
  listGovernanceTickets,
  createGovernanceTicket,
} from './ticketIntegrations.js'
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from './apiKeys.js'
import {
  createScimToken,
  listScimTokens,
  revokeScimToken,
  resolveScimToken,
  scimListUsers,
  scimGetUser,
  scimCreateUser,
  scimPatchUser,
  scimDeleteUser,
} from './scim.js'
import {
  getCmkStatus,
  enableCmk,
  disableCmk,
  rotateCmk,
} from './cmk.js'
import {
  listAbacPolicies,
  createAbacPolicy,
  deleteAbacPolicy,
} from './abac.js'
import {
  listBreakGlass,
  openBreakGlass,
  closeBreakGlass,
} from './breakGlass.js'
import {
  getSiemConfig,
  updateSiemConfig,
  exportSiemEvents,
  pushSiemWebhook,
} from './siemExport.js'
import { buildSoc2EvidencePack } from './soc2Evidence.js'
import {
  runTenantIsolationTests,
  listIsolationRuns,
} from './tenantIsolation.js'
import {
  evaluateGoldenSet,
  formatGoldenSetMarkdown,
} from './goldenSetEval.js'
import { ingestBiLineage, listLatestBiLineage } from './exporters/biLineage.js'
import { ingestDbtManifest } from './exporters/dbtManifestAssist.js'
import {
  attestationFingerprint,
  verifyAttestationSignature,
} from './exporters/attestation.js'
import {
  listExportAttestations,
  getExportAttestation,
  buildAttestationVerifyPack,
} from './exporters/exportAudit.js'
import {
  mintJobArtifact,
  listExportArtifacts,
  revokeExportArtifact,
  downloadExportArtifactByToken,
  createExportArtifact,
} from './exporters/artifacts.js'
import { assertProductionSecrets, corsOrigins } from './env.js'
import { createInvite, listInvites, revokeInvite } from './invites.js'
import {
  listMembers,
  getMembershipSummary,
  removeMember,
  updateMemberRole,
} from './members.js'
import { listAuditEvents, recordAuditEvent } from './auditLog.js'
import { getWorkspaceUsage } from './usage.js'
import { notifyDriftAlert, createDriftEventAndAlert } from './driftAlerts.js'
import { listJoinReviews } from './joinReviews.js'
import {
  editRelationshipColumns,
  listTableColumns,
  createManualRelationship,
} from './relationshipEdit.js'
import {
  pinTableSamples,
  listPinnedSamples,
  getPinnedSample,
  ensurePinnedSamplesForConnection,
} from './pinnedSamples.js'
import {
  listManagedDatasets,
  getManagedDataset,
  readManagedDatasetRows,
  certifyManagedDataset,
  deleteManagedDataset,
  upsertManagedDatasetFromJob,
  isManagedPlaneEnabled,
  getManagedPlaneQuotas,
  purgeExpiredManagedDatasets,
  landManagedDatasetFromJobRun,
} from './managedDataPlane.js'
import { collectOpsSnapshot, formatPrometheus } from './opsMetrics.js'
import {
  listWorkspaceRules,
  createWorkspaceRule,
  updateWorkspaceRule,
  deleteWorkspaceRule,
  learnRuleFromPromote,
} from './workspaceRules.js'
import { listJoinComments, addJoinComment } from './joinComments.js'
import {
  listTransformDrafts,
  getTransformDraft,
  createTransformDraft,
  reviewTransformDraft,
} from './transformDrafts.js'
import {
  listProposalDiffs,
  reviewProposalDiff,
  createJoinProposalDiff,
} from './proposalDiffs.js'
import {
  listMetrics,
  getMetric,
  createMetric,
  updateMetric,
  previewMetric,
  publishMetricToBi,
  getMetricLineage,
} from './metricDefinitions.js'
import {
  getEvalDashboard,
  runGoldenEvalForDashboard,
} from './evalDashboard.js'
import {
  runAndStoreContractTests,
  listContractTestRuns,
} from './contractTests.js'
import {
  listIndustryTemplatePacks,
  getIndustryTemplatePack,
  listMarketplaceCatalog,
  applyIndustryTemplatePack,
  listPackInstalls,
} from './industryTemplates.js'
import { buildNotebookFromFields } from './jobNotebook.js'
import { reportExternalJobStatus } from './jobStatusBridge.js'
import {
  listBiCharts,
  getBiChart,
  createBiChart,
  updateBiChart,
  deleteBiChart,
  previewBiChart,
  mintBiEmbedToken,
  revokeBiEmbedToken,
  resolveBiEmbed,
} from './certifiedBi.js'
import {
  getWorkspaceSyncScheduleStatus,
  runScheduledSyncTick,
  startScheduledSyncLoop,
} from './scheduledSync.js'
import {
  getWorkspaceJobScheduleStatus,
  runScheduledJobsTick,
  startScheduledJobsLoop,
} from './scheduledJobs.js'
import {
  getOrchestratorConfig,
  updateOrchestratorConfig,
  triggerOrchestrator,
  testOrchestratorPing,
} from './orchestratorTrigger.js'
import {
  runMappingAssist,
  listRenameSuggestions,
  reviewRenameSuggestion,
} from './mappingAssist.js'
import {
  getPrivateRunnerConfig,
  updatePrivateRunnerConfig,
  enqueuePrivateRunnerJob,
  handleRunnerCallback,
} from './privateRunner.js'
import {
  getBillingStatus,
  createCheckoutSession,
  createBillingPortalSession,
} from './billing.js'
import {
  materializeJob,
  listMaterializations,
  dropMaterialization,
} from './materialize.js'
import { getWorkspaceLineageLite } from './lineageLite.js'
import {
  buildWarehouseRunDigest,
  listWarehouseDigests,
  ingestExternalWarehouseDigest,
} from './warehouseRunDigest.js'
import {
  createMetadataBackup,
  listBackups,
  getBackup,
  runDrDrill,
  listDrDrills,
  getSaasOpsSummary,
} from './saasOps.js'
import {
  getGoldenEvalSchedule,
  upsertGoldenEvalSchedule,
  runGoldenEvalNow,
  startGoldenEvalLoop,
} from './scheduledGoldenEval.js'
import {
  syncWithRetries,
  getConnectorReliabilityStatus,
  updateConnectionRetryPolicy,
} from './connectorReliability.js'
import {
  heartbeatPresence,
  listPresence,
} from './workspacePresence.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Load api/.env without adding a dotenv dependency */
function loadEnv() {
  const envPath = resolve(__dirname, '../.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i < 0) continue
    const key = trimmed.slice(0, i).trim()
    const val = trimmed.slice(i + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

try {
  assertProductionSecrets()
} catch (err) {
  console.error(err.message || err)
  process.exit(1)
}

const app = express()
const PORT = Number(process.env.PORT || 8787)
const DEMO_WS =
  process.env.DEMO_WORKSPACE_ID || '22222222-2222-2222-2222-222222222222'

const allowedOrigins = corsOrigins()
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
  }),
)
/** Stripe webhook needs raw body — register before json parser */
app.post(
  '/billing/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const { handleStripeWebhook } = await import('./billing.js')
      const raw =
        Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body || {})
      const out = await handleStripeWebhook(
        raw,
        req.headers['stripe-signature'],
      )
      res.json(out)
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Slack interactive — raw body required for signing secret verify */
app.post(
  '/webhooks/slack/interactions',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    try {
      const { verifySlackSignature } = await import('./slackSigning.js')
      const raw = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : String(req.body || '')
      const requireSecret =
        String(process.env.NODE_ENV || '').toLowerCase() === 'production' ||
        String(process.env.QUE_ENV || '').toLowerCase() === 'production'
      const verified = verifySlackSignature(raw, req.headers, {
        requireSecret: requireSecret && Boolean(process.env.SLACK_SIGNING_SECRET),
      })
      if (!verified.ok) {
        res.status(401).json({ error: verified.reason || 'unauthorized' })
        return
      }
      const params = new URLSearchParams(raw)
      const out = await handleSlackInteractionPayload(params.get('payload'))
      if (out.slackResponse) {
        res.json(out.slackResponse)
        return
      }
      res.json({
        response_type: 'ephemeral',
        text: out.message || `Que: ${out.action} · ${out.status}`,
      })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.use(express.json({ limit: '4mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestLogMiddleware)
app.use(rateLimitMiddleware({ windowMs: 60_000, max: 180 }))

app.get('/health', async (_req, res) => {
  try {
    const snap = await collectOpsSnapshot()
    if (!snap.ok) {
      res.status(503).json(snap)
      return
    }
    res.json(snap)
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err.message || err) })
  }
})

/** Ops monitoring — JSON or Prometheus text (?format=prom) */
app.get('/metrics', async (req, res) => {
  try {
    const snap = await collectOpsSnapshot()
    if (String(req.query.format || '').toLowerCase() === 'prom') {
      res.type('text/plain; version=0.0.4').send(formatPrometheus(snap))
      return
    }
    res.json({ ok: true, ...snap })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) })
  }
})

app.get('/openapi.json', (_req, res) => {
  try {
    const path = resolve(__dirname, '../openapi.json')
    res.type('application/json').send(readFileSync(path, 'utf8'))
  } catch (err) {
    res.status(404).json({ error: 'openapi.json missing', detail: String(err.message || err) })
  }
})

/** Auth */
app.post('/auth/register', async (req, res) => {
  try {
    const result = await register(req.body ?? {})
    res.status(201).json({ ok: true, ...result })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post('/auth/login', async (req, res) => {
  try {
    const result = await login(req.body?.email, req.body?.password)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.get('/auth/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await listUserSessions(req.user.id, req.authToken)
    res.json({ ok: true, sessions })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.delete('/auth/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const ok = await revokeUserSession(req.user.id, req.params.sessionId)
    if (!ok) return res.status(404).json({ error: 'Session not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post('/auth/sessions/revoke-others', requireAuth, async (req, res) => {
  try {
    const out = await revokeOtherUserSessions(req.user.id, req.authToken)
    res.json({ ok: true, ...out })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post('/auth/logout', optionalAuth, async (req, res) => {
  try {
    await logout(req.authToken)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const workspaces = await listWorkspacesForUser(req.user.id)
    res.json({ ok: true, user: req.user, workspaces })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** SSO readiness */
app.get('/auth/sso', (_req, res) => {
  res.json({ ok: true, sso: getSsoConfig() })
})

/** Start OIDC authorize (browser redirect) */
app.get('/auth/sso/start', async (_req, res) => {
  try {
    const url = await buildAuthorizeRedirectUrl()
    res.redirect(302, url)
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

/** OIDC callback — exchange code, set session, redirect SPA with #token= or #error= */
app.get('/auth/sso/callback', async (req, res) => {
  try {
    if (req.query.error) {
      const detail = [
        req.query.error,
        req.query.error_description,
      ]
        .filter(Boolean)
        .join(': ')
      res.redirect(302, buildSsoErrorRedirect(detail || 'SSO denied by IdP'))
      return
    }
    const result = await completeOidcCallback({
      code: req.query.code,
      state: req.query.state,
    })
    res.redirect(302, result.redirectUrl)
  } catch (err) {
    res.redirect(302, buildSsoErrorRedirect(err.message || err))
  }
})

app.post('/auth/attestation/verify', express.json(), (req, res) => {
  const attestation = req.body?.attestation || req.body
  const result = verifyAttestationSignature(attestation)
  let fingerprint = null
  try {
    fingerprint = attestationFingerprint(attestation)
  } catch {
    fingerprint = null
  }
  res.json({
    ok: result.ok,
    reason: result.reason || null,
    fingerprint,
    policy: attestation?.policy || null,
    alg: attestation?.signature?.alg || null,
  })
})

/**
 * CEO P1 — Slack/Teams Approve·Reject via signed link (no session).
 * Button URLs hit GET; optional POST { token }.
 */
app.get('/webhooks/join-action', async (req, res) => {
  try {
    const out = await applyJoinActionFromToken(req.query.token, {
      actorLabel: 'chat_link',
    })
    const appUrl =
      process.env.QUE_APP_URL ||
      process.env.QUE_PUBLIC_URL ||
      'http://localhost:5174'
    const wantsHtml = String(req.headers.accept || '').includes('text/html')
    if (wantsHtml) {
      res
        .status(200)
        .type('html')
        .send(
          `<!doctype html><html><body style="font-family:system-ui;padding:2rem;background:#031427;color:#e8f4ff">
          <h1>Que · ${out.action}</h1>
          <p>${out.message}${out.join ? ` · <code>${out.join}</code>` : ''}</p>
          <p><a href="${String(appUrl).replace(/\/$/, '')}/joins" style="color:#7bd0ff">Open Join Review</a></p>
          </body></html>`,
        )
      return
    }
    res.json(out)
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post('/webhooks/join-action', async (req, res) => {
  try {
    const token = req.body?.token || req.query.token
    const out = await applyJoinActionFromToken(token, {
      actorLabel: req.body?.actor || 'webhook',
    })
    res.json(out)
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

/**
 * Wave 3.3 — public signed artifact download (token in path; no session).
 */
app.get('/artifacts/download/:token', async (req, res) => {
  try {
    const file = await downloadExportArtifactByToken(req.params.token)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    )
    res.setHeader('X-Que-Content-SHA256', file.contentSha256)
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      brand: 'Que',
      policy: 'schema-only-artifact',
      contentSha256: file.contentSha256,
      artifact: {
        id: file.artifact.id,
        format: file.artifact.format,
        filename: file.filename,
        expiresAt: file.artifact.expiresAt,
        jobId: file.artifact.jobId,
        jobTitle: file.artifact.jobTitle,
      },
      export: file.payload,
    })
  } catch (err) {
    res.status(err.status || 500).json({
      error: String(err.message || err),
      code: err.code || null,
    })
  }
})

app.get('/workspaces', requireAuth, async (req, res) => {
  try {
    const workspaces = await listWorkspacesForUser(req.user.id)
    res.json({ workspaces })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post('/workspaces', requireAuth, async (req, res) => {
  try {
    const workspace = await createWorkspace(req.user.id, {
      name: req.body?.name,
      slug: req.body?.slug,
    })
    res.status(201).json({ ok: true, workspace })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

/** Workspace ACL — all /workspaces/:workspaceId/* routes */
app.use('/workspaces/:workspaceId', requireAuth, requireWorkspaceMember)

/** Connections → FE DataSource[] (+ config for Sources page) */
app.get('/workspaces/:workspaceId/sources', async (req, res) => {
  try {
    const sources = await listConnections(req.params.workspaceId)
    res.json({ sources })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.get(
  '/workspaces/:workspaceId/connections/:connectionId',
  async (req, res) => {
    try {
      const connection = await getConnection(
        req.params.workspaceId,
        req.params.connectionId,
      )
      if (!connection) {
        res.status(404).json({ error: 'connection not found' })
        return
      }
      res.json({ connection })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/connections',
  requireMinRole('admin'),
  async (req, res) => {
  try {
    const connection = await createConnection(
      req.params.workspaceId,
      req.body ?? {},
    )
    void recordAuditEvent({
      workspaceId: req.params.workspaceId,
      actorUserId: req.user?.id,
      action: 'connection.create',
      resourceType: 'connection',
      resourceId: connection.id,
      summary: `Created connection ${connection.name} (${connection.type})`,
      meta: { type: connection.type, name: connection.name },
    })
    res.status(201).json({ ok: true, connection })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

/**
 * Upload Excel/CSV onto an existing connection → update config.files → sync schema.
 * multipart field: files (one or more). Optional: tableNames, sheets, sync, replace.
 */
app.post(
  '/workspaces/:workspaceId/connections/:connectionId/upload',
  requireMinRole('member'),
  (req, res, next) => {
    spreadsheetUploadMiddleware()(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: String(err.message || err) })
        return
      }
      next()
    })
  },
  async (req, res) => {
    try {
      const opts = parseUploadOptions(req)
      const result = await attachUploadedFiles(
        req.params.workspaceId,
        req.params.connectionId,
        req.files || [],
        opts,
      )
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/**
 * Create excel/csv source from upload in one shot (analyze schema into workspace).
 * multipart: files + name + type (excel|csv) + optional description, tableNames, sheets
 */
app.post(
  '/workspaces/:workspaceId/uploads/spreadsheet',
  requireMinRole('admin'),
  (req, res, next) => {
    spreadsheetMemoryUploadMiddleware()(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: String(err.message || err) })
        return
      }
      next()
    })
  },
  async (req, res) => {
    try {
      const result = await createSpreadsheetFromUploads(
        req.params.workspaceId,
        req.body ?? {},
        req.files || [],
      )
      res.status(201).json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/connections/:connectionId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const connection = await updateConnection(
        req.params.workspaceId,
        req.params.connectionId,
        req.body ?? {},
      )
      if (!connection) {
        res.status(404).json({ error: 'connection not found' })
        return
      }
      res.json({ ok: true, connection })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/connections/:connectionId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const ok = await deleteConnection(
        req.params.workspaceId,
        req.params.connectionId,
      )
      if (!ok) {
        res.status(404).json({ error: 'connection not found' })
        return
      }
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'connection.delete',
        resourceType: 'connection',
        resourceId: req.params.connectionId,
        summary: 'Deleted connection',
      })
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/**
 * Full stitch graph → FE { tables: SchemaTable[], relationships: SchemaRelationship[] }
 */
app.get('/workspaces/:workspaceId/schema', async (req, res) => {
  const workspaceId = req.params.workspaceId
  try {
    const [objects, columns, rels, layout] = await Promise.all([
      query(
        `SELECT o.id, o.name, o.entity_kind, o.source_label, o.description,
                o.connection_id, c.source_type, c.name AS connection_name
         FROM schema_objects o
         JOIN connections c ON c.id = o.connection_id
         WHERE o.workspace_id = $1
         ORDER BY o.name`,
        [workspaceId],
      ),
      query(
        `SELECT id, schema_object_id, name, data_type, key_kind, is_nullable,
                description, sample_values, references_label, ordinal
         FROM schema_columns
         WHERE workspace_id = $1
         ORDER BY schema_object_id, ordinal`,
        [workspaceId],
      ),
      query(
        `SELECT id, from_object_id, from_column_id, to_object_id, to_column_id,
                relation_type, status, confidence, join_criteria, label, ai_notes,
                evidence_json
         FROM relationships
         WHERE workspace_id = $1
           AND status <> 'rejected'`,
        [workspaceId],
      ),
      query(
        `SELECT positions FROM diagram_layouts WHERE workspace_id = $1`,
        [workspaceId],
      ),
    ])

    const positions = layout.rows[0]?.positions ?? {}
    const colsByObject = new Map()
    for (const col of columns.rows) {
      const list = colsByObject.get(col.schema_object_id) ?? []
      list.push({
        id: col.id,
        name: col.name,
        dataType: col.data_type,
        keyKind: col.key_kind === 'none' ? undefined : col.key_kind,
        nullable: col.is_nullable,
        description: col.description ?? undefined,
        sampleValues: Array.isArray(col.sample_values)
          ? col.sample_values
          : [],
        references: col.references_label ?? undefined,
      })
      colsByObject.set(col.schema_object_id, list)
    }

    const tables = objects.rows.map((o) => {
      const pos = positions[o.id] ?? { x: 80, y: 80 }
      return {
        id: o.id,
        name: o.name,
        sourceId: o.connection_id,
        sourceType: o.source_type,
        sourceLabel: o.source_label || String(o.source_type).toUpperCase(),
        entityKind: o.entity_kind,
        position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
        columns: colsByObject.get(o.id) ?? [],
        defaultExpanded: true,
      }
    })

    const { evidenceHasSampleMatch } = await import('./inferJoins.js')
    const relationships = rels.rows
      .filter((r) => {
        // Hide AI suggestions that never proved sample overlap (legacy + noise)
        if (r.relation_type === 'ai-inferred' && r.status === 'suggested') {
          return evidenceHasSampleMatch(r.evidence_json)
        }
        return true
      })
      .map((r) => ({
      id: r.id,
      fromTableId: r.from_object_id,
      fromColumnId: r.from_column_id,
      toTableId: r.to_object_id,
      toColumnId: r.to_column_id,
      type: r.relation_type,
      kind: r.relation_type === 'ai-inferred' ? 'inferred' : 'fk',
      status: r.status,
      confidence: Number(r.confidence),
      fromId: r.from_column_id,
      toId: r.to_column_id,
      joinCriteria: r.join_criteria ?? undefined,
      label: r.label ?? undefined,
      aiNotes: r.ai_notes ?? undefined,
      evidence: r.evidence_json && typeof r.evidence_json === 'object'
        ? r.evidence_json
        : undefined,
    }))

    res.json({
      workspaceId,
      tables,
      relationships,
    })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/**
 * Wave 2.1 — Join review inbox (suggested joins + evidence).
 * Query: ?status=suggested|accepted|rejected|all&limit=
 */
app.get('/workspaces/:workspaceId/join-reviews', async (req, res) => {
  try {
    const result = await listJoinReviews(req.params.workspaceId, {
      status: req.query.status,
      limit: req.query.limit,
    })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/**
 * Create a join from Workspace Edit mode (drag column → column).
 * Body: { fromColumnId, toColumnId }
 */
app.post(
  '/workspaces/:workspaceId/relationships',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const relationship = await createManualRelationship(
        req.params.workspaceId,
        {
          fromColumnId: req.body?.fromColumnId,
          toColumnId: req.body?.toColumnId,
          userId: req.user?.id ?? null,
          confirmIncorrect: req.body?.confirmIncorrect === true,
        },
      )
      res.status(201).json({ ok: true, relationship })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || undefined,
        assessment: err.assessment || undefined,
        relationshipId: err.relationshipId || undefined,
      })
    }
  },
)

/**
 * Promote, reject, or edit join columns on a Stitch Relation.
 * Body: { action: 'promote' | 'reject' | 'edit', fromColumnId?, toColumnId? }
 */
app.patch(
  '/workspaces/:workspaceId/relationships/:relationshipId',
  requireMinRole('member'),
  async (req, res) => {
    const { workspaceId, relationshipId } = req.params
    const action = req.body?.action
    if (action !== 'promote' && action !== 'reject' && action !== 'edit') {
      res.status(400).json({
        error: "body.action must be 'promote', 'reject', or 'edit'",
      })
      return
    }
    try {
      if (action === 'edit') {
        const relationship = await editRelationshipColumns(
          workspaceId,
          relationshipId,
          {
            fromColumnId: req.body?.fromColumnId,
            toColumnId: req.body?.toColumnId,
            userId: req.user?.id ?? null,
            confirmIncorrect: req.body?.confirmIncorrect === true,
          },
        )
        res.json({ ok: true, relationship })
        return
      }
      if (action === 'promote') {
        const settings = (await getWorkspaceSettings(workspaceId))?.settings
        const { rows: riskRows } = await query(
          `SELECT r.confidence, r.evidence_json,
                  c_from.name AS from_c, c_to.name AS to_c
           FROM relationships r
           JOIN schema_objects fo ON fo.id = r.from_object_id
           JOIN schema_objects tto ON tto.id = r.to_object_id
           JOIN connections c_from ON c_from.id = fo.connection_id
           JOIN connections c_to ON c_to.id = tto.connection_id
           WHERE r.id = $1 AND r.workspace_id = $2`,
          [relationshipId, workspaceId],
        )
        const rr = riskRows[0]
        const { classifyRiskTier, effectiveTier, riskContextForWorkspace } =
          await import('./riskTiers.js')
        const riskCtx = await riskContextForWorkspace(workspaceId)
        const classified = classifyRiskTier(
          rr?.evidence_json,
          rr?.confidence,
          {
            crossSource: rr ? rr.from_c !== rr.to_c : false,
            lastGoldenRecall: riskCtx.lastGoldenRecall,
            autoPromoteMinRecall: riskCtx.autoPromoteMinRecall,
          },
        )
        const tier = effectiveTier(classified)
        const minRole =
          tier === 'red'
            ? settings?.redPromoteMinRole || 'admin'
            : tier === 'yellow'
              ? settings?.yellowPromoteMinRole ||
                settings?.joinPromoteMinRole ||
                'member'
              : settings?.joinPromoteMinRole || 'member'
        if (
          !authDisabled() &&
          !roleMeetsMin(req.workspaceRole, minRole, ROLE_RANK)
        ) {
          res.status(403).json({
            error: `forbidden — ${tier} tier promote requires ${minRole}+ (Settings → AI & Policy)`,
            riskTier: tier,
            rationale: classified.rationale,
          })
          return
        }
      }
      const { rows: beforeRows } = await query(
        `SELECT id, status, relation_type, confidence, evidence_json
         FROM relationships WHERE id = $1 AND workspace_id = $2`,
        [relationshipId, workspaceId],
      )
      if (beforeRows.length === 0) {
        res.status(404).json({ error: 'relationship not found' })
        return
      }
      const before = beforeRows[0]
      const nextStatus = action === 'promote' ? 'accepted' : 'rejected'
      const nextType = action === 'promote' ? 'explicit' : undefined
      const nextConfidence = action === 'promote' ? 1 : before.confidence
      const prevEvidence =
        before.evidence_json && typeof before.evidence_json === 'object'
          ? before.evidence_json
          : {}
      const nextEvidence =
        action === 'promote'
          ? {
              ...prevEvidence,
              prePromoteConfidence: Number(before.confidence),
              promotedAt: new Date().toISOString(),
            }
          : prevEvidence

      const { rows } = await query(
        `UPDATE relationships SET
           status = $3,
           relation_type = COALESCE($4, relation_type),
           confidence = $5,
           evidence_json = $6::jsonb,
           updated_at = now()
         WHERE id = $1 AND workspace_id = $2
         RETURNING id, status, relation_type, confidence, join_criteria, label, ai_notes,
                   from_object_id, from_column_id, to_object_id, to_column_id, evidence_json`,
        [
          relationshipId,
          workspaceId,
          nextStatus,
          nextType ?? null,
          nextConfidence,
          JSON.stringify(nextEvidence || {}),
        ],
      )

      try {
        await query(
          `INSERT INTO relationship_review_events (
             workspace_id, relationship_id, action, actor_user_id,
             previous_status, previous_type, previous_confidence, evidence_json
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            workspaceId,
            relationshipId,
            action,
            req.user?.id ?? null,
            before.status,
            before.relation_type,
            before.confidence,
            JSON.stringify(before.evidence_json || {}),
          ],
        )
      } catch (auditErr) {
        console.warn(
          '[Que] relationship_review_events insert skipped:',
          auditErr.message || auditErr,
        )
      }

      void recordAuditEvent({
        workspaceId,
        actorUserId: req.user?.id,
        action:
          action === 'promote' ? 'relationship.promote' : 'relationship.reject',
        resourceType: 'relationship',
        resourceId: relationshipId,
        summary:
          action === 'promote'
            ? 'Promoted suggested join to accepted'
            : 'Rejected suggested join',
        meta: { previousStatus: before.status, nextStatus },
      })

      void reindexWorkspace(workspaceId).catch((err) =>
        console.warn('[Que] reindex after promote/reject:', err.message || err),
      )
      if (action === 'promote') {
        void notifyJoinPromoted(workspaceId, {
          summary: `Join ${relationshipId} promoted`,
          relationshipId,
        })
        // join memory (best-effort)
        try {
          const { rememberPromotedJoin } = await import('./agentSessions.js')
          const { rows: names } = await query(
            `SELECT fo.name AS from_table, fc.name AS from_column,
                    tto.name AS to_table, tc.name AS to_column
             FROM relationships r
             JOIN schema_objects fo ON fo.id = r.from_object_id
             JOIN schema_columns fc ON fc.id = r.from_column_id
             JOIN schema_objects tto ON tto.id = r.to_object_id
             JOIN schema_columns tc ON tc.id = r.to_column_id
             WHERE r.id = $1`,
            [relationshipId],
          )
          if (names[0]) {
            await rememberPromotedJoin(workspaceId, req.user?.id, {
              fromTable: names[0].from_table,
              fromColumn: names[0].from_column,
              toTable: names[0].to_table,
              toColumn: names[0].to_column,
              relationshipId,
            })
            await learnRuleFromPromote(workspaceId, {
              fromTable: names[0].from_table,
              fromColumn: names[0].from_column,
              toTable: names[0].to_table,
              toColumn: names[0].to_column,
              userId: req.user?.id ?? null,
            }).catch(() => null)
            await createJoinProposalDiff(workspaceId, {
              relationshipId,
              title: `${names[0].from_table}.${names[0].from_column} → ${names[0].to_table}.${names[0].to_column}`,
              summary: 'Promoted join (accepted)',
              before: { status: before.status },
              after: { status: 'accepted', confidence: 1 },
              userId: req.user?.id ?? null,
            }).catch(() => null)
          }
        } catch {
          /* optional */
        }
      }
      const r = rows[0]
      res.json({
        ok: true,
        relationship: {
          id: r.id,
          fromTableId: r.from_object_id,
          fromColumnId: r.from_column_id,
          toTableId: r.to_object_id,
          toColumnId: r.to_column_id,
          type: r.relation_type,
          kind: r.relation_type === 'ai-inferred' ? 'inferred' : 'fk',
          status: r.status,
          confidence: Number(r.confidence),
          fromId: r.from_column_id,
          toId: r.to_column_id,
          joinCriteria: r.join_criteria ?? undefined,
          label: r.label ?? undefined,
          aiNotes: r.ai_notes ?? undefined,
          evidence:
            r.evidence_json && typeof r.evidence_json === 'object'
              ? r.evidence_json
              : undefined,
        },
      })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || undefined,
        assessment: err.assessment || undefined,
      })
    }
  },
)

/**
 * Re-run cross-source join inference without a full introspect sync.
 * Body: { connectionId?: string }
 */
app.post(
  '/workspaces/:workspaceId/join-inference',
  requireMinRole('member'),
  async (req, res) => {
    const { workspaceId } = req.params
    const connectionId =
      typeof req.body?.connectionId === 'string' && req.body.connectionId
        ? req.body.connectionId
        : null
    try {
      const settings = (await getWorkspaceSettings(workspaceId))?.settings
      const minPropose = settings?.joinProposeMinRole || 'member'
      if (
        !authDisabled() &&
        !roleMeetsMin(req.workspaceRole, minPropose, ROLE_RANK)
      ) {
        res.status(403).json({
          error: `forbidden — propose/infer requires ${minPropose}+`,
        })
        return
      }
      if (connectionId) {
        const conn = await getConnection(workspaceId, connectionId)
        if (!conn) {
          res.status(404).json({ error: 'connection not found' })
          return
        }
      }
      const result = await inferJoinsForWorkspace(workspaceId, { connectionId })
      void reindexWorkspace(workspaceId).catch((err) =>
        console.warn('[Que] reindex after join-inference:', err.message || err),
      )
      if ((result.created || 0) > 0) {
        let joins = []
        try {
          const inbox = await listJoinReviews(workspaceId, {
            status: 'suggested',
            limit: 5,
          })
          joins = (inbox.items || []).slice(0, 3).map((j) => ({
            id: j.id,
            label: `${j.from?.table}.${j.from?.column} → ${j.to?.table}.${j.to?.column}`,
            tier: j.risk?.effectiveTier || j.risk?.tier || 'yellow',
          }))
        } catch {
          joins = []
        }
        void notifyJoinReviewPending(workspaceId, {
          created: result.created,
          joins,
        })
      }
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/**
 * Two-source stitch session: infer joins between A and B, optionally create job.
 * Body: { connectionIdA, connectionIdB, createJob?, jobTitle? }
 */
app.post(
  '/workspaces/:workspaceId/stitch-session',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await runStitchSession(req.params.workspaceId, {
        connectionIdA: req.body?.connectionIdA,
        connectionIdB: req.body?.connectionIdB,
        createJob: req.body?.createJob === true,
        shipDbtPr: req.body?.shipDbtPr === true,
        jobTitle: req.body?.jobTitle,
        actorUserId: req.user?.id || null,
      })
      void reindexWorkspace(req.params.workspaceId).catch((err) =>
        console.warn('[Que] reindex after stitch-session:', err.message || err),
      )
      res.json(result)
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/**
 * Persist Stitch canvas node positions (UX layout — not schema truth).
 * Body: { positions: { [schemaObjectId]: { x, y } } }
 */
app.put(
  '/workspaces/:workspaceId/layout',
  requireMinRole('member'),
  async (req, res) => {
  const workspaceId = req.params.workspaceId
  const positions = req.body?.positions
  if (!positions || typeof positions !== 'object' || Array.isArray(positions)) {
    res.status(400).json({ error: 'body.positions object required' })
    return
  }
  try {
    await query(
      `INSERT INTO diagram_layouts (workspace_id, positions)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (workspace_id) DO UPDATE SET
         positions = diagram_layouts.positions || EXCLUDED.positions,
         updated_at = now()`,
      [workspaceId, JSON.stringify(positions)],
    )
    res.json({ ok: true, workspaceId })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/**
 * Introspect a connection and upsert schema truth into Stitch metadata.
 * Does not copy raw customer rows (samples capped).
 */
app.post(
  '/workspaces/:workspaceId/connections/:connectionId/sync',
  requireMinRole('member'),
  async (req, res) => {
    const { workspaceId, connectionId } = req.params
    try {
      const result = await syncWithRetries(workspaceId, connectionId)
      void reindexWorkspace(workspaceId).catch((err) =>
        console.warn('[Que] reindex after sync:', err.message || err),
      )
      void recordAuditEvent({
        workspaceId,
        actorUserId: req.user?.id,
        action: 'connection.sync',
        resourceType: 'connection',
        resourceId: connectionId,
        summary: `Synced connection schema`,
        meta: {
          tables: result?.tablesUpserted ?? result?.applied?.tables ?? null,
        },
      })
      res.json({ ok: true, ...result })
    } catch (err) {
      const status = err.status || 500
      void recordAuditEvent({
        workspaceId,
        actorUserId: req.user?.id,
        action: 'connection.sync_failed',
        resourceType: 'connection',
        resourceId: connectionId,
        summary: `Sync failed (${err.healthKind || 'unknown'})`,
        meta: {
          kind: err.healthKind || null,
          error: String(err.message || err).slice(0, 500),
        },
      }).catch(() => {})
      res.status(status).json({
        error: String(err.message || err),
        healthKind: err.healthKind || null,
        needsReauth: err.healthKind === 'auth',
      })
    }
  },
)

/** Wave 2.5 — scheduled sync status (introspect only). */
app.get('/workspaces/:workspaceId/sync-schedule', async (req, res) => {
  try {
    const status = await getWorkspaceSyncScheduleStatus(req.params.workspaceId)
    res.json({ ok: true, ...status })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/sync-schedule/run',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await runScheduledSyncTick({
        workspaceId: req.params.workspaceId,
        force: true,
        actorUserId: req.user?.id,
        limit: req.body?.limit,
      })
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** Schema-only context pack (for chat sidebar / debugging) */
app.get('/workspaces/:workspaceId/context', async (req, res) => {
  try {
    const pack = await buildSchemaContextPack(req.params.workspaceId)
    res.json({
      ok: true,
      stats: pack.stats,
      snapshot: pack.snapshot,
      tables: pack.tables.map((t) => ({
        name: t.name,
        entityKind: t.entityKind,
        sourceType: t.sourceType,
        connection: t.connection,
        columnCount: t.columns.length,
        columns: t.columns,
      })),
      relationships: pack.relationships,
    })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/**
 * Schema-only AI chat with RAG + model switch.
 * Body: { message, history?, mentions?, modelId?, sessionId? }
 */
app.post(
  '/workspaces/:workspaceId/chat',
  requireMinRole('member'),
  async (req, res) => {
  const message = req.body?.message
  const history = Array.isArray(req.body?.history) ? req.body.history : []
  const mentions = req.body?.mentions && typeof req.body.mentions === 'object'
    ? req.body.mentions
    : null
  const modelId =
    typeof req.body?.modelId === 'string' ? req.body.modelId : undefined
  const sessionId =
    typeof req.body?.sessionId === 'string' ? req.body.sessionId : 'default'
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'body.message string required' })
    return
  }
  try {
    const answer = await answerChat(
      req.params.workspaceId,
      message,
      history,
      mentions,
      { modelId, sessionId },
    )
    res.json({ ok: true, ...answer })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Thumbs feedback (RLHF-lite) */
app.post(
  '/workspaces/:workspaceId/chat/feedback',
  requireMinRole('member'),
  async (req, res) => {
    const rating = req.body?.rating
    if (rating !== 1 && rating !== -1) {
      res.status(400).json({ error: 'body.rating must be 1 or -1' })
      return
    }
    try {
      const row = await saveFeedback({
        workspaceId: req.params.workspaceId,
        messageId: req.body?.messageId,
        content: req.body?.content,
        rating,
        note: req.body?.note,
        modelId: req.body?.modelId,
        sourceRefs: Array.isArray(req.body?.sourceRefs)
          ? req.body.sourceRefs
          : [],
      })
      res.json({ ok: true, id: row.id, createdAt: row.created_at })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** AI / RAG status */
app.get('/workspaces/:workspaceId/ai/status', async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId
    const vectorReady = await vectorExtensionReady()
    const stats = vectorReady ? await getAiChunkStats(workspaceId) : null
    res.json({
      ok: true,
      vectorReady,
      embeddingMode: embeddingMode(),
      models: listAvailableModels(),
      stats,
      pillars: {
        nlp: true,
        rag: vectorReady,
        generativeInference:
          Boolean(process.env.OPENAI_API_KEY) ||
          Boolean(process.env.ANTHROPIC_API_KEY),
        agenticSkills: true,
        recommendationJoins: true,
        limitedMemory: true,
        feedbackLoop: true,
        computerVision: false,
        customModelTraining: false,
      },
    })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Reindex schema + docs into pgvector */
app.post(
  '/workspaces/:workspaceId/ai/reindex',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const includeDocs = req.body?.docs !== false
      const result = includeDocs
        ? await reindexAll(req.params.workspaceId)
        : {
            ok: true,
            schema: await reindexWorkspace(req.params.workspaceId),
            docs: { skipped: true },
          }
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** Workspace settings + capability summary */
app.get('/workspaces/:workspaceId/settings', async (req, res) => {
  try {
    const payload = await getWorkspaceSettings(req.params.workspaceId)
    if (!payload) {
      res.status(404).json({ error: 'workspace not found' })
      return
    }
    res.json({ ok: true, ...payload })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/settings',
  requireMinRole('admin'),
  async (req, res) => {
  try {
    const payload = await updateWorkspaceSettings(
      req.params.workspaceId,
      req.body ?? {},
    )
    if (!payload) {
      res.status(404).json({ error: 'workspace not found' })
      return
    }
    res.json({ ok: true, ...payload })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/**
 * BYOK — set/clear workspace LLM keys (admin only). Never returns plaintext.
 * Body: { openaiApiKey?: string | null, anthropicApiKey?: string | null }
 * Pass empty string or null to clear. Omit field to leave unchanged.
 */
app.put(
  '/workspaces/:workspaceId/secrets/llm',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const body = req.body ?? {}
      const out = {}
      if ('openaiApiKey' in body) {
        out.openai = await setSecret(
          req.params.workspaceId,
          'openai_api_key',
          body.openaiApiKey == null ? '' : String(body.openaiApiKey),
        )
      }
      if ('anthropicApiKey' in body) {
        out.anthropic = await setSecret(
          req.params.workspaceId,
          'anthropic_api_key',
          body.anthropicApiKey == null ? '' : String(body.anthropicApiKey),
        )
      }
      if ('githubToken' in body) {
        out.github = await setSecret(
          req.params.workspaceId,
          'github_token',
          body.githubToken == null ? '' : String(body.githubToken),
        )
      }
      const status = await getSecretsStatus(req.params.workspaceId)
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'secrets.llm.update',
        resourceType: 'secrets',
        resourceId: 'llm',
        summary: 'Updated workspace LLM / GitHub secrets',
        meta: { updated: Object.keys(out) },
      })
      res.json({ ok: true, updated: out, secrets: status })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/secrets/status', async (req, res) => {
  try {
    const status = await getSecretsStatus(req.params.workspaceId)
    res.json({ ok: true, secrets: status })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** List stitch jobs (draft → ready → exported) */
app.get('/workspaces/:workspaceId/jobs', async (req, res) => {
  try {
    const jobs = await listJobs(req.params.workspaceId)
    res.json({ jobs })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Wave 4.2 — must be registered before /jobs/:jobId */
app.get('/workspaces/:workspaceId/jobs/schedule', async (req, res) => {
  try {
    const status = await getWorkspaceJobScheduleStatus(req.params.workspaceId)
    res.json({ ok: true, ...status })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/jobs/schedule/run',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await runScheduledJobsTick({
        workspaceId: req.params.workspaceId,
        force: true,
        actorUserId: req.user?.id,
        limit: req.body?.limit,
      })
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/job-runs', async (req, res) => {
  try {
    const runs = await listWorkspaceJobRuns(req.params.workspaceId, {
      limit: req.query.limit,
      jobId: req.query.jobId,
    })
    res.json({ ok: true, runs })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.get('/workspaces/:workspaceId/jobs/:jobId', async (req, res) => {
  try {
    const job = await getJob(req.params.workspaceId, req.params.jobId)
    if (!job) {
      res.status(404).json({ error: 'job not found' })
      return
    }
    res.json({ job })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Create job from chat draft or UI (auto-freezes accepted joins for tables) */
app.post(
  '/workspaces/:workspaceId/jobs',
  requireMinRole('member'),
  async (req, res) => {
  try {
    const body = req.body ?? {}
    const job =
      body.fromCanvas || body.tableNames
        ? await createStitchJobFromTables(req.params.workspaceId, {
            tableNames: body.tableNames ?? body.tables ?? [],
            title: body.title,
            notes: body.notes,
          })
        : await createJob(req.params.workspaceId, body)
    res.status(201).json({ ok: true, job })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/jobs/:jobId',
  requireMinRole('member'),
  async (req, res) => {
  try {
    const job = await updateJob(
      req.params.workspaceId,
      req.params.jobId,
      req.body ?? {},
    )
    if (!job) {
      res.status(404).json({ error: 'job not found' })
      return
    }
    res.json({ ok: true, job })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/**
 * Runner — export JSON/SQL (existing) or dbt / dbt-pr (additive production layer).
 * Body: { format?: 'json' | 'sql' | 'dbt' | 'dbt-pr', githubOwner?, githubRepo?, githubBaseBranch?, branchName? }
 */
app.post(
  '/workspaces/:workspaceId/jobs/:jobId/export',
  requireMinRole('member'),
  async (req, res) => {
    const raw = req.body?.format
    const format = ['sql', 'dbt', 'dbt-pr'].includes(raw) ? raw : 'json'
    try {
      const result = await exportJob(
        req.params.workspaceId,
        req.params.jobId,
        format,
        {
          githubOwner: req.body?.githubOwner,
          githubRepo: req.body?.githubRepo,
          githubBaseBranch: req.body?.githubBaseBranch,
          branchName: req.body?.branchName,
          force: req.body?.force === true,
          actorUserId: req.user?.id || null,
        },
      )
      if (!result) {
        res.status(404).json({ error: 'job not found' })
        return
      }
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'job.export',
        resourceType: 'job',
        resourceId: req.params.jobId,
        summary: `Exported job as ${format}`,
        meta: { format },
      })

      let artifact = null
      const wantArtifact = req.body?.createArtifact !== false
      if (wantArtifact && result.export) {
        try {
          let payload = result.export
          if (format === 'dbt' || format === 'dbt-pr') {
            payload = {
              format,
              exportedAt:
                result.export.exportedAt || new Date().toISOString(),
              attestation: result.export.attestation,
              attestationFingerprint: result.export.attestationFingerprint,
              files: result.export.files || [],
              github: result.export.github
                ? {
                    opened: result.export.github.opened,
                    prUrl: result.export.github.prUrl || null,
                  }
                : undefined,
              job: {
                id: result.job?.id,
                title: result.job?.title,
                status: result.job?.status,
              },
            }
          }
          artifact = await createExportArtifact({
            workspaceId: req.params.workspaceId,
            jobId: req.params.jobId,
            actorUserId: req.user?.id || null,
            format,
            payload,
            ttlHours: req.body?.ttlHours,
            req,
            meta: { source: 'export' },
          })
        } catch (artErr) {
          console.warn(
            '[Que] artifact mint skipped:',
            artErr.message || artErr,
          )
        }
      }

      res.json({
        ok: true,
        ...result,
        artifact: artifact
          ? {
              id: artifact.artifact.id,
              downloadUrl: artifact.downloadUrl,
              downloadPath: artifact.downloadPath,
              expiresAt: artifact.expiresAt,
              filename: artifact.artifact.filename,
              contentSha256: artifact.artifact.contentSha256,
              note: artifact.note,
            }
          : null,
      })
    } catch (err) {
      const status = err.status || 500
      res.status(status).json({
        error: String(err.message || err),
        validation: err.validation || undefined,
      })
    }
  },
)

/** Wave 3.3 — mint / list / revoke signed artifacts (auth). */
app.post(
  '/workspaces/:workspaceId/jobs/:jobId/artifacts',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const minted = await mintJobArtifact(
        req.params.workspaceId,
        req.params.jobId,
        {
          format: req.body?.format,
          force: req.body?.force === true,
          ttlHours: req.body?.ttlHours,
          actorUserId: req.user?.id || null,
          githubOwner: req.body?.githubOwner,
          githubRepo: req.body?.githubRepo,
          githubBaseBranch: req.body?.githubBaseBranch,
          branchName: req.body?.branchName,
        },
        req,
      )
      res.status(201).json({
        ok: true,
        job: minted.job,
        artifact: minted.artifact,
        downloadUrl: minted.downloadUrl,
        downloadPath: minted.downloadPath,
        expiresAt: minted.expiresAt,
        note: minted.note,
      })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        validation: err.validation || undefined,
      })
    }
  },
)

app.get('/workspaces/:workspaceId/artifacts', async (req, res) => {
  try {
    const events = await listExportArtifacts(req.params.workspaceId, {
      jobId: req.query.jobId,
      limit: req.query.limit,
    })
    res.json({ ok: true, events })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/artifacts/:artifactId/revoke',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const revoked = await revokeExportArtifact(
        req.params.workspaceId,
        req.params.artifactId,
      )
      res.json({ ok: true, ...revoked })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/**
 * Wave 3.1 — opt-in materialize (CTAS/VIEW) into the customer warehouse.
 * Body: { confirm: true, connectionId?, objectName?, schema?, kind?: 'view'|'table', replace?, force? }
 */
app.post(
  '/workspaces/:workspaceId/jobs/:jobId/materialize',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await materializeJob(
        req.params.workspaceId,
        req.params.jobId,
        {
          confirm: req.body?.confirm === true,
          connectionId: req.body?.connectionId,
          objectName: req.body?.objectName,
          schema: req.body?.schema,
          kind: req.body?.kind,
          replace: req.body?.replace === true,
          force: req.body?.force === true,
          actorUserId: req.user?.id || null,
        },
      )
      res.status(201).json(result)
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
        validation: err.validation || undefined,
      })
    }
  },
)

app.get('/workspaces/:workspaceId/materializations', async (req, res) => {
  try {
    const events = await listMaterializations(req.params.workspaceId, {
      jobId: req.query.jobId,
      limit: req.query.limit,
    })
    res.json({ ok: true, events })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Wave 3.4 — lineage lite (sources → joins → job → export/table). */
app.get('/workspaces/:workspaceId/lineage', async (req, res) => {
  try {
    const lineage = await getWorkspaceLineageLite(req.params.workspaceId, {
      jobId: req.query.jobId,
      limit: req.query.limit,
    })
    res.json(lineage)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/**
 * Notebook dry-run — validate SQL cells + schema sample previews (no warehouse).
 * Body: { scope?: 'all'|'cell', cellId?, notebook?, mode?: 'dry_run' }
 */
app.post(
  '/workspaces/:workspaceId/jobs/:jobId/run',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const job = await getJob(req.params.workspaceId, req.params.jobId)
      if (!job) {
        res.status(404).json({ error: 'job not found' })
        return
      }
      const wantPrivate =
        req.body?.executionTarget === 'private_runner' ||
        job.executionTarget === 'private_runner'
      let run
      if (wantPrivate) {
        run = await enqueuePrivateRunnerJob(
          req.params.workspaceId,
          req.params.jobId,
          {
            mode: req.body?.mode || job.runMode || 'dry_run',
            trigger: 'manual',
          },
        )
      } else {
        run = await runJob(
          req.params.workspaceId,
          req.params.jobId,
          {
            scope: req.body?.scope,
            cellId: req.body?.cellId,
            notebook: req.body?.notebook,
            mode: req.body?.mode || 'dry_run',
            connectionId: req.body?.connectionId,
            maxRows: req.body?.maxRows,
            trigger: req.body?.trigger || 'manual',
          },
        )
        void triggerOrchestrator(req.params.workspaceId, {
          jobId: job.id,
          runId: run.id,
          status: run.status,
          title: job.title,
          schemaSnapshotId: job.schemaSnapshotId,
          sqlText: job.sqlText,
        }).catch(() => {})
      }
      res.status(201).json({ ok: true, run })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/jobs/:jobId/runs', async (req, res) => {
  try {
    const runs = await listJobRuns(
      req.params.workspaceId,
      req.params.jobId,
      Number(req.query.limit) || 20,
    )
    res.json({ ok: true, runs })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.get(
  '/workspaces/:workspaceId/jobs/:jobId/runs/:runId',
  async (req, res) => {
    try {
      const run = await getJobRun(
        req.params.workspaceId,
        req.params.jobId,
        req.params.runId,
      )
      if (!run) {
        res.status(404).json({ error: 'run not found' })
        return
      }
      res.json({ ok: true, run })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** Drift alarms */
app.get('/workspaces/:workspaceId/drift', async (req, res) => {
  try {
    const events = await listRecentDrift(req.params.workspaceId, 30)
    const openHigh = await getOpenHighDrift(req.params.workspaceId)
    res.json({ ok: true, events, openHigh, hasBlockingRisk: openHigh.length > 0 })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/drift/:eventId/ack',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const row = await acknowledgeDrift(
        req.params.workspaceId,
        req.params.eventId,
      )
      if (!row) {
        res.status(404).json({ error: 'drift event not found' })
        return
      }
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'drift.acknowledge',
        resourceType: 'drift_event',
        resourceId: row.id,
        summary: 'Acknowledged drift event',
      })
      res.json({ ok: true, id: row.id })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** Wave 2.3 — re-send / test drift alert for an existing event */
app.post(
  '/workspaces/:workspaceId/drift/:eventId/notify',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const events = await listRecentDrift(req.params.workspaceId, 100)
      const event = events.find((e) => e.id === req.params.eventId)
      if (!event) {
        res.status(404).json({ error: 'drift event not found' })
        return
      }
      const notify = await notifyDriftAlert({
        workspaceId: req.params.workspaceId,
        eventId: event.id,
        connectionId: event.connectionId,
        drift: {
          severity: event.severity,
          code: event.code,
          summary: event.summary,
          ...(event.detail && typeof event.detail === 'object' ? event.detail : {}),
        },
        force: true,
      })
      res.json({ ok: true, notify })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** Wave 2.3 — send a synthetic high-drift test alert (admin) */
app.post(
  '/workspaces/:workspaceId/drift/test-alert',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await createDriftEventAndAlert({
        workspaceId: req.params.workspaceId,
        severity: 'high',
        code: 'manual_test',
        summary:
          req.body?.summary ||
          'Test drift alert from Que Settings (no schema change)',
        detail: { test: true, actor: req.user?.email || req.user?.id },
        forceNotify: true,
      })
      res.status(201).json({ ok: true, ...result })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** Contract event outbox (streaming adapter handoff) */
app.get('/workspaces/:workspaceId/events/outbox', async (req, res) => {
  try {
    const events = await listOutbox(req.params.workspaceId, 40)
    res.json({ ok: true, events })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Wave 2.2 — contract status (frozen joins + validation + unreviewed) */
app.get(
  '/workspaces/:workspaceId/jobs/:jobId/contract',
  async (req, res) => {
    try {
      const job = await getJob(req.params.workspaceId, req.params.jobId)
      if (!job) {
        res.status(404).json({ error: 'job not found' })
        return
      }
      const status = await getJobContractStatus(req.params.workspaceId, job)
      res.json({
        ok: true,
        jobId: job.id,
        title: job.title,
        tables: job.tables,
        contract: job.contract,
        status,
      })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

/** Wave 2.2 — explicitly freeze / re-freeze accepted joins into the job contract */
app.post(
  '/workspaces/:workspaceId/jobs/:jobId/contract/freeze',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const job = await updateJob(
        req.params.workspaceId,
        req.params.jobId,
        { refreezeContract: true },
      )
      if (!job) {
        res.status(404).json({ error: 'job not found' })
        return
      }
      const status = await getJobContractStatus(req.params.workspaceId, job)
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'job.contract_freeze',
        resourceType: 'job',
        resourceId: job.id,
        summary: `Froze contract · ${status.frozenJoinCount} join(s)`,
        meta: {
          frozenJoinCount: status.frozenJoinCount,
          schemaSnapshotId: status.schemaSnapshotId,
        },
      })
      res.json({ ok: true, job, status })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Validate a job contract without exporting */
app.get(
  '/workspaces/:workspaceId/jobs/:jobId/contract/validate',
  async (req, res) => {
    try {
      const job = await getJob(req.params.workspaceId, req.params.jobId)
      if (!job) {
        res.status(404).json({ error: 'job not found' })
        return
      }
      const status = await getJobContractStatus(req.params.workspaceId, job)
      res.json({
        ok: true,
        validation: status.validation,
        schemaSnapshotId: job.schemaSnapshotId,
        contract: job.contract,
        status,
      })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/invites', requireMinRole('admin'), async (req, res) => {
  try {
    const invites = await listInvites(req.params.workspaceId)
    res.json({ ok: true, invites })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/invites',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const invite = await createInvite(req.params.workspaceId, {
        email: req.body?.email,
        role: req.body?.role,
        invitedBy: req.user?.id,
        actorRole: req.workspaceRole,
      })
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'invite.create',
        resourceType: 'invite',
        resourceId: invite.id,
        summary: `Invited ${invite.email} as ${invite.role}`,
        meta: { email: invite.email, role: invite.role },
      })
      res.status(201).json({ ok: true, invite })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/invites/:inviteId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const ok = await revokeInvite(req.params.workspaceId, req.params.inviteId)
      if (!ok) {
        res.status(404).json({ error: 'invite not found' })
        return
      }
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'invite.revoke',
        resourceType: 'invite',
        resourceId: req.params.inviteId,
        summary: 'Revoked workspace invite',
      })
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/members', async (req, res) => {
  try {
    const members = await listMembers(req.params.workspaceId)
    res.json({
      ok: true,
      members,
      summary: getMembershipSummary(members),
    })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Wave 1.1 — unified workspace audit log (all members can read). */
app.get('/workspaces/:workspaceId/audit-events', async (req, res) => {
  try {
    const events = await listAuditEvents(req.params.workspaceId, {
      limit: req.query.limit,
      offset: req.query.offset,
      action: req.query.action,
    })
    res.json({ ok: true, events })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Phase 0 — audit CSV export */
app.get('/workspaces/:workspaceId/audit-events/export', async (req, res) => {
  try {
    const events = await listAuditEvents(req.params.workspaceId, {
      limit: 500,
      action: req.query.action,
    })
    const header = 'id,created_at,action,actor_email,resource_type,resource_id,summary'
    const rows = events.map((e) =>
      [
        e.id,
        e.createdAt,
        e.action,
        e.actor?.email || '',
        e.resourceType || '',
        e.resourceId || '',
        JSON.stringify(e.summary || ''),
      ].join(','),
    )
    const csv = [header, ...rows].join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="que-audit-${req.params.workspaceId.slice(0, 8)}.csv"`,
    )
    res.send(csv)
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Phase 0.2 — golden-set join eval */
app.post(
  '/workspaces/:workspaceId/joins/golden-eval',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const report = await evaluateGoldenSet(
        req.params.workspaceId,
        req.body?.pairs || [],
      )
      try {
        await recordGoldenEvalScore(req.params.workspaceId, {
          ...report,
          pairCount: Array.isArray(req.body?.pairs) ? req.body.pairs.length : null,
        })
      } catch {
        /* settings write optional */
      }
      const markdown = formatGoldenSetMarkdown(report)
      res.json({ ok: true, report, markdown })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** CEO P0 — Outcome plans */
app.get('/workspaces/:workspaceId/outcomes', async (req, res) => {
  try {
    const outcomes = await listOutcomes(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, outcomes })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/outcomes',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const outcome = await createOutcome(
        req.params.workspaceId,
        req.body?.prompt,
        req.user?.id,
      )
      res.status(201).json({ ok: true, outcome })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/outcomes/:outcomeId', async (req, res) => {
  try {
    const outcome = await getOutcome(
      req.params.workspaceId,
      req.params.outcomeId,
    )
    if (!outcome) {
      res.status(404).json({ error: 'outcome not found' })
      return
    }
    res.json({ ok: true, outcome })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/outcomes/:outcomeId/refresh',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const outcome = await refreshOutcome(
        req.params.workspaceId,
        req.params.outcomeId,
        req.user?.id,
      )
      res.json({ ok: true, outcome })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/outcomes/:outcomeId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const outcome = await patchOutcomeStatus(
        req.params.workspaceId,
        req.params.outcomeId,
        req.body?.status,
        req.user?.id,
      )
      res.json({ ok: true, outcome })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/outcomes/:outcomeId/run-step',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await runOutcomeStep(
        req.params.workspaceId,
        req.params.outcomeId,
        {
          stepId: req.body?.stepId || 'auto',
          inferJoins: req.body?.inferJoins === true,
          userId: req.user?.id,
        },
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/outcomes/:outcomeId/advance-agent',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await advanceOutcomeAgent(
        req.params.workspaceId,
        req.params.outcomeId,
        {
          userId: req.user?.id,
          approvePlan: req.body?.approvePlan === true,
        },
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** CEO P0 — Ship to BI */
app.get('/workspaces/:workspaceId/ship-events', async (req, res) => {
  try {
    const ships = await listShipEvents(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, ships })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/ship-events',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const ship = await createShipDraft(req.params.workspaceId, {
        ...(req.body || {}),
        userId: req.user?.id,
      })
      res.status(201).json({ ok: true, ship })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/ship-events/:shipId', async (req, res) => {
  try {
    const ship = await getShipEvent(
      req.params.workspaceId,
      req.params.shipId,
    )
    if (!ship) {
      res.status(404).json({ error: 'ship event not found' })
      return
    }
    res.json({ ok: true, ship })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/ship-events/:shipId/approve',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await approveShip(
        req.params.workspaceId,
        req.params.shipId,
        req.user?.id,
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/ship-events/:shipId/rollback',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await rollbackShip(
        req.params.workspaceId,
        req.params.shipId,
        req.user?.id,
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/ship-events/:shipId/link-materialization',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const ship = await linkShipMaterialization(
        req.params.workspaceId,
        req.params.shipId,
        {
          jobId: req.body?.jobId || null,
          materializationId: req.body?.materializationId || null,
          userId: req.user?.id,
        },
      )
      res.json({ ok: true, ship })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/materializations/:materializationId/drop',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const out = await dropMaterialization(
        req.params.workspaceId,
        req.params.materializationId,
        {
          confirm: req.body?.confirm === true,
          actorUserId: req.user?.id,
        },
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Phase 1 — Stitch Agent */
app.get('/workspaces/:workspaceId/agent/sessions', async (req, res) => {
  try {
    const sessions = await listAgentSessions(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, sessions })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/agent/sessions',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const session = await createAgentSession(
        req.params.workspaceId,
        req.user?.id,
        req.body || {},
      )
      res.status(201).json({ ok: true, session })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/agent/sessions/:sessionId', async (req, res) => {
  try {
    const session = await getAgentSession(
      req.params.workspaceId,
      req.params.sessionId,
    )
    if (!session) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true, session })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/agent/sessions/:sessionId/checkpoint',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const action = String(req.body?.action || '').toLowerCase()
      let session
      if (action === 'continue_after_promote') {
        session = await continueAgentAfterPromote(
          req.params.workspaceId,
          req.params.sessionId,
          req.user?.id,
          req.body || {},
        )
      } else {
        session = await advanceAgentCheckpoint(
          req.params.workspaceId,
          req.params.sessionId,
          req.user?.id,
          req.body || {},
        )
      }
      res.json({ ok: true, session })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/join-memory', async (req, res) => {
  try {
    const items = await listJoinMemory(req.params.workspaceId)
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

/** Phase 3 — Validation suite */
app.get(
  '/workspaces/:workspaceId/jobs/:jobId/validation-suite',
  async (req, res) => {
    try {
      const suite = await getValidationSuite(
        req.params.workspaceId,
        req.params.jobId,
      )
      res.json({ ok: true, ...suite })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/jobs/:jobId/validation-suite/generate',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const suite = await generateValidationSuite(
        req.params.workspaceId,
        req.params.jobId,
      )
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'validation_suite.generate',
        resourceType: 'job',
        resourceId: req.params.jobId,
        summary: `Generated ${suite.checks?.length || 0} validation checks`,
      })
      res.json({ ok: true, ...suite })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/jobs/:jobId/validation-suite/run',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await runValidationSuite(
        req.params.workspaceId,
        req.params.jobId,
        { trigger: 'manual' },
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Phase 3 — Drift agent */
app.get('/workspaces/:workspaceId/drift-fixes', async (req, res) => {
  try {
    const suggestions = await listDriftFixSuggestions(req.params.workspaceId, {
      status: req.query.status || 'proposed',
    })
    res.json({ ok: true, suggestions })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/drift-fixes/propose',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await proposeDriftFixes(
        req.params.workspaceId,
        req.user?.id,
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/drift-fixes/:suggestionId/resolve',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await resolveDriftFix(
        req.params.workspaceId,
        req.params.suggestionId,
        req.user?.id,
        { action: req.body?.action || 'accept' },
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/joins/auto-promote-low-risk',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const out = await maybeAutoPromoteLowRisk(
        req.params.workspaceId,
        req.user?.id,
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Phase 4 — Catalog / glossary / stewardship / lineage / policy / tickets */
app.get('/workspaces/:workspaceId/glossary', async (req, res) => {
  try {
    const terms = await listGlossaryTerms(req.params.workspaceId, {
      status: req.query.status,
    })
    res.json({ ok: true, terms })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/glossary',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const term = await createGlossaryTerm(
        req.params.workspaceId,
        req.body || {},
        req.user?.id,
      )
      res.status(201).json({ ok: true, term })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/glossary/:termId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const term = await updateGlossaryTerm(
        req.params.workspaceId,
        req.params.termId,
        req.body || {},
      )
      res.json({ ok: true, term })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/glossary/:termId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await deleteGlossaryTerm(req.params.workspaceId, req.params.termId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/glossary/:termId/links',
  async (req, res) => {
    try {
      const links = await listTermLinks(
        req.params.workspaceId,
        req.params.termId,
      )
      res.json({ ok: true, links })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/glossary/:termId/links',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const link = await linkTermToColumn(
        req.params.workspaceId,
        req.params.termId,
        req.body || {},
      )
      res.status(201).json({ ok: true, link })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/catalog/assets', async (req, res) => {
  try {
    const assets = await listCatalogAssets(req.params.workspaceId, {
      kind: req.query.kind,
    })
    res.json({ ok: true, assets })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/catalog/assets',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const asset = await createCatalogAsset(
        req.params.workspaceId,
        req.body || {},
        req.user?.id,
      )
      res.status(201).json({ ok: true, asset })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/catalog/assets/:assetId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const asset = await updateCatalogAsset(
        req.params.workspaceId,
        req.params.assetId,
        req.body || {},
      )
      res.json({ ok: true, asset })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/catalog/assets/:assetId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await deleteCatalogAsset(req.params.workspaceId, req.params.assetId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/catalog/assets/:assetId/deps',
  async (req, res) => {
    try {
      const deps = await listAssetDeps(
        req.params.workspaceId,
        req.params.assetId,
      )
      res.json({ ok: true, deps })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/stewardship/certs', async (req, res) => {
  try {
    const certifications = await listCertifications(req.params.workspaceId, {
      status: req.query.status,
    })
    res.json({ ok: true, certifications })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.get('/workspaces/:workspaceId/stewardship/queue', async (req, res) => {
  try {
    const queue = await getStewardQueue(req.params.workspaceId)
    res.json({ ok: true, ...queue })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/stewardship/certify',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const certification = await certifyTarget(
        req.params.workspaceId,
        req.body || {},
        req.user?.id,
      )
      res.status(201).json({ ok: true, certification })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/stewardship/certs/:certId/expire',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const certification = await expireCertification(
        req.params.workspaceId,
        req.params.certId,
        req.user?.id,
      )
      res.json({ ok: true, certification })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/column-lineage', async (req, res) => {
  try {
    const lineage = await getColumnLineage(req.params.workspaceId, {
      table: req.query.table,
      column: req.query.column,
      maxHops: req.query.maxHops,
      direction: req.query.direction,
    })
    res.json(lineage)
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.get('/workspaces/:workspaceId/policy-packs', async (req, res) => {
  try {
    let packs = await listPolicyPacks(req.params.workspaceId)
    if (req.query.ensureDefaults === '1' && !packs.length) {
      packs = await ensureDefaultPolicyPacks(req.params.workspaceId)
    }
    res.json({ ok: true, packs })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/policy-packs',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const pack = await createPolicyPack(
        req.params.workspaceId,
        req.body || {},
      )
      res.status(201).json({ ok: true, pack })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/policy-packs/:packId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const pack = await updatePolicyPack(
        req.params.workspaceId,
        req.params.packId,
        req.body || {},
      )
      res.json({ ok: true, pack })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/policy-packs/:packId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await deletePolicyPack(req.params.workspaceId, req.params.packId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/policy-packs/apply-pii',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const out = await applyPiiPolicyPack(
        req.params.workspaceId,
        req.body?.packId || null,
      )
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/governance/tickets', async (req, res) => {
  try {
    const tickets = await listGovernanceTickets(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, tickets })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/governance/tickets',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const ticket = await createGovernanceTicket(
        req.params.workspaceId,
        req.body || {},
        req.user?.id,
      )
      res.status(201).json({ ok: true, ticket })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Phase 5 — Enterprise control plane */
app.get('/workspaces/:workspaceId/enterprise/api-keys', async (req, res) => {
  try {
    const keys = await listApiKeys(req.params.workspaceId)
    res.json({ ok: true, keys })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/enterprise/api-keys',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const key = await createApiKey(
        req.params.workspaceId,
        req.body || {},
        req.user?.id,
      )
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'api_key.create',
        resourceType: 'api_key',
        resourceId: key.id,
        summary: `Created API key ${key.name}`,
      })
      res.status(201).json({ ok: true, key })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/enterprise/api-keys/:keyId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await revokeApiKey(req.params.workspaceId, req.params.keyId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/enterprise/scim-tokens', async (req, res) => {
  try {
    const tokens = await listScimTokens(req.params.workspaceId)
    res.json({ ok: true, tokens })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/enterprise/scim-tokens',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const token = await createScimToken(
        req.params.workspaceId,
        req.user?.id,
        req.body?.name,
      )
      res.status(201).json({ ok: true, token })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/enterprise/scim-tokens/:tokenId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await revokeScimToken(req.params.workspaceId, req.params.tokenId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** SCIM 2.0 Users — Bearer scim_… token */
app.get('/workspaces/:workspaceId/scim/v2/Users', async (req, res) => {
  try {
    if (!req.scim && !authDisabled()) {
      return res.status(401).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'SCIM bearer required',
        status: '401',
      })
    }
    const out = await scimListUsers(req.params.workspaceId, {
      filter: req.query.filter,
      startIndex: req.query.startIndex,
      count: req.query.count,
    })
    res.json(out)
  } catch (err) {
    res.status(err.status || 500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: String(err.message || err),
      status: String(err.status || 500),
    })
  }
})

app.get('/workspaces/:workspaceId/scim/v2/Users/:userId', async (req, res) => {
  try {
    if (!req.scim && !authDisabled()) {
      return res.status(401).json({ detail: 'SCIM bearer required', status: '401' })
    }
    res.json(await scimGetUser(req.params.workspaceId, req.params.userId))
  } catch (err) {
    res.status(err.status || 500).json({ detail: String(err.message || err) })
  }
})

app.post('/workspaces/:workspaceId/scim/v2/Users', async (req, res) => {
  try {
    if (!req.scim && !authDisabled()) {
      return res.status(401).json({ detail: 'SCIM bearer required', status: '401' })
    }
    const user = await scimCreateUser(req.params.workspaceId, req.body || {})
    res.status(201).json(user)
  } catch (err) {
    res.status(err.status || 500).json({ detail: String(err.message || err) })
  }
})

app.patch('/workspaces/:workspaceId/scim/v2/Users/:userId', async (req, res) => {
  try {
    if (!req.scim && !authDisabled()) {
      return res.status(401).json({ detail: 'SCIM bearer required', status: '401' })
    }
    res.json(
      await scimPatchUser(
        req.params.workspaceId,
        req.params.userId,
        req.body || {},
      ),
    )
  } catch (err) {
    res.status(err.status || 500).json({ detail: String(err.message || err) })
  }
})

app.put('/workspaces/:workspaceId/scim/v2/Users/:userId', async (req, res) => {
  try {
    if (!req.scim && !authDisabled()) {
      return res.status(401).json({ detail: 'SCIM bearer required', status: '401' })
    }
    res.json(
      await scimPatchUser(
        req.params.workspaceId,
        req.params.userId,
        req.body || {},
      ),
    )
  } catch (err) {
    res.status(err.status || 500).json({ detail: String(err.message || err) })
  }
})

app.delete('/workspaces/:workspaceId/scim/v2/Users/:userId', async (req, res) => {
  try {
    if (!req.scim && !authDisabled()) {
      return res.status(401).json({ detail: 'SCIM bearer required', status: '401' })
    }
    await scimDeleteUser(req.params.workspaceId, req.params.userId)
    res.status(204).end()
  } catch (err) {
    res.status(err.status || 500).json({ detail: String(err.message || err) })
  }
})

app.get('/workspaces/:workspaceId/scim/v2/ServiceProviderConfig', (_req, res) => {
  res.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Que SCIM token (scim_…)',
        primary: true,
      },
    ],
  })
})

app.get('/workspaces/:workspaceId/enterprise/cmk', async (req, res) => {
  try {
    res.json({ ok: true, cmk: await getCmkStatus(req.params.workspaceId) })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/enterprise/cmk/enable',
  requireMinRole('owner'),
  async (req, res) => {
    try {
      const cmk = await enableCmk(req.params.workspaceId, req.body || {})
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'cmk.enable',
        resourceType: 'cmk',
        summary: `Enabled CMK ${cmk.keyId}`,
      })
      res.json({ ok: true, cmk })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/enterprise/cmk/disable',
  requireMinRole('owner'),
  async (req, res) => {
    try {
      const cmk = await disableCmk(req.params.workspaceId)
      res.json({ ok: true, cmk })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/enterprise/cmk/rotate',
  requireMinRole('owner'),
  async (req, res) => {
    try {
      const cmk = await rotateCmk(req.params.workspaceId)
      res.json({ ok: true, cmk })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/enterprise/abac', async (req, res) => {
  try {
    res.json({ ok: true, policies: await listAbacPolicies(req.params.workspaceId) })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/enterprise/abac',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const policy = await createAbacPolicy(
        req.params.workspaceId,
        req.body || {},
      )
      res.status(201).json({ ok: true, policy })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/enterprise/abac/:policyId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await deleteAbacPolicy(req.params.workspaceId, req.params.policyId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/enterprise/break-glass', async (req, res) => {
  try {
    res.json({ ok: true, events: await listBreakGlass(req.params.workspaceId) })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/enterprise/break-glass',
  requireMinRole('owner'),
  async (req, res) => {
    try {
      const event = await openBreakGlass(
        req.params.workspaceId,
        req.user?.id,
        req.body?.reason,
        req.body?.hours,
      )
      res.status(201).json({ ok: true, event })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/enterprise/break-glass/:eventId/close',
  requireMinRole('owner'),
  async (req, res) => {
    try {
      await closeBreakGlass(
        req.params.workspaceId,
        req.params.eventId,
        req.user?.id,
      )
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/enterprise/siem', async (req, res) => {
  try {
    res.json({ ok: true, siem: await getSiemConfig(req.params.workspaceId) })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/enterprise/siem',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const siem = await updateSiemConfig(req.params.workspaceId, req.body || {})
      res.json({ ok: true, siem })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/enterprise/siem/export', async (req, res) => {
  try {
    const out = await exportSiemEvents(req.params.workspaceId, {
      since: req.query.since,
      limit: req.query.limit,
    })
    if (req.query.format === 'jsonl') {
      res.type('application/x-ndjson').send(out.jsonl)
      return
    }
    res.json({ ok: true, ...out })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/enterprise/siem/push',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const out = await pushSiemWebhook(req.params.workspaceId)
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/enterprise/soc2-evidence',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const out = await buildSoc2EvidencePack(req.params.workspaceId)
      if (req.query.format === 'md') {
        res.type('text/markdown').send(out.markdown)
        return
      }
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/enterprise/isolation-test',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await runTenantIsolationTests(req.params.workspaceId)
      res.json({ ok: true, result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/enterprise/isolation-runs',
  async (req, res) => {
    try {
      res.json({
        ok: true,
        runs: await listIsolationRuns(req.params.workspaceId),
      })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Phase 2 — Domains / data products */
app.get('/workspaces/:workspaceId/domains', async (req, res) => {
  try {
    const domains = await listDomains(req.params.workspaceId)
    res.json({ ok: true, domains })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/domains',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const domain = await createDomain(
        req.params.workspaceId,
        req.body || {},
        req.user?.id,
      )
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'domain.create',
        resourceType: 'domain',
        resourceId: domain.id,
        summary: `Created domain ${domain.name}`,
      })
      res.status(201).json({ ok: true, domain })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/domains/:domainId', async (req, res) => {
  try {
    const domain = await getDomain(req.params.workspaceId, req.params.domainId)
    if (!domain) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true, domain })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/domains/:domainId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const domain = await updateDomain(
        req.params.workspaceId,
        req.params.domainId,
        req.body || {},
      )
      res.json({ ok: true, domain })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/domains/:domainId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const ok = await deleteDomain(
        req.params.workspaceId,
        req.params.domainId,
      )
      if (!ok) return res.status(404).json({ error: 'not found' })
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Phase 2 — Job templates */
app.get('/workspaces/:workspaceId/job-templates', async (req, res) => {
  try {
    const templates = await listJobTemplates(req.params.workspaceId)
    res.json({ ok: true, templates })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/job-templates',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const template = await createJobTemplate(
        req.params.workspaceId,
        req.body || {},
        req.user?.id,
      )
      res.status(201).json({ ok: true, template })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/job-templates/:templateId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const ok = await deleteJobTemplate(
        req.params.workspaceId,
        req.params.templateId,
      )
      if (!ok) return res.status(404).json({ error: 'not found or system template' })
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/job-templates/:templateId/apply',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const job = await applyJobTemplate(
        req.params.workspaceId,
        req.params.templateId,
        req.body || {},
      )
      res.status(201).json({ ok: true, job })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Phase 2 — Drift digest + join-review test notify */
app.post(
  '/workspaces/:workspaceId/notify/drift-digest',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const out = await sendDriftDigest(req.params.workspaceId, { force: true })
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/notify/join-review-test',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const out = await notifyJoinReviewPending(req.params.workspaceId, {
        created: Number(req.body?.created || 1),
      })
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Wave 1.5 — usage counters (billing precursor; soft limits). */
app.get('/workspaces/:workspaceId/usage', async (req, res) => {
  try {
    const usage = await getWorkspaceUsage(req.params.workspaceId)
    res.json({ ok: true, usage })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

/** Wave 4.3 — external orchestrator webhook */
app.get('/workspaces/:workspaceId/orchestrator', async (req, res) => {
  try {
    const config = await getOrchestratorConfig(req.params.workspaceId)
    res.json({ ok: true, config })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/orchestrator',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const config = await updateOrchestratorConfig(
        req.params.workspaceId,
        req.body || {},
      )
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'orchestrator.config_update',
        resourceType: 'workspace',
        resourceId: req.params.workspaceId,
        summary: 'Updated orchestrator webhook config',
      })
      res.json({ ok: true, config })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/orchestrator/test',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await testOrchestratorPing(req.params.workspaceId)
      res.json({ ok: true, result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/jobs/:jobId/orchestrator/trigger',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const job = await getJob(req.params.workspaceId, req.params.jobId)
      if (!job) {
        res.status(404).json({ error: 'job not found' })
        return
      }
      const result = await triggerOrchestrator(req.params.workspaceId, {
        jobId: job.id,
        runId: req.body?.runId || 'manual-trigger',
        status: req.body?.status || 'trigger',
        title: job.title,
        schemaSnapshotId: job.schemaSnapshotId,
        sqlText: job.sqlText,
      })
      res.json({ ok: true, result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Wave 4.4 — mapping assist */
app.post(
  '/workspaces/:workspaceId/mapping-assist',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await runMappingAssist(req.params.workspaceId, {
        refreshJoins: req.body?.refreshJoins !== false,
        limit: req.body?.limit,
      })
      res.json(result)
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/mapping-assist/renames', async (req, res) => {
  try {
    const items = await listRenameSuggestions(
      req.params.workspaceId,
      req.query.status || 'suggested',
    )
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/mapping-assist/renames/:suggestionId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await reviewRenameSuggestion(
        req.params.workspaceId,
        req.params.suggestionId,
        req.body?.action,
        req.user?.id,
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Wave 4.5 — private runner */
app.get('/workspaces/:workspaceId/private-runner', async (req, res) => {
  try {
    const config = await getPrivateRunnerConfig(req.params.workspaceId)
    res.json({ ok: true, config })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/private-runner',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const config = await updatePrivateRunnerConfig(
        req.params.workspaceId,
        req.body || {},
      )
      res.json({ ok: true, config })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post('/runner/callback', async (req, res) => {
  try {
    const raw = JSON.stringify(req.body || {})
    const run = await handleRunnerCallback(
      raw,
      req.headers['x-que-signature'],
    )
    res.json({ ok: true, run })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

/** Wave 4.6 — billing */
app.get('/workspaces/:workspaceId/billing', async (req, res) => {
  try {
    const billing = await getBillingStatus(req.params.workspaceId)
    res.json({ ok: true, billing })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/billing/checkout',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const session = await createCheckoutSession(req.params.workspaceId, {
        seats: req.body?.seats,
      })
      res.json({ ok: true, ...session })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/billing/portal',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const session = await createBillingPortalSession(req.params.workspaceId)
      res.json({ ok: true, ...session })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Wave 2.4 — export attestation list / download / verify pack. */
app.get('/workspaces/:workspaceId/export-attestations', async (req, res) => {
  try {
    const events = await listExportAttestations(req.params.workspaceId, {
      jobId: req.query.jobId,
      limit: req.query.limit,
    })
    res.json({ ok: true, events })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.get(
  '/workspaces/:workspaceId/export-attestations/:eventId',
  async (req, res) => {
    try {
      const event = await getExportAttestation(
        req.params.workspaceId,
        req.params.eventId,
      )
      res.json({ ok: true, event })
    } catch (err) {
      res
        .status(err.status || 500)
        .json({ error: String(err.message || err), code: err.code })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/export-attestations/:eventId/pack',
  async (req, res) => {
    try {
      const pack = await buildAttestationVerifyPack(
        req.params.workspaceId,
        req.params.eventId,
        {
          apiBase: `${req.protocol}://${req.get('host')}`,
          verifyUiUrl:
            process.env.QUE_ATTESTATION_VERIFY_UI_URL ||
            undefined,
        },
      )
      const fname = `que-attestation-pack-${String(pack.export.fingerprint || pack.export.id).slice(0, 16)}.json`
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fname}"`,
      )
      res.json(pack)
    } catch (err) {
      res
        .status(err.status || 500)
        .json({ error: String(err.message || err), code: err.code })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/members/:userId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const member = await updateMemberRole(
        req.params.workspaceId,
        req.params.userId,
        req.body?.role,
        req.user.id,
        req.workspaceRole,
      )
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'member.role_change',
        resourceType: 'member',
        resourceId: req.params.userId,
        summary: `Changed member role to ${req.body?.role}`,
        meta: { role: req.body?.role, email: member?.email },
      })
      res.json({ ok: true, member })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/members/:userId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await removeMember(
        req.params.workspaceId,
        req.params.userId,
        req.workspaceRole,
        req.user.id,
      )
      void recordAuditEvent({
        workspaceId: req.params.workspaceId,
        actorUserId: req.user?.id,
        action: 'member.remove',
        resourceType: 'member',
        resourceId: req.params.userId,
        summary: 'Removed workspace member',
      })
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

/* ── Production: pinned samples ── */
app.get('/workspaces/:workspaceId/pinned-samples', async (req, res) => {
  try {
    const items = await listPinnedSamples(req.params.workspaceId)
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.get(
  '/workspaces/:workspaceId/pinned-samples/:schemaObjectId',
  async (req, res) => {
    try {
      const item = await getPinnedSample(
        req.params.workspaceId,
        req.params.schemaObjectId,
      )
      if (!item) {
        res.status(404).json({ error: 'pinned sample not found' })
        return
      }
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/pinned-samples/:schemaObjectId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await pinTableSamples(
        req.params.workspaceId,
        req.params.schemaObjectId,
        {
          userId: req.user?.id ?? null,
          force: req.body?.force === true || req.body?.rePin === true,
        },
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/pinned-samples/ensure',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const connectionId = req.body?.connectionId
      if (!connectionId) {
        res.status(400).json({ error: 'connectionId required' })
        return
      }
      const result = await ensurePinnedSamplesForConnection(
        req.params.workspaceId,
        connectionId,
        { userId: req.user?.id ?? null },
      )
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/tables/:schemaObjectId/columns',
  async (req, res) => {
    try {
      const columns = await listTableColumns(
        req.params.workspaceId,
        req.params.schemaObjectId,
      )
      res.json({ ok: true, columns })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Production: Offer B managed data plane ── */
app.get('/workspaces/:workspaceId/managed-datasets', async (req, res) => {
  try {
    const enabled = await isManagedPlaneEnabled(req.params.workspaceId)
    const quotas = await getManagedPlaneQuotas(req.params.workspaceId)
    const items = enabled
      ? await listManagedDatasets(req.params.workspaceId)
      : []
    res.json({ ok: true, enabled, quotas, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/managed-datasets/purge-expired',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await purgeExpiredManagedDatasets(req.params.workspaceId)
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/jobs/:jobId/runs/:runId/land-managed',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const run = await getJobRun(
        req.params.workspaceId,
        req.params.jobId,
        req.params.runId,
      )
      if (!run) {
        res.status(404).json({ error: 'run not found' })
        return
      }
      const job = await getJob(req.params.workspaceId, req.params.jobId)
      const land = await landManagedDatasetFromJobRun(req.params.workspaceId, {
        jobId: req.params.jobId,
        runId: req.params.runId,
        jobTitle: job?.title,
        liveResults: run.output?.liveResults || [],
        samplePreviews: run.output?.samplePreviews || [],
        userId: req.user?.id ?? null,
      })
      res.json({ ok: true, ...land })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/managed-datasets/:datasetId',
  async (req, res) => {
    try {
      const item = await getManagedDataset(
        req.params.workspaceId,
        req.params.datasetId,
      )
      if (!item) {
        res.status(404).json({ error: 'dataset not found' })
        return
      }
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/managed-datasets/:datasetId/rows',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await readManagedDatasetRows(
        req.params.workspaceId,
        req.params.datasetId,
        { limit: req.query.limit, offset: req.query.offset },
      )
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/managed-datasets',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await upsertManagedDatasetFromJob(req.params.workspaceId, {
        ...req.body,
        userId: req.user?.id ?? null,
      })
      res.status(201).json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/managed-datasets/:datasetId/certify',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await certifyManagedDataset(
        req.params.workspaceId,
        req.params.datasetId,
        req.user?.id ?? null,
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/managed-datasets/:datasetId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await deleteManagedDataset(
        req.params.workspaceId,
        req.params.datasetId,
      )
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Production: external job status bridge ── */
app.post(
  '/workspaces/:workspaceId/jobs/external-status',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const run = await reportExternalJobStatus(
        req.params.workspaceId,
        req.body || {},
        { actorLabel: req.user?.email || 'api' },
      )
      res.json({ ok: true, run })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/jobs/:jobId/external-status',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const run = await reportExternalJobStatus(
        req.params.workspaceId,
        { ...(req.body || {}), jobId: req.params.jobId },
        { actorLabel: req.user?.email || 'api' },
      )
      res.json({ ok: true, run })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Production: certified BI ── */
app.get('/workspaces/:workspaceId/bi/charts', async (req, res) => {
  try {
    const items = await listBiCharts(req.params.workspaceId)
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/bi/charts',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await createBiChart(req.params.workspaceId, {
        ...req.body,
        userId: req.user?.id ?? null,
      })
      res.status(201).json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

app.get('/workspaces/:workspaceId/bi/charts/:chartId', async (req, res) => {
  try {
    const item = await getBiChart(req.params.workspaceId, req.params.chartId)
    if (!item) {
      res.status(404).json({ error: 'chart not found' })
      return
    }
    res.json({ ok: true, item })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.patch(
  '/workspaces/:workspaceId/bi/charts/:chartId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await updateBiChart(
        req.params.workspaceId,
        req.params.chartId,
        req.body || {},
        req.user?.id ?? null,
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/bi/charts/:chartId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await deleteBiChart(req.params.workspaceId, req.params.chartId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/bi/charts/:chartId/preview',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await previewBiChart(
        req.params.workspaceId,
        req.params.chartId,
        { limit: req.query.limit },
      )
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/bi/charts/:chartId/embed-token',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await mintBiEmbedToken(
        req.params.workspaceId,
        req.params.chartId,
        {
          label: req.body?.label,
          expiresInDays: req.body?.expiresInDays,
          userId: req.user?.id ?? null,
        },
      )
      res.status(201).json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({
        error: String(err.message || err),
        code: err.code || null,
      })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/bi/embed-tokens/:tokenId/revoke',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await revokeBiEmbedToken(req.params.workspaceId, req.params.tokenId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/bi/embed/:token', async (req, res) => {
  try {
    const result = await resolveBiEmbed(req.params.token)
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

/* ── P1: Offer A warehouse digests ── */
app.get('/workspaces/:workspaceId/warehouse-digests', async (req, res) => {
  try {
    const items = await listWarehouseDigests(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/warehouse-digests/build',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const digest = await buildWarehouseRunDigest(req.params.workspaceId, {
        jobId: req.body?.jobId || null,
        limit: req.body?.limit,
      })
      res.status(201).json({ ok: true, digest })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/warehouse-digests/ingest',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const digest = await ingestExternalWarehouseDigest(
        req.params.workspaceId,
        req.body || {},
        { userId: req.user?.id ?? null },
      )
      res.status(201).json({ ok: true, digest })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── P1: connector reliability ── */
app.get(
  '/workspaces/:workspaceId/connector-reliability',
  async (req, res) => {
    try {
      const status = await getConnectorReliabilityStatus(req.params.workspaceId)
      res.json({ ok: true, ...status })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/connections/:connectionId/retry-policy',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const item = await updateConnectionRetryPolicy(
        req.params.workspaceId,
        req.params.connectionId,
        req.body || {},
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── P1: SaaS backups + DR drills ── */
app.get('/workspaces/:workspaceId/saas-ops', async (req, res) => {
  try {
    const summary = await getSaasOpsSummary(req.params.workspaceId)
    res.json({ ok: true, ...summary })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.get('/workspaces/:workspaceId/backups', async (req, res) => {
  try {
    const items = await listBackups(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/backups',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const item = await createMetadataBackup(req.params.workspaceId, {
        label: req.body?.label,
        userId: req.user?.id ?? null,
      })
      res.status(201).json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/backups/:backupId', async (req, res) => {
  try {
    const item = await getBackup(req.params.workspaceId, req.params.backupId)
    if (!item) {
      res.status(404).json({ error: 'backup not found' })
      return
    }
    res.json({ ok: true, item })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.get('/workspaces/:workspaceId/dr-drills', async (req, res) => {
  try {
    const items = await listDrDrills(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/dr-drills/run',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const result = await runDrDrill(req.params.workspaceId, {
        userId: req.user?.id ?? null,
      })
      res.status(201).json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── P1: scheduled golden eval ── */
app.get('/workspaces/:workspaceId/golden-eval/schedule', async (req, res) => {
  try {
    const schedule = await getGoldenEvalSchedule(req.params.workspaceId)
    res.json({ ok: true, schedule })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.put(
  '/workspaces/:workspaceId/golden-eval/schedule',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      const schedule = await upsertGoldenEvalSchedule(
        req.params.workspaceId,
        req.body || {},
      )
      res.json({ ok: true, schedule })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/golden-eval/run',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await runGoldenEvalNow(req.params.workspaceId, {
        alertOnDrop: req.body?.alertOnDrop !== false,
      })
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/** Public product status (alias of health snapshot) */
app.get('/status', async (_req, res) => {
  try {
    const snap = await collectOpsSnapshot()
    res.status(snap.ok ? 200 : 503).json({
      ok: snap.ok,
      product: 'Que',
      message: snap.ok
        ? 'All systems operational'
        : 'Degraded — database unreachable',
      ...snap,
    })
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err.message || err) })
  }
})

/* ── Gap close: workspace rules ── */
app.get('/workspaces/:workspaceId/rules', async (req, res) => {
  try {
    const items = await listWorkspaceRules(req.params.workspaceId)
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/rules',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await createWorkspaceRule(req.params.workspaceId, {
        ...req.body,
        userId: req.user?.id ?? null,
      })
      res.status(201).json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/rules/:ruleId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await updateWorkspaceRule(
        req.params.workspaceId,
        req.params.ruleId,
        req.body || {},
        req.user?.id ?? null,
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.delete(
  '/workspaces/:workspaceId/rules/:ruleId',
  requireMinRole('admin'),
  async (req, res) => {
    try {
      await deleteWorkspaceRule(req.params.workspaceId, req.params.ruleId)
      res.json({ ok: true })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Gap close: join comments ── */
app.get(
  '/workspaces/:workspaceId/relationships/:relationshipId/comments',
  async (req, res) => {
    try {
      const items = await listJoinComments(
        req.params.workspaceId,
        req.params.relationshipId,
      )
      res.json({ ok: true, items })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/relationships/:relationshipId/comments',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await addJoinComment(
        req.params.workspaceId,
        req.params.relationshipId,
        req.body?.body,
        req.user?.id ?? null,
        { parentId: req.body?.parentId || null },
      )
      res.status(201).json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Gap close: transform drafts ── */
app.get('/workspaces/:workspaceId/transforms', async (req, res) => {
  try {
    const items = await listTransformDrafts(req.params.workspaceId, {
      status: req.query.status,
    })
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/transforms',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await createTransformDraft(req.params.workspaceId, {
        prompt: req.body?.prompt,
        title: req.body?.title,
        userId: req.user?.id ?? null,
      })
      res.status(201).json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/transforms/:draftId', async (req, res) => {
  try {
    const item = await getTransformDraft(
      req.params.workspaceId,
      req.params.draftId,
    )
    if (!item) {
      res.status(404).json({ error: 'draft not found' })
      return
    }
    res.json({ ok: true, item })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/transforms/:draftId/review',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await reviewTransformDraft(
        req.params.workspaceId,
        req.params.draftId,
        req.body?.action,
        req.user?.id ?? null,
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Gap close: proposal diffs ── */
app.get('/workspaces/:workspaceId/proposals', async (req, res) => {
  try {
    const items = await listProposalDiffs(req.params.workspaceId, {
      status: req.query.status || 'open',
      limit: req.query.limit,
    })
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/proposals/:diffId/review',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await reviewProposalDiff(
        req.params.workspaceId,
        req.params.diffId,
        req.body?.action,
        req.user?.id ?? null,
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Gap close: metrics ── */
app.get('/workspaces/:workspaceId/metrics-defs', async (req, res) => {
  try {
    const items = await listMetrics(req.params.workspaceId)
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/metrics-defs',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await createMetric(req.params.workspaceId, {
        ...req.body,
        userId: req.user?.id ?? null,
      })
      res.status(201).json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/metrics-defs/:metricId',
  async (req, res) => {
    try {
      const item = await getMetric(
        req.params.workspaceId,
        req.params.metricId,
      )
      if (!item) {
        res.status(404).json({ error: 'metric not found' })
        return
      }
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.patch(
  '/workspaces/:workspaceId/metrics-defs/:metricId',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const item = await updateMetric(
        req.params.workspaceId,
        req.params.metricId,
        req.body || {},
        req.user?.id ?? null,
      )
      res.json({ ok: true, item })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get(
  '/workspaces/:workspaceId/metrics-defs/:metricId/preview',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await previewMetric(
        req.params.workspaceId,
        req.params.metricId,
      )
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/metrics-defs/:metricId/publish-bi',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await publishMetricToBi(
        req.params.workspaceId,
        req.params.metricId,
        req.user?.id ?? null,
      )
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Gap close: eval dashboard + contract tests ── */
app.get('/workspaces/:workspaceId/eval-dashboard', async (req, res) => {
  try {
    const dashboard = await getEvalDashboard(req.params.workspaceId)
    res.json({ ok: true, dashboard })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/eval-dashboard/golden',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await runGoldenEvalForDashboard(
        req.params.workspaceId,
        req.body?.pairs || [],
      )
      try {
        await recordGoldenEvalScore(req.params.workspaceId, {
          ...(out.report || {}),
          pairCount: Array.isArray(req.body?.pairs)
            ? req.body.pairs.length
            : null,
        })
      } catch {
        /* optional */
      }
      res.json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/contract-tests', async (req, res) => {
  try {
    const items = await listContractTestRuns(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/jobs/:jobId/contract-tests/run',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await runAndStoreContractTests(
        req.params.workspaceId,
        req.params.jobId,
        { userId: req.user?.id ?? null },
      )
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── Gap close: industry templates + marketplace ── */
app.get('/industry-templates', (req, res) => {
  res.json({
    ok: true,
    items: listIndustryTemplatePacks({
      industry: req.query.industry,
      tag: req.query.tag,
      q: req.query.q,
    }),
  })
})

app.get('/marketplace/packs', (req, res) => {
  res.json({
    ok: true,
    ...listMarketplaceCatalog({
      industry: req.query.industry,
      tag: req.query.tag,
      q: req.query.q,
    }),
  })
})

app.get('/workspaces/:workspaceId/marketplace/installs', async (req, res) => {
  try {
    const items = await listPackInstalls(req.params.workspaceId, {
      limit: req.query.limit,
    })
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/industry-templates/:packId/apply',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const out = await applyIndustryTemplatePack(
        req.params.workspaceId,
        req.params.packId,
        { userId: req.user?.id ?? null },
      )
      res.status(201).json({ ok: true, ...out })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── P2: presence ── */
app.get('/workspaces/:workspaceId/presence', async (req, res) => {
  try {
    const items = await listPresence(req.params.workspaceId)
    res.json({ ok: true, items })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/presence/heartbeat',
  requireMinRole('viewer'),
  async (req, res) => {
    try {
      const items = await heartbeatPresence(req.params.workspaceId, {
        userId: req.user?.id,
        displayName: req.user?.displayName || req.user?.name || '',
        email: req.user?.email || '',
        pagePath: req.body?.pagePath || '',
        status: req.body?.status || 'active',
      })
      res.json({ ok: true, items })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

/* ── P2: metric lineage ── */
app.get('/workspaces/:workspaceId/metrics-lineage', async (req, res) => {
  try {
    const graph = await getMetricLineage(req.params.workspaceId, null)
    res.json({ ok: true, ...graph })
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) })
  }
})

app.get(
  '/workspaces/:workspaceId/metrics-defs/:metricId/lineage',
  async (req, res) => {
    try {
      const graph = await getMetricLineage(
        req.params.workspaceId,
        req.params.metricId,
      )
      res.json({ ok: true, ...graph })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/workspaces/:workspaceId/bi-lineage', async (req, res) => {
  try {
    const items = await listLatestBiLineage(req.params.workspaceId)
    res.json({ ok: true, items })
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post(
  '/workspaces/:workspaceId/bi-lineage',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const result = await ingestBiLineage(req.params.workspaceId, req.body || {})
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.post(
  '/workspaces/:workspaceId/dbt-manifest',
  requireMinRole('member'),
  async (req, res) => {
    try {
      const manifest = req.body?.manifest || req.body
      const result = await ingestDbtManifest(req.params.workspaceId, manifest)
      res.json({ ok: true, ...result })
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) })
    }
  },
)

app.get('/', (_req, res) => {
  res.json({
    service: 'que-api',
    demoWorkspaceId: DEMO_WS,
    authDisabled: authDisabled(),
    endpoints: [
      'GET /health',
      'GET /metrics',
      'GET /metrics?format=prom',
      'GET /bi/embed/:token',
      'POST /auth/register',
      'POST /auth/login',
      'POST /auth/logout',
      'GET /auth/me',
      'GET /auth/sso',
      'GET /auth/sso/start',
      'GET /auth/sso/callback',
      'GET /openapi.json',
      'POST /auth/attestation/verify',
      'GET /workspaces',
      'POST /workspaces',
      'GET /workspaces/:workspaceId/members',
      'GET /workspaces/:workspaceId/audit-events',
      'GET /workspaces/:workspaceId/usage',
      'GET /workspaces/:workspaceId/pinned-samples',
      'GET /workspaces/:workspaceId/managed-datasets',
      'GET /workspaces/:workspaceId/bi/charts',
      'GET /workspaces/:workspaceId/enterprise/soc2-evidence',
      'GET /workspaces/:workspaceId/orchestrator',
      'PATCH /workspaces/:workspaceId/orchestrator',
      'POST /workspaces/:workspaceId/orchestrator/test',
      'POST /workspaces/:workspaceId/mapping-assist',
      'GET /workspaces/:workspaceId/mapping-assist/renames',
      'PATCH /workspaces/:workspaceId/mapping-assist/renames/:suggestionId',
      'GET /workspaces/:workspaceId/private-runner',
      'PATCH /workspaces/:workspaceId/private-runner',
      'POST /runner/callback',
      'GET /workspaces/:workspaceId/jobs/:jobId/validation-suite',
      'POST /workspaces/:workspaceId/jobs/:jobId/validation-suite/generate',
      'POST /workspaces/:workspaceId/jobs/:jobId/validation-suite/run',
      'GET /workspaces/:workspaceId/drift-fixes',
      'POST /workspaces/:workspaceId/drift-fixes/propose',
      'POST /workspaces/:workspaceId/drift-fixes/:suggestionId/resolve',
      'POST /workspaces/:workspaceId/joins/auto-promote-low-risk',
      'GET /workspaces/:workspaceId/agent/sessions',
      'POST /workspaces/:workspaceId/agent/sessions',
      'GET /workspaces/:workspaceId/billing',
      'POST /workspaces/:workspaceId/billing/checkout',
      'POST /workspaces/:workspaceId/billing/portal',
      'POST /billing/stripe/webhook',
      'GET /workspaces/:workspaceId/export-attestations',
      'GET /workspaces/:workspaceId/export-attestations/:eventId',
      'GET /workspaces/:workspaceId/export-attestations/:eventId/pack',
      'PATCH /workspaces/:workspaceId/members/:userId',
      'DELETE /workspaces/:workspaceId/members/:userId',
      'GET /workspaces/:workspaceId/invites',
      'POST /workspaces/:workspaceId/invites',
      'DELETE /workspaces/:workspaceId/invites/:inviteId',
      'POST /workspaces/:workspaceId/bi-lineage',
      'POST /workspaces/:workspaceId/dbt-manifest',
      'GET /workspaces/:workspaceId/sources',
      'POST /workspaces/:workspaceId/connections',
      'POST /workspaces/:workspaceId/connections/:connectionId/upload',
      'POST /workspaces/:workspaceId/uploads/spreadsheet',
      'PATCH /workspaces/:workspaceId/connections/:connectionId',
      'DELETE /workspaces/:workspaceId/connections/:connectionId',
      'GET /workspaces/:workspaceId/schema',
      'GET /workspaces/:workspaceId/context',
      'GET /workspaces/:workspaceId/settings',
      'PATCH /workspaces/:workspaceId/settings',
      'PUT /workspaces/:workspaceId/secrets/llm',
      'GET /workspaces/:workspaceId/secrets/status',
      'GET /workspaces/:workspaceId/jobs',
      'POST /workspaces/:workspaceId/jobs',
      'PATCH /workspaces/:workspaceId/jobs/:jobId',
      'POST /workspaces/:workspaceId/jobs/:jobId/export',
      'POST /workspaces/:workspaceId/jobs/:jobId/artifacts',
      'GET /workspaces/:workspaceId/artifacts',
      'POST /workspaces/:workspaceId/artifacts/:artifactId/revoke',
      'GET /artifacts/download/:token',
      'POST /workspaces/:workspaceId/jobs/:jobId/materialize',
      'GET /workspaces/:workspaceId/materializations',
      'GET /workspaces/:workspaceId/lineage',
      'POST /workspaces/:workspaceId/jobs/:jobId/run',
      'GET /workspaces/:workspaceId/jobs/:jobId/runs',
      'GET /workspaces/:workspaceId/jobs/:jobId/runs/:runId',
      'GET /workspaces/:workspaceId/jobs/:jobId/contract',
      'POST /workspaces/:workspaceId/jobs/:jobId/contract/freeze',
      'GET /workspaces/:workspaceId/jobs/:jobId/contract/validate',
      'GET /workspaces/:workspaceId/drift',
      'POST /workspaces/:workspaceId/drift/:eventId/ack',
      'POST /workspaces/:workspaceId/drift/:eventId/notify',
      'POST /workspaces/:workspaceId/drift/test-alert',
      'GET /workspaces/:workspaceId/events/outbox',
      'PUT /workspaces/:workspaceId/layout',
      'GET /workspaces/:workspaceId/join-reviews',
      'PATCH /workspaces/:workspaceId/relationships/:relationshipId',
      'POST /workspaces/:workspaceId/join-inference',
      'POST /workspaces/:workspaceId/stitch-session',
      'POST /workspaces/:workspaceId/connections/:connectionId/sync',
      'GET /workspaces/:workspaceId/sync-schedule',
      'POST /workspaces/:workspaceId/sync-schedule/run',
      'GET /workspaces/:workspaceId/jobs/schedule',
      'POST /workspaces/:workspaceId/jobs/schedule/run',
      'GET /workspaces/:workspaceId/job-runs',
      'POST /workspaces/:workspaceId/chat',
      'POST /workspaces/:workspaceId/chat/feedback',
      'GET /workspaces/:workspaceId/ai/status',
      'POST /workspaces/:workspaceId/ai/reindex',
    ],
  })
})

ensureDevUserPassword()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`que-api listening on http://localhost:${PORT}`)
      console.log(`demo workspace: ${DEMO_WS}`)
      console.log(
        authDisabled()
          ? 'auth: DISABLED (STITCH_AUTH_DISABLED — local only)'
          : 'auth: ON',
      )
      if (process.env.QUE_ENV === 'production' || process.env.NODE_ENV === 'production') {
        console.log('tls: terminate TLS at reverse proxy / load balancer (TLS 1.2+ required)')
      }
      startScheduledSyncLoop()
      startScheduledJobsLoop()
      startGoldenEvalLoop()
      // Offer B retention — purge expired managed datasets hourly
      setInterval(() => {
        void purgeExpiredManagedDatasets().catch((err) =>
          console.warn('[Que] managed retention purge:', err.message || err),
        )
      }, 60 * 60 * 1000)
      void purgeExpiredManagedDatasets().catch(() => undefined)
    })
  })
  .catch((err) => {
    console.error('Failed to boot auth seed', err)
    process.exit(1)
  })
