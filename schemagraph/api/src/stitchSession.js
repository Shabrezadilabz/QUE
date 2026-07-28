/**
 * Two-source stitch session — connect A+B → infer → review → job → optional dbt-PR ship.
 */
import { query } from './db.js'
import { inferJoinsForWorkspace } from './inferJoins.js'
import { createStitchJobFromTables, exportJob } from './jobs.js'

/**
 * @param {string} workspaceId
 * @param {{
 *   connectionIdA: string,
 *   connectionIdB: string,
 *   createJob?: boolean,
 *   shipDbtPr?: boolean,
 *   jobTitle?: string,
 *   actorUserId?: string,
 * }} opts
 */
export async function runStitchSession(workspaceId, opts = {}) {
  const connectionIdA = String(opts.connectionIdA || '').trim()
  const connectionIdB = String(opts.connectionIdB || '').trim()
  if (!connectionIdA || !connectionIdB) {
    const err = new Error('connectionIdA and connectionIdB are required')
    err.status = 400
    throw err
  }
  if (connectionIdA === connectionIdB) {
    const err = new Error('Pick two different connections')
    err.status = 400
    throw err
  }

  const { rows: conns } = await query(
    `SELECT id, name, source_type FROM connections
     WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
    [workspaceId, [connectionIdA, connectionIdB]],
  )
  if (conns.length !== 2) {
    const err = new Error('One or both connections not found in workspace')
    err.status = 404
    throw err
  }
  const byId = Object.fromEntries(conns.map((c) => [c.id, c]))

  const inferA = await inferJoinsForWorkspace(workspaceId, {
    connectionId: connectionIdA,
  })
  const inferB = await inferJoinsForWorkspace(workspaceId, {
    connectionId: connectionIdB,
  })

  const { rows: suggested } = await query(
    `SELECT r.id, r.confidence, r.join_criteria, r.label, r.ai_notes, r.evidence_json,
            r.status, r.relation_type,
            fo.name AS from_table, fc.name AS from_column, fo.connection_id AS from_conn,
            too.name AS to_table, tc.name AS to_column, too.connection_id AS to_conn
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects too ON too.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1
       AND r.status = 'suggested'
       AND (
         (fo.connection_id = $2 AND too.connection_id = $3)
         OR (fo.connection_id = $3 AND too.connection_id = $2)
       )
     ORDER BY r.confidence DESC
     LIMIT 50`,
    [workspaceId, connectionIdA, connectionIdB],
  )

  const { rows: acceptedRows } = await query(
    `SELECT COUNT(*)::int AS n
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_objects too ON too.id = r.to_object_id
     WHERE r.workspace_id = $1
       AND r.status = 'accepted'
       AND (
         (fo.connection_id = $2 AND too.connection_id = $3)
         OR (fo.connection_id = $3 AND too.connection_id = $2)
       )`,
    [workspaceId, connectionIdA, connectionIdB],
  )

  const { rows: tableRows } = await query(
    `SELECT o.name, o.connection_id
     FROM schema_objects o
     WHERE o.workspace_id = $1 AND o.connection_id = ANY($2::uuid[])
     ORDER BY o.name`,
    [workspaceId, [connectionIdA, connectionIdB]],
  )

  const suggestions = suggested.map((r) => ({
    id: r.id,
    confidence: Number(r.confidence),
    label: r.label,
    joinCriteria: r.join_criteria,
    aiNotes: r.ai_notes,
    evidence: r.evidence_json,
    from: `${r.from_table}.${r.from_column}`,
    to: `${r.to_table}.${r.to_column}`,
    fromConnectionId: r.from_conn,
    toConnectionId: r.to_conn,
  }))

  const acceptedBetween = acceptedRows[0]?.n || 0
  const wantJob = opts.createJob === true || opts.shipDbtPr === true
  let job = null
  let exportResult = null

  if (wantJob) {
    if (acceptedBetween === 0 && opts.shipDbtPr) {
      const err = new Error(
        'Ship blocked: promote at least one join between these sources first',
      )
      err.status = 409
      throw err
    }
    const tableNames = tableRows.map((t) => t.name)
    const title =
      String(opts.jobTitle || '').trim() ||
      `Stitch ${byId[connectionIdA]?.name || 'A'} ↔ ${byId[connectionIdB]?.name || 'B'}`
    job = await createStitchJobFromTables(workspaceId, {
      title,
      tableNames,
      notes: `Two-source stitch session · ${byId[connectionIdA]?.name} ↔ ${byId[connectionIdB]?.name}`,
    })

    if (opts.shipDbtPr && job?.id) {
      exportResult = await exportJob(workspaceId, job.id, 'dbt-pr', {
        actorUserId: opts.actorUserId || null,
      })
      job = exportResult?.job || job
    }
  }

  return {
    ok: true,
    connectionA: {
      id: connectionIdA,
      name: byId[connectionIdA]?.name,
      sourceType: byId[connectionIdA]?.source_type,
    },
    connectionB: {
      id: connectionIdB,
      name: byId[connectionIdB]?.name,
      sourceType: byId[connectionIdB]?.source_type,
    },
    inference: {
      created: (inferA.created || 0) + (inferB.created || 0),
      scanned: (inferA.scanned || 0) + (inferB.scanned || 0),
    },
    suggested: suggestions,
    acceptedBetween,
    tables: tableRows.map((t) => ({
      name: t.name,
      connectionId: t.connection_id,
    })),
    job,
    export: exportResult?.export || null,
  }
}
