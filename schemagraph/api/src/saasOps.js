/**
 * SaaS ops — metadata backups + DR drill records (compliance evidence).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { runTenantIsolationTests } from './tenantIsolation.js'

export async function createMetadataBackup(
  workspaceId,
  { label = '', userId = null } = {},
) {
  const [settings, connections, jobs, relationships, rules] = await Promise.all([
    getWorkspaceSettings(workspaceId),
    query(
      `SELECT id, name, source_type, status, sync_schedule, sync_next_at
       FROM connections WHERE workspace_id = $1`,
      [workspaceId],
    ),
    query(
      `SELECT id, title, status FROM jobs WHERE workspace_id = $1`,
      [workspaceId],
    ),
    query(
      `SELECT id, status, relation_type, confidence, label
       FROM relationships WHERE workspace_id = $1`,
      [workspaceId],
    ),
    query(
      `SELECT id, kind, title, enabled, source FROM workspace_rules
       WHERE workspace_id = $1`,
      [workspaceId],
    ).catch(() => ({ rows: [] })),
  ])

  const payload = {
    schemaVersion: 1,
    kind: 'que.metadata_backup',
    workspace: settings?.workspace || { id: workspaceId },
    settings: settings?.settings || {},
    connections: connections.rows,
    jobs: jobs.rows,
    relationships: relationships.rows,
    rules: rules.rows,
    exportedAt: new Date().toISOString(),
    note: 'Metadata-only backup — no managed row payloads, no secrets',
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  const id = randomUUID()
  await query(
    `INSERT INTO workspace_backup_snapshots (
       id, workspace_id, label, kind, payload_json, bytes_estimate, created_by
     ) VALUES ($1,$2,$3,'metadata',$4::jsonb,$5,$6)`,
    [
      id,
      workspaceId,
      String(label || `backup-${new Date().toISOString().slice(0, 10)}`).slice(
        0,
        120,
      ),
      JSON.stringify(payload),
      bytes,
      userId,
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'backup.create',
    resourceType: 'backup',
    resourceId: id,
    summary: `Metadata backup (${bytes} bytes)`,
  })
  return {
    id,
    label: label || payload.exportedAt,
    kind: 'metadata',
    bytesEstimate: bytes,
    createdAt: new Date().toISOString(),
  }
}

export async function listBackups(workspaceId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT id, label, kind, bytes_estimate, created_at, created_by
     FROM workspace_backup_snapshots
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(50, Math.max(1, Number(limit) || 20))],
  )
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    bytesEstimate: Number(r.bytes_estimate || 0),
    createdAt: r.created_at,
    createdBy: r.created_by,
  }))
}

export async function getBackup(workspaceId, backupId) {
  const { rows } = await query(
    `SELECT * FROM workspace_backup_snapshots
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, backupId],
  )
  if (!rows[0]) return null
  return {
    id: rows[0].id,
    label: rows[0].label,
    kind: rows[0].kind,
    bytesEstimate: Number(rows[0].bytes_estimate || 0),
    payload: rows[0].payload_json,
    createdAt: rows[0].created_at,
  }
}

/**
 * DR drill: backup + isolation test + health assertions.
 */
export async function runDrDrill(workspaceId, { userId = null } = {}) {
  const started = Date.now()
  const steps = []
  let status = 'passed'

  try {
    const backup = await createMetadataBackup(workspaceId, {
      label: `dr-drill-${Date.now()}`,
      userId,
    })
    steps.push({ step: 'metadata_backup', ok: true, backupId: backup.id })
  } catch (err) {
    status = 'failed'
    steps.push({
      step: 'metadata_backup',
      ok: false,
      error: String(err.message || err),
    })
  }

  try {
    const iso = await runTenantIsolationTests(workspaceId)
    const ok =
      iso?.status === 'passed' ||
      iso?.ok === true ||
      (Array.isArray(iso?.checks) && iso.checks.every((c) => c.ok))
    if (!ok) status = 'failed'
    steps.push({
      step: 'tenant_isolation',
      ok,
      detail: iso?.summary || iso?.status || `${iso?.checks?.length || 0} checks`,
    })
  } catch (err) {
    status = 'failed'
    steps.push({
      step: 'tenant_isolation',
      ok: false,
      error: String(err.message || err),
    })
  }

  try {
    await query('SELECT 1')
    steps.push({ step: 'db_ping', ok: true })
  } catch (err) {
    status = 'failed'
    steps.push({
      step: 'db_ping',
      ok: false,
      error: String(err.message || err),
    })
  }

  const durationMs = Date.now() - started
  const summary =
    status === 'passed'
      ? `DR drill passed in ${durationMs}ms`
      : `DR drill failed in ${durationMs}ms`
  const id = randomUUID()
  await query(
    `INSERT INTO dr_drill_runs (
       id, workspace_id, status, summary, evidence_json, created_by
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [
      id,
      workspaceId,
      status,
      summary,
      JSON.stringify({ steps, durationMs }),
      userId,
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'dr_drill.run',
    resourceType: 'dr_drill',
    resourceId: id,
    summary,
  })
  return { id, status, summary, steps, durationMs }
}

export async function listDrDrills(workspaceId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT * FROM dr_drill_runs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(50, Math.max(1, Number(limit) || 20))],
  )
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    summary: r.summary,
    evidence:
      r.evidence_json && typeof r.evidence_json === 'object'
        ? r.evidence_json
        : {},
    createdAt: r.created_at,
  }))
}

export async function getSaasOpsSummary(workspaceId) {
  const [backups, drills, isolation] = await Promise.all([
    listBackups(workspaceId, { limit: 5 }),
    listDrDrills(workspaceId, { limit: 5 }),
    query(
      `SELECT status, created_at FROM tenant_isolation_runs
       WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    ).catch(() => ({ rows: [] })),
  ])
  const lastDrill = drills[0] || null
  const lastBackup = backups[0] || null
  const lastIso = isolation.rows[0] || null
  const checklist = [
    {
      id: 'backup',
      title: 'Metadata backup exists',
      done: Boolean(lastBackup),
      evidence: lastBackup
        ? `${lastBackup.label} · ${lastBackup.createdAt}`
        : 'none',
    },
    {
      id: 'dr_drill',
      title: 'DR drill recorded (90d)',
      done: Boolean(
        lastDrill &&
          Date.now() - new Date(lastDrill.createdAt).getTime() <
            90 * 24 * 3600 * 1000,
      ),
      evidence: lastDrill
        ? `${lastDrill.status} · ${lastDrill.createdAt}`
        : 'none',
    },
    {
      id: 'isolation',
      title: 'Tenant isolation test',
      done: Boolean(lastIso),
      evidence: lastIso
        ? `${lastIso.status} · ${lastIso.created_at}`
        : 'none',
    },
  ]
  const done = checklist.filter((c) => c.done).length
  return {
    progressPct: Math.round((done / checklist.length) * 100),
    checklist,
    lastBackup,
    lastDrill,
  }
}
