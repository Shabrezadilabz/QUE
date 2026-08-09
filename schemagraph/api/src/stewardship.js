/**
 * Phase 4 — Stewardship: certify / expire assets, tables, terms, joins.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

const TARGET_KINDS = [
  'table',
  'column',
  'join',
  'job',
  'glossary_term',
  'catalog_asset',
  'domain',
]

function mapCert(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    targetKind: r.target_kind,
    targetId: r.target_id,
    targetLabel: r.target_label || '',
    status: r.status,
    certifiedBy: r.certified_by,
    certifiedByEmail: r.certified_by_email || null,
    note: r.note || '',
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expired:
      r.status === 'expired' ||
      (r.expires_at && new Date(r.expires_at).getTime() < Date.now()),
  }
}

export async function listCertifications(workspaceId, { status = 'all' } = {}) {
  // Expire due rows lazily
  await query(
    `UPDATE stewardship_certifications
     SET status = 'expired', updated_at = now()
     WHERE workspace_id = $1
       AND status = 'certified'
       AND expires_at IS NOT NULL
       AND expires_at < now()`,
    [workspaceId],
  )

  const params = [workspaceId]
  let where = 'c.workspace_id = $1'
  if (status && status !== 'all') {
    params.push(status)
    where += ` AND c.status = $${params.length}`
  }
  const { rows } = await query(
    `SELECT c.*, u.email AS certified_by_email
     FROM stewardship_certifications c
     LEFT JOIN users u ON u.id = c.certified_by
     WHERE ${where}
     ORDER BY c.updated_at DESC
     LIMIT 200`,
    params,
  )
  return rows.map(mapCert)
}

export async function certifyTarget(workspaceId, body = {}, userId = null) {
  const targetKind = String(body.targetKind || '').trim()
  const targetId = String(body.targetId || '').trim()
  if (!TARGET_KINDS.includes(targetKind) || !targetId) {
    const err = new Error('targetKind and targetId required')
    err.status = 400
    throw err
  }
  const days = Number(body.expiresInDays)
  const expiresAt =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 86400000).toISOString()
      : body.expiresAt || null

  // Replace open certification for same target
  await query(
    `UPDATE stewardship_certifications
     SET status = 'superseded', updated_at = now()
     WHERE workspace_id = $1 AND target_kind = $2 AND target_id = $3
       AND status = 'certified'`,
    [workspaceId, targetKind, targetId],
  )

  const id = randomUUID()
  await query(
    `INSERT INTO stewardship_certifications (
       id, workspace_id, target_kind, target_id, target_label,
       status, certified_by, note, expires_at
     ) VALUES ($1,$2,$3,$4,$5,'certified',$6,$7,$8)`,
    [
      id,
      workspaceId,
      targetKind,
      targetId,
      String(body.targetLabel || targetId).slice(0, 200),
      userId,
      String(body.note || '').slice(0, 2000),
      expiresAt,
    ],
  )
  const list = await listCertifications(workspaceId)
  return list.find((c) => c.id === id)
}

export async function expireCertification(workspaceId, certId, userId = null) {
  const { rows } = await query(
    `UPDATE stewardship_certifications
     SET status = 'expired', updated_at = now(),
         note = CASE WHEN $3::text IS NULL THEN note
                     ELSE note || E'\n[expired by steward]' END
     WHERE workspace_id = $1 AND id = $2
     RETURNING id`,
    [workspaceId, certId, userId],
  )
  if (!rows[0]) {
    const err = new Error('certification not found')
    err.status = 404
    throw err
  }
  const list = await listCertifications(workspaceId)
  return list.find((c) => c.id === certId)
}

/**
 * Steward queue: uncertified high-value targets (tables with accepted joins, domains).
 */
export async function getStewardQueue(workspaceId) {
  const { rows: tables } = await query(
    `SELECT o.id, o.name,
            COUNT(DISTINCT r.id)::int AS join_count
     FROM schema_objects o
     LEFT JOIN relationships r ON r.workspace_id = o.workspace_id
       AND r.status = 'accepted'
       AND (r.from_object_id = o.id OR r.to_object_id = o.id)
     WHERE o.workspace_id = $1
     GROUP BY o.id, o.name
     HAVING COUNT(DISTINCT r.id) > 0
     ORDER BY join_count DESC
     LIMIT 40`,
    [workspaceId],
  )

  const certs = await listCertifications(workspaceId, { status: 'certified' })
  const certifiedTables = new Set(
    certs
      .filter((c) => c.targetKind === 'table' && !c.expired)
      .map((c) => c.targetId),
  )

  const needsCert = tables
    .filter((t) => !certifiedTables.has(t.id))
    .map((t) => ({
      targetKind: 'table',
      targetId: t.id,
      targetLabel: t.name,
      reason: `${t.join_count} accepted join(s) — uncertified`,
    }))

  const expiring = certs.filter((c) => {
    if (!c.expiresAt || c.status !== 'certified') return false
    const ms = new Date(c.expiresAt).getTime() - Date.now()
    return ms > 0 && ms < 14 * 86400000
  })

  return {
    needsCertification: needsCert.slice(0, 25),
    expiringSoon: expiring.slice(0, 25),
    certifiedCount: certs.filter((c) => c.status === 'certified' && !c.expired)
      .length,
  }
}
