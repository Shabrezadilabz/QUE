/**
 * CEO P0 — Ship to BI (draft → approve → embed) + rollback.
 * Keeps Jobs/notebook off the CEO path; uses certified BI when possible.
 */
import { randomUUID, createHmac } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import {
  createBiChart,
  updateBiChart,
  mintBiEmbedToken,
  revokeBiEmbedToken,
  getBiChart,
} from './certifiedBi.js'

function mapShip(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    outcomeId: r.outcome_id,
    chartId: r.chart_id,
    embedTokenId: r.embed_token_id,
    status: r.status,
    title: r.title,
    attestation:
      r.attestation_json && typeof r.attestation_json === 'object'
        ? r.attestation_json
        : {},
    config: r.config_json && typeof r.config_json === 'object' ? r.config_json : {},
    createdBy: r.created_by,
    rolledBackAt: r.rolled_back_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function fingerprint(payload) {
  const secret =
    process.env.QUE_ATTESTATION_HMAC_SECRET ||
    process.env.QUE_SECRETS_KEY ||
    'que-local-dev-attestation'
  return createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex')
}

export async function listShipEvents(workspaceId, { limit = 40 } = {}) {
  const { rows } = await query(
    `SELECT * FROM workspace_ship_events
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(Math.max(Number(limit) || 40, 1), 100)],
  )
  return rows.map(mapShip)
}

export async function getShipEvent(workspaceId, shipId) {
  const { rows } = await query(
    `SELECT * FROM workspace_ship_events WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, shipId],
  )
  return rows[0] ? mapShip(rows[0]) : null
}

/**
 * Create draft chart + ship event from CEO outcome / freeform title.
 */
export async function createShipDraft(
  workspaceId,
  {
    title,
    outcomeId = null,
    datasetId = null,
    chartType = 'bar',
    description = '',
    config = {},
    userId = null,
  } = {},
) {
  const name = String(title || '').trim() || 'Untitled outcome chart'
  const chart = await createBiChart(workspaceId, {
    title: name,
    description:
      description ||
      'CEO Ship-to-BI draft — schema-first; certify dataset before live embed.',
    chartType,
    datasetId,
    config: {
      ...config,
      ceoShip: true,
      custody: 'schema_first_no_lake',
    },
    certify: false,
    userId,
  })

  const attestationBody = {
    kind: 'que.ship_to_bi.draft',
    workspaceId,
    chartId: chart.id,
    outcomeId,
    title: name,
    custody: 'schema_first',
    at: new Date().toISOString(),
  }
  const attestation = {
    ...attestationBody,
    fingerprint: fingerprint(attestationBody),
  }

  const id = randomUUID()
  await query(
    `INSERT INTO workspace_ship_events (
       id, workspace_id, outcome_id, chart_id, status, title,
       attestation_json, config_json, created_by
     ) VALUES ($1,$2,$3,$4,'draft',$5,$6::jsonb,$7::jsonb,$8)`,
    [
      id,
      workspaceId,
      outcomeId,
      chart.id,
      name.slice(0, 200),
      JSON.stringify(attestation),
      JSON.stringify({ chartType, datasetId, ceoShip: true }),
      userId,
    ],
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'ship.draft',
    resourceType: 'ship_event',
    resourceId: id,
    summary: `Ship draft “${name}”`,
  })

  return getShipEvent(workspaceId, id)
}

/**
 * Approve ship: certify chart when possible, mint embed, stamp attestation.
 */
export async function approveShip(workspaceId, shipId, userId = null) {
  const ship = await getShipEvent(workspaceId, shipId)
  if (!ship) {
    const err = new Error('ship event not found')
    err.status = 404
    throw err
  }
  if (ship.status === 'rolled_back') {
    const err = new Error('ship already rolled back')
    err.status = 400
    throw err
  }

  let chart = ship.chartId
    ? await getBiChart(workspaceId, ship.chartId)
    : null
  let embed = null
  let certifyError = null

  if (chart) {
    try {
      chart = await updateBiChart(
        workspaceId,
        chart.id,
        { certified: true },
        userId,
      )
    } catch (e) {
      certifyError = String(e.message || e)
      // Still allow approve as "approved_pending_dataset" without embed
    }
    if (chart?.certified) {
      try {
        embed = await mintBiEmbedToken(workspaceId, chart.id, {
          userId,
          label: `CEO ship ${ship.id.slice(0, 8)}`,
        })
      } catch (e) {
        certifyError = certifyError || String(e.message || e)
      }
    }
  }

  const attestationBody = {
    kind: 'que.ship_to_bi.approved',
    workspaceId,
    shipId,
    chartId: chart?.id || ship.chartId,
    outcomeId: ship.outcomeId,
    title: ship.title,
    certified: Boolean(chart?.certified),
    embedTokenId: embed?.tokenId || null,
    custody: 'schema_first',
    at: new Date().toISOString(),
  }
  const attestation = {
    ...attestationBody,
    fingerprint: fingerprint(attestationBody),
    priorFingerprint: ship.attestation?.fingerprint || null,
  }

  const status = embed?.tokenId
    ? 'live'
    : chart?.certified
      ? 'approved'
      : 'approved_pending_dataset'

  await query(
    `UPDATE workspace_ship_events SET
       status = $3,
       embed_token_id = $4,
       attestation_json = $5::jsonb,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [
      workspaceId,
      shipId,
      status,
      embed?.tokenId || null,
      JSON.stringify(attestation),
    ],
  )

  if (ship.outcomeId) {
    await query(
      `UPDATE workspace_outcomes
       SET status = 'done', updated_at = now()
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, ship.outcomeId],
    ).catch(() => {})
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'ship.approve',
    resourceType: 'ship_event',
    resourceId: shipId,
    summary: `Ship approved (${status})`,
  })

  const out = await getShipEvent(workspaceId, shipId)
  return {
    ship: out,
    embedUrl: embed?.token ? `/embed/${embed.token}` : null,
    embedToken: embed?.token || null,
    certifyError,
    verifyHint:
      'Paste attestation_json into /verify (HMAC) for auditor diligence.',
  }
}

/**
 * Rollback: revoke embed, uncertify chart, optional warehouse DROP, mark rolled_back.
 */
export async function rollbackShip(workspaceId, shipId, userId = null) {
  const ship = await getShipEvent(workspaceId, shipId)
  if (!ship) {
    const err = new Error('ship event not found')
    err.status = 404
    throw err
  }
  if (ship.status === 'rolled_back') {
    return { ship, already: true }
  }

  if (ship.embedTokenId) {
    try {
      await revokeBiEmbedToken(workspaceId, ship.embedTokenId)
    } catch {
      /* token may already be gone */
    }
  }

  if (ship.chartId) {
    try {
      await updateBiChart(
        workspaceId,
        ship.chartId,
        { certified: false },
        userId,
      )
    } catch {
      /* optional */
    }
  }

  let warehouseRollback = null
  const matId =
    ship.config?.materializationId ||
    ship.attestation?.materializationId ||
    null
  const jobId = ship.config?.jobId || null
  try {
    const { dropMaterialization, listMaterializations } = await import(
      './materialize.js'
    )
    let targetId = matId
    if (!targetId && jobId) {
      const mats = await listMaterializations(workspaceId, {
        jobId,
        limit: 5,
      })
      const hit = mats.find((m) => m.status === 'succeeded' && !m.meta?.rolledBackAt)
      targetId = hit?.id || null
    }
    if (targetId) {
      warehouseRollback = await dropMaterialization(workspaceId, targetId, {
        confirm: true,
        actorUserId: userId,
      })
    }
  } catch (e) {
    warehouseRollback = {
      ok: false,
      error: String(e.message || e),
      note: 'BI rollback still applied; warehouse DROP failed or unsupported',
    }
  }

  const attestationBody = {
    kind: 'que.ship_to_bi.rollback',
    workspaceId,
    shipId,
    chartId: ship.chartId,
    materializationId: warehouseRollback?.materializationId || matId,
    warehouseQualifiedName: warehouseRollback?.qualifiedName || null,
    priorFingerprint: ship.attestation?.fingerprint || null,
    custody: 'schema_first',
    at: new Date().toISOString(),
  }
  const attestation = {
    ...attestationBody,
    fingerprint: fingerprint(attestationBody),
  }

  await query(
    `UPDATE workspace_ship_events SET
       status = 'rolled_back',
       rolled_back_at = now(),
       attestation_json = $3::jsonb,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, shipId, JSON.stringify(attestation)],
  )

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'ship.rollback',
    resourceType: 'ship_event',
    resourceId: shipId,
    summary: `Ship rolled back “${ship.title}”`,
    meta: {
      warehouseRollback: Boolean(warehouseRollback?.ok),
      materializationId: warehouseRollback?.materializationId || null,
    },
  })

  return {
    ship: await getShipEvent(workspaceId, shipId),
    already: false,
    warehouseRollback,
  }
}

/**
 * Link a job/materialization to a ship event for warehouse rollback.
 */
export async function linkShipMaterialization(
  workspaceId,
  shipId,
  { jobId = null, materializationId = null, userId = null } = {},
) {
  const ship = await getShipEvent(workspaceId, shipId)
  if (!ship) {
    const err = new Error('ship event not found')
    err.status = 404
    throw err
  }
  const nextConfig = {
    ...ship.config,
    ...(jobId ? { jobId } : {}),
    ...(materializationId ? { materializationId } : {}),
  }
  await query(
    `UPDATE workspace_ship_events
     SET config_json = $3::jsonb, updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, shipId, JSON.stringify(nextConfig)],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'ship.link_materialization',
    resourceType: 'ship_event',
    resourceId: shipId,
    summary: 'Linked materialization/job for warehouse rollback',
    meta: { jobId, materializationId },
  })
  return getShipEvent(workspaceId, shipId)
}

/**
 * S3.2 — One-click ship certified pack to BI (Looker + Metabase export + embed ship).
 */
export async function shipCertifiedPackToBi(
  workspaceId,
  {
    packId = 'ecommerce-v1',
    reportId = 'ceo-revenue',
    userId = null,
    title = null,
  } = {},
) {
  const { getIndustryPack } = await import('./packs/index.js')
  const {
    exportLookerPack,
    exportMetabasePack,
    formatBiExportMarkdown,
  } = await import('./biPlatformExport.js')
  const { getCertChecklist } = await import('./certChecklist.js')

  const pack = getIndustryPack(packId)
  if (!pack) {
    const err = new Error('industry pack not found')
    err.status = 404
    throw err
  }

  const checklist = await getCertChecklist(workspaceId, { packId })
  if (!checklist.canShipToBi) {
    const err = new Error(
      checklist.allGreen
        ? 'Pack certification must pass before shipping to BI'
        : 'Complete the steward cert checklist before shipping to BI',
    )
    err.status = 400
    err.checklist = checklist
    throw err
  }

  const looker = await exportLookerPack(workspaceId, { reportId, packId })
  const metabase = await exportMetabasePack(workspaceId, { reportId })

  let ship = null
  if (userId) {
    const draft = await createShipDraft(workspaceId, {
      title: title || `${pack.displayName} — CEO dashboard`,
      userId,
      config: { packId, reportId, source: 'cert_happy_path' },
    })
    ship = await approveShip(workspaceId, draft.id, userId)
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'ship.certified_pack',
    resourceType: 'bi_report',
    resourceId: reportId,
    summary: `Ship-to-BI happy path — ${pack.displayName}`,
    meta: {
      packId,
      lookerFiles: looker.files?.length || 0,
      metabaseCards: metabase.dashboard?.cards?.length || 0,
      shipId: ship?.id || null,
    },
  })

  return {
    packId,
    reportId,
    checklist,
    looker,
    metabase,
    lookerMarkdown: formatBiExportMarkdown(looker),
    ship,
  }
}
