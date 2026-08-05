/**
 * Wave 4.4 — AI mapping assist (HITL).
 * Suggest joins (reuse infer) + column rename aliases — never auto-promote.
 */
import { query } from './db.js'
import { inferJoinsForWorkspace } from './inferJoins.js'
import { listJoinReviews } from './joinReviews.js'
import { recordAuditEvent } from './auditLog.js'

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function tokenSet(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  const union = a.size + b.size - inter
  return union ? inter / union : 0
}

/**
 * @param {string} workspaceId
 * @param {{ refreshJoins?: boolean, limit?: number }} [opts]
 */
export async function runMappingAssist(workspaceId, opts = {}) {
  let joinInfer = null
  if (opts.refreshJoins !== false) {
    try {
      joinInfer = await inferJoinsForWorkspace(workspaceId, { limit: 80 })
    } catch (err) {
      joinInfer = { error: String(err.message || err) }
    }
  }

  const reviews = await listJoinReviews(workspaceId, {
    status: 'suggested',
    limit: opts.limit || 50,
  })

  const renameSuggestions = await suggestColumnRenames(workspaceId, {
    limit: opts.limit || 40,
  })

  return {
    ok: true,
    note: 'HITL only — Accept/Reject; Que never auto-applies mappings.',
    joinInference: joinInfer,
    joins: reviews.items,
    joinSummary: reviews.summary,
    renames: renameSuggestions,
  }
}

/**
 * Cross-table column name similarity → alias suggestions.
 */
async function suggestColumnRenames(workspaceId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100)
  const { rows } = await query(
    `SELECT c.id, c.name, c.data_type, o.id AS table_id, o.name AS table_name,
            o.connection_id, conn.name AS connection_name
     FROM schema_columns c
     JOIN schema_objects o ON o.id = c.schema_object_id
     JOIN connections conn ON conn.id = o.connection_id
     WHERE o.workspace_id = $1
     ORDER BY o.name, c.name
     LIMIT 800`,
    [workspaceId],
  )

  const candidates = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]
      const b = rows[j]
      if (a.connection_id === b.connection_id && a.table_id === b.table_id) {
        continue
      }
      const na = normName(a.name)
      const nb = normName(b.name)
      if (!na || !nb) continue
      let score = 0
      let reason = ''
      if (na === nb && a.name !== b.name) {
        score = 0.92
        reason = 'same normalized name, different casing/punctuation'
      } else if (na === nb) {
        continue
      } else {
        const jac = jaccard(tokenSet(a.name), tokenSet(b.name))
        if (jac >= 0.5 && (na.includes(nb) || nb.includes(na))) {
          score = 0.55 + jac * 0.35
          reason = 'overlapping tokens / substring'
        } else if (jac >= 0.66) {
          score = 0.5 + jac * 0.3
          reason = 'high token overlap'
        } else continue
      }
      if (score < 0.55) continue
      const alias = a.name.length <= b.name.length ? a.name : b.name
      candidates.push({
        fromColumnId: a.id,
        toColumnId: b.id,
        from: {
          column: a.name,
          table: a.table_name,
          connection: a.connection_name,
          dataType: a.data_type,
        },
        to: {
          column: b.name,
          table: b.table_name,
          connection: b.connection_name,
          dataType: b.data_type,
        },
        suggestedAlias: alias,
        score: Math.round(score * 1000) / 1000,
        reason,
      })
    }
  }
  candidates.sort((x, y) => y.score - x.score)
  const top = candidates.slice(0, limit)

  const persisted = []
  for (const c of top) {
    try {
      const { rows: ins } = await query(
        `INSERT INTO column_alias_suggestions (
           workspace_id, from_column_id, to_column_id, suggested_alias,
           score, reason, status, evidence_json
         ) VALUES ($1,$2,$3,$4,$5,$6,'suggested',$7::jsonb)
         ON CONFLICT (workspace_id, from_column_id, to_column_id, suggested_alias)
         DO UPDATE SET score = EXCLUDED.score, reason = EXCLUDED.reason,
                       updated_at = now()
         WHERE column_alias_suggestions.status = 'suggested'
         RETURNING id, status, score, suggested_alias, reason, created_at`,
        [
          workspaceId,
          c.fromColumnId,
          c.toColumnId,
          c.suggestedAlias,
          c.score,
          c.reason,
          JSON.stringify({ from: c.from, to: c.to }),
        ],
      )
      if (ins[0]) {
        persisted.push({
          id: ins[0].id,
          status: ins[0].status,
          ...c,
        })
      }
    } catch {
      /* table may be missing mid-migrate */
      persisted.push({ id: null, status: 'suggested', ...c })
    }
  }
  return persisted
}

export async function listRenameSuggestions(workspaceId, status = 'suggested') {
  const st = ['suggested', 'accepted', 'rejected', 'dismissed', 'all'].includes(
    status,
  )
    ? status
    : 'suggested'
  const params = [workspaceId]
  let sql = `AND s.status = 'suggested'`
  if (st === 'all') sql = ''
  else if (st !== 'suggested') {
    params.push(st)
    sql = `AND s.status = $${params.length}`
  }
  const { rows } = await query(
    `SELECT s.*,
            fc.name AS from_column, fo.name AS from_table,
            tc.name AS to_column, too.name AS to_table
     FROM column_alias_suggestions s
     JOIN schema_columns fc ON fc.id = s.from_column_id
     JOIN schema_objects fo ON fo.id = fc.schema_object_id
     JOIN schema_columns tc ON tc.id = s.to_column_id
     JOIN schema_objects too ON too.id = tc.schema_object_id
     WHERE s.workspace_id = $1
       ${sql}
     ORDER BY s.score DESC NULLS LAST, s.created_at DESC
     LIMIT 100`,
    params,
  )
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    suggestedAlias: r.suggested_alias,
    score: r.score,
    reason: r.reason,
    from: { column: r.from_column, table: r.from_table },
    to: { column: r.to_column, table: r.to_table },
    evidence: r.evidence_json,
    createdAt: r.created_at,
  }))
}

/**
 * @param {string} workspaceId
 * @param {string} suggestionId
 * @param {'accept'|'reject'|'dismiss'} action
 */
export async function reviewRenameSuggestion(
  workspaceId,
  suggestionId,
  action,
  actorUserId = null,
) {
  const statusMap = {
    accept: 'accepted',
    reject: 'rejected',
    dismiss: 'dismissed',
  }
  const status = statusMap[action]
  if (!status) {
    const err = new Error("action must be 'accept', 'reject', or 'dismiss'")
    err.status = 400
    throw err
  }
  const { rows } = await query(
    `UPDATE column_alias_suggestions
     SET status = $3, updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [workspaceId, suggestionId, status],
  )
  if (!rows[0]) {
    const err = new Error('suggestion not found')
    err.status = 404
    throw err
  }
  void recordAuditEvent({
    workspaceId,
    actorUserId,
    action: `mapping.rename_${action}`,
    resourceType: 'column_alias_suggestion',
    resourceId: suggestionId,
    summary: `Rename suggestion ${action}: ${rows[0].suggested_alias}`,
    meta: { alias: rows[0].suggested_alias, status },
  })
  return {
    id: rows[0].id,
    status: rows[0].status,
    suggestedAlias: rows[0].suggested_alias,
  }
}
