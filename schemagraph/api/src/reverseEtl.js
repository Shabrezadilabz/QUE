/**
 * Sprint 10 — Reverse ETL MVP: certified mart → Salesforce / HubSpot segment.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { listManagedDatasets } from './managedDataPlane.js'
import { recordAuditEvent } from './auditLog.js'

export const REVERSE_ETL_DESTINATIONS = ['salesforce', 'hubspot']

/** Pure plan builder for tests. */
export function buildReverseEtlPlanFromDataset(dataset, opts = {}) {
  const destination = String(opts.destination || 'salesforce').toLowerCase()
  return {
    kind: 'que.reverse_etl_plan',
    destination,
    segmentName: opts.segmentName || `Que cert — ${dataset?.name || 'mart'}`,
    dataset: dataset ? { id: dataset.id, name: dataset.name } : null,
    status: dataset?.certified ? 'ready' : 'certified_dataset_required',
  }
}

/**
 * @param {string} workspaceId
 * @param {{ destination?: string, datasetId?: string, segmentName?: string }} opts
 */
export async function planReverseEtlSegment(workspaceId, opts = {}) {
  const destination = String(opts.destination || 'salesforce').toLowerCase()
  if (!REVERSE_ETL_DESTINATIONS.includes(destination)) {
    const err = new Error(
      `destination must be one of: ${REVERSE_ETL_DESTINATIONS.join(', ')}`,
    )
    err.status = 400
    throw err
  }

  const datasets = await listManagedDatasets(workspaceId)
  const certified = datasets.filter((d) => d.certified)
  const dataset =
    certified.find((d) => d.id === opts.datasetId) ||
    certified.find((d) => d.slug?.includes('brand-revenue')) ||
    certified[0] ||
    null

  const segmentName =
    opts.segmentName ||
    (dataset ? `Que cert — ${dataset.name}` : 'Que certified segment')

  return {
    schemaVersion: 1,
    kind: 'que.reverse_etl_plan',
    destination,
    segmentName,
    dataset: dataset
      ? { id: dataset.id, name: dataset.name, rowCount: dataset.rowCount ?? null }
      : null,
    status: dataset ? 'ready' : 'certified_dataset_required',
    mapping:
      destination === 'salesforce'
        ? {
            object: 'Contact',
            emailField: 'email',
            upsertKey: 'Email',
            customFields: ['certified_mart_id', 'last_cert_at'],
          }
        : {
            object: 'contacts',
            emailProperty: 'email',
            listId: 'que-certified-segment',
          },
    mode: 'fixture',
    steps: [
      'Select certified managed dataset (mart)',
      'Map email / account key columns',
      'Push segment rows to destination API',
      'Audit trail + steward inbox on failure',
    ],
    limitations: [
      'S10 MVP uses fixture/simulated push — live OAuth in production hardening',
      'Max 500 rows per push in MVP',
    ],
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Simulated reverse ETL push — records audit + optional segment row stub.
 */
export async function pushReverseEtlSegment(workspaceId, body = {}, userId = null) {
  const plan = await planReverseEtlSegment(workspaceId, {
    destination: body.destination,
    datasetId: body.datasetId,
    segmentName: body.segmentName,
  })
  if (plan.status !== 'ready') {
    const err = new Error('Certified dataset required for reverse ETL')
    err.status = 400
    throw err
  }

  const rowLimit = Math.min(Number(body.maxRows) || 500, 500)
  const pushedRows = Math.min(rowLimit, Number(plan.dataset?.rowCount) || 100)

  const pushId = randomUUID()

  try {
    await query(
      `INSERT INTO workspace_audit_events (
         workspace_id, actor_user_id, action, resource_type, resource_id, summary, meta_json
       ) VALUES ($1,$2,'reverse_etl.push','managed_dataset',$3,$4,$5::jsonb)`,
      [
        workspaceId,
        userId,
        plan.dataset.id,
        `${plan.destination} segment "${plan.segmentName}" — ${pushedRows} rows (simulated)`,
        JSON.stringify({
          pushId,
          destination: plan.destination,
          segmentName: plan.segmentName,
          pushedRows,
          mode: 'fixture',
        }),
      ],
    )
  } catch {
    /* audit optional in unit env */
  }

  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'reverse_etl.push',
    resourceType: 'managed_dataset',
    resourceId: plan.dataset.id,
    summary: `Reverse ETL → ${plan.destination}: ${pushedRows} rows`,
    meta: { segmentName: plan.segmentName, mode: 'fixture' },
  })

  return {
    ok: true,
    pushId,
    plan,
    pushedRows,
    destination: plan.destination,
    segmentName: plan.segmentName,
    note: 'Simulated push — configure live Salesforce/HubSpot OAuth for production',
  }
}
