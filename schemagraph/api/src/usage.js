/**
 * Wave 1.5 — workspace usage counters (billing precursor).
 * Inventory + period activity from audit / export tables.
 * Soft plan limits via QUE_PLAN_* env (never hard-block in this ticket).
 */
import { query } from './db.js'

function planLimits() {
  const n = (key, fallback) => {
    const v = Number(process.env[key])
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return {
    planName: String(process.env.QUE_PLAN_NAME || 'pilot').trim() || 'pilot',
    maxConnections: n('QUE_PLAN_MAX_CONNECTIONS', 10),
    maxMembers: n('QUE_PLAN_MAX_MEMBERS', 20),
    maxSyncsPerPeriod: n('QUE_PLAN_MAX_SYNCS_MONTH', 500),
    maxExportsPerPeriod: n('QUE_PLAN_MAX_EXPORTS_MONTH', 100),
    periodDays: n('QUE_PLAN_PERIOD_DAYS', 30),
  }
}

function pct(used, max) {
  if (!max || max <= 0) return 0
  return Math.min(100, Math.round((used / max) * 1000) / 10)
}

async function countAudit(workspaceId, actions, sinceIso) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
     FROM workspace_audit_events
     WHERE workspace_id = $1
       AND action = ANY($2::text[])
       AND created_at >= $3::timestamptz`,
    [workspaceId, actions, sinceIso],
  )
  return rows[0]?.n ?? 0
}

async function countExportsTable(workspaceId, sinceIso) {
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n
       FROM export_audit_events
       WHERE workspace_id = $1 AND created_at >= $2::timestamptz`,
      [workspaceId, sinceIso],
    )
    return rows[0]?.n ?? 0
  } catch {
    return null
  }
}

/**
 * @param {string} workspaceId
 */
export async function getWorkspaceUsage(workspaceId) {
  const limits = planLimits()
  const since = new Date(
    Date.now() - limits.periodDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [inv, syncOk, syncFail, promote, exportAudit, exportTable, members, bill] =
    await Promise.all([
      query(
        `SELECT
           (SELECT COUNT(*)::int FROM connections WHERE workspace_id = $1) AS connections,
           (SELECT COUNT(*)::int FROM schema_objects WHERE workspace_id = $1) AS tables,
           (SELECT COUNT(*)::int FROM relationships
              WHERE workspace_id = $1 AND status <> 'rejected') AS relationships,
           (SELECT COUNT(*)::int FROM jobs WHERE workspace_id = $1) AS jobs,
           (SELECT COUNT(*)::int FROM connections
              WHERE workspace_id = $1 AND status = 'error') AS connections_error,
           (SELECT COUNT(*)::int FROM connections
              WHERE workspace_id = $1 AND last_sync_at IS NOT NULL) AS connections_synced`,
        [workspaceId],
      ),
      countAudit(workspaceId, ['connection.sync'], since),
      countAudit(workspaceId, ['connection.sync_failed'], since),
      countAudit(workspaceId, ['relationship.promote'], since),
      countAudit(workspaceId, ['job.export'], since),
      countExportsTable(workspaceId, since),
      query(
        `SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1`,
        [workspaceId],
      ),
      query(
        `SELECT seat_count, billing_status FROM workspaces WHERE id = $1`,
        [workspaceId],
      ).catch(() => ({ rows: [{ seat_count: 0, billing_status: 'none' }] })),
    ])

  const seatCount = bill.rows[0]?.seat_count ?? 0
  const maxMembers =
    seatCount > 0 ? seatCount : limits.maxMembers

  const inventory = {
    connections: inv.rows[0].connections,
    connectionsError: inv.rows[0].connections_error,
    connectionsSynced: inv.rows[0].connections_synced,
    tables: inv.rows[0].tables,
    relationships: inv.rows[0].relationships,
    jobs: inv.rows[0].jobs,
    members: members.rows[0].n,
  }

  const exports =
    exportTable != null ? Math.max(exportTable, exportAudit) : exportAudit

  const period = {
    days: limits.periodDays,
    since,
    syncs: syncOk,
    syncFailures: syncFail,
    exports,
    joinPromotes: promote,
  }

  const againstLimits = {
    connections: {
      used: inventory.connections,
      max: limits.maxConnections,
      pct: pct(inventory.connections, limits.maxConnections),
    },
    members: {
      used: inventory.members,
      max: maxMembers,
      pct: pct(inventory.members, maxMembers),
    },
    syncs: {
      used: period.syncs,
      max: limits.maxSyncsPerPeriod,
      pct: pct(period.syncs, limits.maxSyncsPerPeriod),
    },
    exports: {
      used: period.exports,
      max: limits.maxExportsPerPeriod,
      pct: pct(period.exports, limits.maxExportsPerPeriod),
    },
  }

  const usagePct = Math.max(
    againstLimits.connections.pct,
    againstLimits.members.pct,
    againstLimits.syncs.pct,
    againstLimits.exports.pct,
  )

  const nearLimit = Object.entries(againstLimits)
    .filter(([, v]) => v.pct >= 80)
    .map(([k]) => k)

  return {
    plan: {
      name: limits.planName,
      softLimits: true,
      seatCount,
      billingStatus: bill.rows[0]?.billing_status || 'none',
      note:
        seatCount > 0
          ? 'Wave 4.6 — seat_count from Stripe soft-enforces max members.'
          : 'Soft pilot limits — not enforced. Billing precursor.',
    },
    inventory,
    period,
    againstLimits,
    usagePct,
    nearLimit,
  }
}
