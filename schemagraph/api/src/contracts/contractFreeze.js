/**
 * Build / validate Que stitch contracts (schema snapshot + promoted joins).
 */
import { query } from '../db.js'

/**
 * Latest schema snapshot for workspace (or null).
 */
export async function getLatestSnapshot(workspaceId) {
  const { rows } = await query(
    `SELECT id, label, created_at, graph_json
     FROM schema_snapshots
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId],
  )
  return rows[0] || null
}

/**
 * Load table+column type cards for named tables (current live schema).
 */
export async function loadTableTypeCards(workspaceId, tableNames = []) {
  const names = [...new Set((tableNames || []).map(String).filter(Boolean))]
  if (names.length === 0) {
    const { rows } = await query(
      `SELECT o.name, c.name AS connection_name, c.source_type,
              col.name AS col_name, col.data_type, col.key_kind, col.is_nullable
       FROM schema_objects o
       JOIN connections c ON c.id = o.connection_id
       LEFT JOIN schema_columns col ON col.schema_object_id = o.id
       WHERE o.workspace_id = $1
       ORDER BY o.name, col.ordinal`,
      [workspaceId],
    )
    return groupTypeCards(rows)
  }

  const { rows } = await query(
    `SELECT o.name, c.name AS connection_name, c.source_type,
            col.name AS col_name, col.data_type, col.key_kind, col.is_nullable
     FROM schema_objects o
     JOIN connections c ON c.id = o.connection_id
     LEFT JOIN schema_columns col ON col.schema_object_id = o.id
     WHERE o.workspace_id = $1
       AND lower(o.name) = ANY($2::text[])
     ORDER BY o.name, col.ordinal`,
    [workspaceId, names.map((n) => n.toLowerCase())],
  )
  return groupTypeCards(rows)
}

function groupTypeCards(rows) {
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.name)) {
      map.set(r.name, {
        name: r.name,
        connection: r.connection_name,
        sourceType: r.source_type,
        columns: [],
      })
    }
    if (r.col_name) {
      map.get(r.name).columns.push({
        name: r.col_name,
        dataType: r.data_type,
        keyKind: r.key_kind,
        isNullable: r.is_nullable,
      })
    }
  }
  return [...map.values()]
}

/**
 * Enrich joins with live column types at freeze time.
 */
export async function enrichJoinsWithTypes(workspaceId, joins) {
  if (!joins?.length) return []
  const out = []
  for (const j of joins) {
    const { rows } = await query(
      `SELECT
         fc.data_type AS from_type, fc.key_kind AS from_key,
         tc.data_type AS to_type, tc.key_kind AS to_key
       FROM relationships r
       JOIN schema_columns fc ON fc.id = r.from_column_id
       JOIN schema_columns tc ON tc.id = r.to_column_id
       WHERE r.workspace_id = $1 AND r.id = $2`,
      [workspaceId, j.id],
    )
    const t = rows[0] || {}
    out.push({
      ...j,
      fromType: t.from_type || j.fromType || null,
      toType: t.to_type || j.toType || null,
      fromKeyKind: t.from_key || j.fromKeyKind || null,
      toKeyKind: t.to_key || j.toKeyKind || null,
    })
  }
  return out
}

/**
 * Build frozen contract JSON for a job.
 */
export async function buildContract(workspaceId, { tables, joinsSnapshot, relationshipIds }) {
  const snap = await getLatestSnapshot(workspaceId)
  const tableCards = await loadTableTypeCards(workspaceId, tables)
  const joins = await enrichJoinsWithTypes(workspaceId, joinsSnapshot || [])

  return {
    version: 1,
    policy: 'schema-only',
    frozenAt: new Date().toISOString(),
    schemaSnapshotId: snap?.id || null,
    schemaSnapshotLabel: snap?.label || null,
    schemaSnapshotAt: snap?.created_at || null,
    relationshipIds: relationshipIds || joins.map((j) => j.id),
    tables: tableCards,
    joins,
    claim:
      'Que freeze: promoted joins + column types from schema metadata only. Raw warehouse rows are not part of this contract.',
  }
}

/**
 * Validate a frozen contract against live schema + open high drift.
 * @returns {{ ok: boolean, blocking: boolean, warnings: string[], errors: string[] }}
 */
export async function validateContract(workspaceId, contract, opts = {}) {
  const warnings = []
  const errors = []
  const blockOnHigh = opts.blockOnHigh !== false

  if (!contract || !contract.version) {
    warnings.push('Job has no frozen contract — will freeze on export')
  }

  // Open high-severity drift
  const { rows: openDrift } = await query(
    `SELECT code, summary FROM workspace_drift_events
     WHERE workspace_id = $1 AND acknowledged = false AND severity = 'high'
     ORDER BY created_at DESC LIMIT 10`,
    [workspaceId],
  )
  for (const d of openDrift) {
    errors.push(`Open drift [${d.code}]: ${d.summary}`)
  }

  const joins = contract?.joins || []
  for (const j of joins) {
    const { rows } = await query(
      `SELECT r.id, r.status,
              fc.name AS from_column, fc.data_type AS from_type,
              tc.name AS to_column, tc.data_type AS to_type,
              fo.name AS from_table, too.name AS to_table
       FROM relationships r
       JOIN schema_objects fo ON fo.id = r.from_object_id
       JOIN schema_columns fc ON fc.id = r.from_column_id
       JOIN schema_objects too ON too.id = r.to_object_id
       JOIN schema_columns tc ON tc.id = r.to_column_id
       WHERE r.workspace_id = $1 AND r.id = $2`,
      [workspaceId, j.id],
    )
    if (rows.length === 0) {
      errors.push(`Frozen join missing: ${j.fromTable}.${j.fromColumn} → ${j.toTable}.${j.toColumn}`)
      continue
    }
    const live = rows[0]
    if (live.status !== 'accepted') {
      errors.push(`Frozen join no longer accepted: ${j.id} (status=${live.status})`)
    }
    if (j.fromType && live.from_type && j.fromType !== live.from_type) {
      warnings.push(
        `Type drift ${j.fromTable}.${j.fromColumn}: frozen ${j.fromType} → live ${live.from_type}`,
      )
    }
    if (j.toType && live.to_type && j.toType !== live.to_type) {
      warnings.push(
        `Type drift ${j.toTable}.${j.toColumn}: frozen ${j.toType} → live ${live.to_type}`,
      )
    }
  }

  // Table/column presence for contracted tables
  for (const t of contract?.tables || []) {
    const live = await loadTableTypeCards(workspaceId, [t.name])
    if (live.length === 0) {
      errors.push(`Contracted table missing: ${t.name}`)
      continue
    }
    const liveCols = new Map(live[0].columns.map((c) => [c.name.toLowerCase(), c]))
    for (const c of t.columns || []) {
      const lc = liveCols.get(c.name.toLowerCase())
      if (!lc) {
        errors.push(`Contracted column missing: ${t.name}.${c.name}`)
      } else if (c.dataType && lc.dataType && c.dataType !== lc.dataType) {
        warnings.push(
          `Column type change ${t.name}.${c.name}: ${c.dataType} → ${lc.dataType}`,
        )
      }
    }
  }

  const blocking = blockOnHigh && errors.length > 0
  return {
    ok: errors.length === 0,
    blocking,
    warnings,
    errors,
  }
}

/**
 * Active (unacked high) drift for workspace — for AI/jobs UI gates.
 */
export async function getOpenHighDrift(workspaceId) {
  const { rows } = await query(
    `SELECT id, code, summary, detail_json, created_at, notified_at, notify_status
     FROM workspace_drift_events
     WHERE workspace_id = $1 AND acknowledged = false AND severity = 'high'
     ORDER BY created_at DESC
     LIMIT 20`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    summary: r.summary,
    detail: r.detail_json,
    createdAt: r.created_at,
    notifiedAt: r.notified_at || null,
    notifyStatus: r.notify_status || null,
  }))
}

export async function acknowledgeDrift(workspaceId, eventId) {
  const { rows } = await query(
    `UPDATE workspace_drift_events
     SET acknowledged = true
     WHERE workspace_id = $1 AND id = $2
     RETURNING id`,
    [workspaceId, eventId],
  )
  return rows[0] || null
}

export async function listRecentDrift(workspaceId, limit = 20) {
  const { rows } = await query(
    `SELECT id, connection_id, severity, code, summary, detail_json,
            acknowledged, created_at, notified_at, notify_status
     FROM workspace_drift_events
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connection_id,
    severity: r.severity,
    code: r.code,
    summary: r.summary,
    detail: r.detail_json,
    acknowledged: r.acknowledged,
    createdAt: r.created_at,
    notifiedAt: r.notified_at || null,
    notifyStatus: r.notify_status || null,
  }))
}

/**
 * Wave 2.2 — contract status for Jobs Deploy UI.
 * @returns freeze readiness + validation + unreviewed join count
 */
export async function getJobContractStatus(workspaceId, job) {
  const tables = job?.tables || []
  const unreviewedJoins = await countUnreviewedJoinsForTables(
    workspaceId,
    tables,
  )
  const acceptedJoins = await query(
    // use loadAcceptedJoins via inline count for accepted touching tables
    `SELECT COUNT(*)::int AS n
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_objects too ON too.id = r.to_object_id
     WHERE r.workspace_id = $1
       AND r.status = 'accepted'
       AND (
         cardinality($2::text[]) = 0
         OR lower(fo.name) = ANY($2::text[])
         OR lower(too.name) = ANY($2::text[])
       )`,
    [workspaceId, tables.map((t) => String(t).toLowerCase())],
  ).then((r) => r.rows[0]?.n ?? 0)

  const hasContract = Boolean(job?.contract?.version)
  const frozenJoinCount = job?.joinsSnapshot?.length || job?.contract?.joins?.length || 0
  const validation = await validateContract(workspaceId, job?.contract || null)
  const snap = await getLatestSnapshot(workspaceId)

  let stale = false
  if (
    hasContract &&
    snap?.id &&
    job?.contract?.schemaSnapshotId &&
    snap.id !== job.contract.schemaSnapshotId
  ) {
    stale = true
  }

  return {
    hasContract,
    frozenAt: job?.contract?.frozenAt || null,
    schemaSnapshotId: job?.schemaSnapshotId || job?.contract?.schemaSnapshotId || null,
    schemaSnapshotLabel: job?.contract?.schemaSnapshotLabel || null,
    latestSchemaSnapshotId: snap?.id || null,
    stale,
    frozenJoinCount,
    acceptedJoinsAvailable: acceptedJoins,
    unreviewedJoins,
    readyToFreeze: acceptedJoins > 0 || frozenJoinCount > 0 || tables.length > 0,
    validation,
    joins: job?.joinsSnapshot || job?.contract?.joins || [],
    claim: job?.contract?.claim || null,
  }
}

/**
 * Count suggested joins that touch any of the given table names.
 */
export async function countUnreviewedJoinsForTables(
  workspaceId,
  tableNames = [],
) {
  const names = [...new Set((tableNames || []).map(String).filter(Boolean))]
  if (names.length === 0) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM relationships
       WHERE workspace_id = $1 AND status = 'suggested'`,
      [workspaceId],
    )
    return rows[0]?.n || 0
  }
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_objects too ON too.id = r.to_object_id
     WHERE r.workspace_id = $1
       AND r.status = 'suggested'
       AND (
         lower(fo.name) = ANY($2::text[])
         OR lower(too.name) = ANY($2::text[])
       )`,
    [workspaceId, names.map((n) => n.toLowerCase())],
  )
  return rows[0]?.n || 0
}

