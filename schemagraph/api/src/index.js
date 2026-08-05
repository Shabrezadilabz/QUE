import express from 'express'
import cors from 'cors'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from './db.js'
import { syncConnection } from './syncConnection.js'
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
  login,
  logout,
  optionalAuth,
  register,
  requireAuth,
  requireMinRole,
  requireWorkspaceMember,
} from './auth.js'
import {
  buildAuthorizeRedirectUrl,
  buildSsoErrorRedirect,
  completeOidcCallback,
} from './oidc.js'
import { requestLogMiddleware } from './logger.js'
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
} from './materialize.js'
import { getWorkspaceLineageLite } from './lineageLite.js'

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
app.use(express.json({ limit: '4mb' }))
app.use(requestLogMiddleware)

app.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1')
    res.json({
      ok: true,
      service: 'que-api',
      authDisabled: authDisabled(),
      sso: getSsoConfig().status,
    })
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err.message || err) })
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

    const relationships = rels.rows.map((r) => ({
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
 * Promote or reject a Stitch Relation.
 * Body: { action: 'promote' | 'reject' }
 * - promote → status=accepted, relation_type=explicit
 * - reject  → status=rejected (hidden from schema GET)
 */
app.patch(
  '/workspaces/:workspaceId/relationships/:relationshipId',
  requireMinRole('member'),
  async (req, res) => {
    const { workspaceId, relationshipId } = req.params
    const action = req.body?.action
    if (action !== 'promote' && action !== 'reject') {
      res.status(400).json({ error: "body.action must be 'promote' or 'reject'" })
      return
    }
    try {
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

      const { rows } = await query(
        `UPDATE relationships SET
           status = $3,
           relation_type = COALESCE($4, relation_type),
           confidence = $5,
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
      res.status(500).json({ error: String(err.message || err) })
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
      const result = await syncConnection(workspaceId, connectionId)
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
      'GET /workspaces/:workspaceId/orchestrator',
      'PATCH /workspaces/:workspaceId/orchestrator',
      'POST /workspaces/:workspaceId/orchestrator/test',
      'POST /workspaces/:workspaceId/mapping-assist',
      'GET /workspaces/:workspaceId/mapping-assist/renames',
      'PATCH /workspaces/:workspaceId/mapping-assist/renames/:suggestionId',
      'GET /workspaces/:workspaceId/private-runner',
      'PATCH /workspaces/:workspaceId/private-runner',
      'POST /runner/callback',
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
    })
  })
  .catch((err) => {
    console.error('Failed to boot auth seed', err)
    process.exit(1)
  })
