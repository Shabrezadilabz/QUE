/**
 * Re-sync drift — tables, accepted joins, column type/key changes.
 * Persists workspace_drift_events for gates on AI/jobs/export.
 */
import { query } from './db.js'
import { emitContractEvent } from './adapters/contractEvents.js'
import { openGithubDriftIssue } from './exporters/githubPr.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { resolveGithubToken } from './secrets.js'
import { notifyDriftAlert } from './driftAlerts.js'

/**
 * Snapshot connection tables + columns + accepted joins (before sync mutates).
 */
export async function capturePreSyncDrift(workspaceId, connectionId) {
  const { rows: tables } = await query(
    `SELECT id, name FROM schema_objects
     WHERE workspace_id = $1 AND connection_id = $2`,
    [workspaceId, connectionId],
  )
  const objectIds = tables.map((t) => t.id)
  const tableNames = tables.map((t) => t.name)

  const columns = []
  if (objectIds.length > 0) {
    const { rows: cols } = await query(
      `SELECT o.name AS table_name, c.name AS column_name, c.data_type, c.key_kind, c.is_nullable
       FROM schema_columns c
       JOIN schema_objects o ON o.id = c.schema_object_id
       WHERE c.workspace_id = $1 AND o.connection_id = $2`,
      [workspaceId, connectionId],
    )
    for (const r of cols) {
      columns.push({
        key: `${r.table_name}.${r.column_name}`.toLowerCase(),
        table: r.table_name,
        column: r.column_name,
        dataType: r.data_type,
        keyKind: r.key_kind,
        isNullable: r.is_nullable,
      })
    }
  }

  let acceptedJoins = []
  if (objectIds.length > 0) {
    const { rows } = await query(
      `SELECT r.id, r.status, r.label, r.join_criteria,
              fo.name AS from_table, fc.name AS from_column, fc.data_type AS from_type,
              too.name AS to_table, tc.name AS to_column, tc.data_type AS to_type
       FROM relationships r
       JOIN schema_objects fo ON fo.id = r.from_object_id
       JOIN schema_columns fc ON fc.id = r.from_column_id
       JOIN schema_objects too ON too.id = r.to_object_id
       JOIN schema_columns tc ON tc.id = r.to_column_id
       WHERE r.workspace_id = $1
         AND r.status = 'accepted'
         AND (r.from_object_id = ANY($2::uuid[]) OR r.to_object_id = ANY($2::uuid[]))`,
      [workspaceId, objectIds],
    )
    acceptedJoins = rows.map((r) => ({
      id: r.id,
      label:
        r.label ||
        `${r.from_table}.${r.from_column} → ${r.to_table}.${r.to_column}`,
      fromTable: r.from_table,
      fromColumn: r.from_column,
      fromType: r.from_type,
      toTable: r.to_table,
      toColumn: r.to_column,
      toType: r.to_type,
    }))
  }

  return { tableNames, columns, acceptedJoins }
}

/**
 * Compare pre-sync snapshot to current DB + suggested join count.
 * Persists drift events and emits adapter event when risk exists.
 */
export async function buildSyncDrift(
  workspaceId,
  connectionId,
  before,
  suggestedJoins,
) {
  const { rows: tables } = await query(
    `SELECT name FROM schema_objects
     WHERE workspace_id = $1 AND connection_id = $2`,
    [workspaceId, connectionId],
  )
  const afterNames = new Set(tables.map((t) => t.name))
  const beforeNames = new Set(before.tableNames || [])

  const tablesAdded = [...afterNames].filter((n) => !beforeNames.has(n))
  const tablesRemoved = [...beforeNames].filter((n) => !afterNames.has(n))

  const { rows: afterCols } = await query(
    `SELECT o.name AS table_name, c.name AS column_name, c.data_type, c.key_kind, c.is_nullable
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     WHERE c.workspace_id = $1 AND o.connection_id = $2`,
    [workspaceId, connectionId],
  )
  const afterColMap = new Map(
    afterCols.map((r) => [
      `${r.table_name}.${r.column_name}`.toLowerCase(),
      {
        table: r.table_name,
        column: r.column_name,
        dataType: r.data_type,
        keyKind: r.key_kind,
        isNullable: r.is_nullable,
      },
    ]),
  )
  const beforeColMap = new Map((before.columns || []).map((c) => [c.key, c]))

  const columnsAdded = []
  const columnsRemoved = []
  const typeChanges = []
  const keyChanges = []

  for (const [key, after] of afterColMap) {
    const prev = beforeColMap.get(key)
    if (!prev) {
      columnsAdded.push(`${after.table}.${after.column}`)
      continue
    }
    if (prev.dataType !== after.dataType) {
      typeChanges.push({
        column: `${after.table}.${after.column}`,
        from: prev.dataType,
        to: after.dataType,
      })
    }
    if (prev.keyKind !== after.keyKind) {
      keyChanges.push({
        column: `${after.table}.${after.column}`,
        from: prev.keyKind,
        to: after.keyKind,
      })
    }
  }
  for (const [key, prev] of beforeColMap) {
    if (!afterColMap.has(key)) {
      columnsRemoved.push(`${prev.table}.${prev.column}`)
    }
  }

  const { rows: stillThere } = await query(
    `SELECT id FROM relationships
     WHERE workspace_id = $1 AND status = 'accepted'`,
    [workspaceId],
  )
  const alive = new Set(stillThere.map((r) => r.id))
  const joinsBroken = (before.acceptedJoins || []).filter((j) => !alive.has(j.id))

  // Joins still accepted but endpoint types changed
  const joinTypeDrift = []
  for (const j of before.acceptedJoins || []) {
    if (!alive.has(j.id)) continue
    const fromKey = `${j.fromTable}.${j.fromColumn}`.toLowerCase()
    const toKey = `${j.toTable}.${j.toColumn}`.toLowerCase()
    const fromLive = afterColMap.get(fromKey)
    const toLive = afterColMap.get(toKey)
    if (j.fromType && fromLive && j.fromType !== fromLive.dataType) {
      joinTypeDrift.push({
        joinId: j.id,
        side: 'from',
        column: `${j.fromTable}.${j.fromColumn}`,
        from: j.fromType,
        to: fromLive.dataType,
      })
    }
    if (j.toType && toLive && j.toType !== toLive.dataType) {
      joinTypeDrift.push({
        joinId: j.id,
        side: 'to',
        column: `${j.toTable}.${j.toColumn}`,
        from: j.toType,
        to: toLive.dataType,
      })
    }
  }

  const parts = []
  if (tablesAdded.length) parts.push(`+${tablesAdded.length} table(s)`)
  if (tablesRemoved.length) parts.push(`-${tablesRemoved.length} table(s)`)
  if (columnsAdded.length) parts.push(`+${columnsAdded.length} col(s)`)
  if (columnsRemoved.length) parts.push(`-${columnsRemoved.length} col(s)`)
  if (typeChanges.length) parts.push(`${typeChanges.length} type change(s)`)
  if (keyChanges.length) parts.push(`${keyChanges.length} key change(s)`)
  if (joinsBroken.length) parts.push(`${joinsBroken.length} accepted join(s) broken`)
  if (joinTypeDrift.length) parts.push(`${joinTypeDrift.length} join type drift`)
  if (suggestedJoins > 0) parts.push(`${suggestedJoins} new suggested join(s)`)

  const hasRisk =
    tablesRemoved.length > 0 ||
    joinsBroken.length > 0 ||
    typeChanges.length > 0 ||
    columnsRemoved.length > 0 ||
    joinTypeDrift.length > 0

  const severity =
    joinsBroken.length > 0 || tablesRemoved.length > 0
      ? 'high'
      : typeChanges.length > 0 || joinTypeDrift.length > 0 || columnsRemoved.length > 0
        ? 'warn'
        : suggestedJoins > 0 || tablesAdded.length > 0 || columnsAdded.length > 0
          ? 'info'
          : 'info'

  const drift = {
    tablesAdded,
    tablesRemoved,
    columnsAdded: columnsAdded.slice(0, 40),
    columnsRemoved: columnsRemoved.slice(0, 40),
    typeChanges: typeChanges.slice(0, 40),
    keyChanges: keyChanges.slice(0, 40),
    joinsBroken,
    joinTypeDrift: joinTypeDrift.slice(0, 40),
    suggestedJoins: suggestedJoins || 0,
    severity,
    summary:
      parts.length > 0 ? parts.join(' · ') : 'No schema drift detected',
    hasRisk,
  }

  // Persist alarm(s)
  try {
    if (hasRisk || suggestedJoins > 0) {
      const code =
        joinsBroken.length > 0
          ? 'joins_broken'
          : tablesRemoved.length > 0
            ? 'tables_removed'
            : typeChanges.length > 0 || joinTypeDrift.length > 0
              ? 'type_drift'
              : columnsRemoved.length > 0
                ? 'columns_removed'
                : 'schema_changed'

      const { rows: inserted } = await query(
        `INSERT INTO workspace_drift_events (
           workspace_id, connection_id, severity, code, summary, detail_json
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id`,
        [
          workspaceId,
          connectionId,
          drift.severity,
          code,
          drift.summary,
          JSON.stringify(drift),
        ],
      )
      const eventId = inserted[0]?.id

      void emitContractEvent(workspaceId, 'drift.detected', {
        connectionId,
        drift,
        eventId,
      })

      if (eventId && (drift.severity === 'high' || drift.severity === 'warn')) {
        void notifyDriftAlert({
          workspaceId,
          eventId,
          connectionId,
          drift: { ...drift, code },
        }).catch((err) =>
          console.warn('[Que drift] alert skipped:', err.message || err),
        )
      }

      // Notify engineers where they ship (GitHub issue) when accepted joins break
      if (joinsBroken.length > 0) {
        void notifyBrokenJoins(workspaceId, connectionId, drift).catch(
          (err) =>
            console.warn(
              '[Que drift] github notify skipped:',
              err.message || err,
            ),
        )
      }
    }
  } catch (err) {
    console.warn('[Que drift] persist skipped:', err.message || err)
  }

  return drift
}

async function notifyBrokenJoins(workspaceId, connectionId, drift) {
  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  const owner = String(settings.githubOwner || '').trim()
  const repo = String(settings.githubRepo || '').trim()
  const broken = (drift.joinsBroken || [])
    .slice(0, 10)
    .map((j) => {
      const label =
        j.fromTable && j.toTable
          ? `${j.fromTable}.${j.fromColumn || '?'} → ${j.toTable}.${j.toColumn || '?'}`
          : j.id || 'join'
      return `- \`${label}\``
    })
    .join('\n')
  const body = [
    `## Que drift: accepted joins broken`,
    ``,
    `Sync on connection \`${connectionId}\` broke promoted joins.`,
    ``,
    `**Summary:** ${drift.summary}`,
    ``,
    `### Broken joins`,
    broken || '- (see drift detail in Que)',
    ``,
    `### Action`,
    `1. Open Que workspace → review canvas`,
    `2. Re-promote or reject stale edges`,
    `3. Re-freeze affected jobs before export`,
    ``,
    `_Schema-only policy · Que does not centralize warehouse rows._`,
  ].join('\n')

  const ghTok = await resolveGithubToken(workspaceId)
  return openGithubDriftIssue({
    token: ghTok.token,
    owner,
    repo,
    title: `Que drift: ${drift.joinsBroken?.length || 0} accepted join(s) broken`,
    body,
  })
}
