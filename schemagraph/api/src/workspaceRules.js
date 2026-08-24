/**
 * Cursor-like always-on workspace rules (org memory from Promote + manual).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'

const KINDS = new Set([
  'general',
  'join',
  'naming',
  'privacy',
  'sql',
  'transform',
])

function mapRule(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    enabled: Boolean(r.enabled),
    source: r.source,
    priority: Number(r.priority || 100),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listWorkspaceRules(
  workspaceId,
  { enabledOnly = false } = {},
) {
  const { rows } = await query(
    `SELECT * FROM workspace_rules
     WHERE workspace_id = $1
       ${enabledOnly ? 'AND enabled = true' : ''}
     ORDER BY priority ASC, updated_at DESC
     LIMIT 200`,
    [workspaceId],
  )
  return rows.map(mapRule)
}

export async function createWorkspaceRule(
  workspaceId,
  {
    kind = 'general',
    title,
    body,
    enabled = true,
    source = 'manual',
    priority = 100,
    userId = null,
  } = {},
) {
  const k = String(kind || 'general').toLowerCase()
  if (!KINDS.has(k)) {
    const err = new Error(`kind must be one of ${[...KINDS].join(', ')}`)
    err.status = 400
    throw err
  }
  const t = String(title || '').trim()
  const b = String(body || '').trim()
  if (!t || !b) {
    const err = new Error('title and body required')
    err.status = 400
    throw err
  }
  const id = randomUUID()
  await query(
    `INSERT INTO workspace_rules (
       id, workspace_id, kind, title, body, enabled, source, priority, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      workspaceId,
      k,
      t.slice(0, 200),
      b.slice(0, 8000),
      Boolean(enabled),
      String(source || 'manual').slice(0, 40),
      Math.min(1000, Math.max(1, Number(priority) || 100)),
      userId,
    ],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'workspace_rule.create',
    resourceType: 'workspace_rule',
    resourceId: id,
    summary: `Rule “${t}” (${k})`,
  })
  const { rows } = await query(`SELECT * FROM workspace_rules WHERE id = $1`, [
    id,
  ])
  return mapRule(rows[0])
}

export async function updateWorkspaceRule(
  workspaceId,
  ruleId,
  patch = {},
  userId = null,
) {
  const list = await listWorkspaceRules(workspaceId)
  const cur = list.find((r) => r.id === ruleId)
  if (!cur) {
    const err = new Error('rule not found')
    err.status = 404
    throw err
  }
  const kind =
    typeof patch.kind === 'string' && KINDS.has(patch.kind.toLowerCase())
      ? patch.kind.toLowerCase()
      : cur.kind
  const title =
    typeof patch.title === 'string' && patch.title.trim()
      ? patch.title.trim().slice(0, 200)
      : cur.title
  const body =
    typeof patch.body === 'string' && patch.body.trim()
      ? patch.body.trim().slice(0, 8000)
      : cur.body
  const enabled =
    typeof patch.enabled === 'boolean' ? patch.enabled : cur.enabled
  const priority =
    typeof patch.priority === 'number' && Number.isFinite(patch.priority)
      ? Math.min(1000, Math.max(1, Math.round(patch.priority)))
      : cur.priority

  await query(
    `UPDATE workspace_rules SET
       kind = $3, title = $4, body = $5, enabled = $6, priority = $7,
       updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, ruleId, kind, title, body, enabled, priority],
  )
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'workspace_rule.update',
    resourceType: 'workspace_rule',
    resourceId: ruleId,
    summary: `Updated rule “${title}”`,
  })
  const { rows } = await query(`SELECT * FROM workspace_rules WHERE id = $1`, [
    ruleId,
  ])
  return mapRule(rows[0])
}

export async function deleteWorkspaceRule(workspaceId, ruleId) {
  await query(
    `DELETE FROM workspace_rules WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, ruleId],
  )
  return { ok: true }
}

/** Compact pack for AI system prompts */
export async function buildRulesAiPack(workspaceId, { max = 24 } = {}) {
  const rules = await listWorkspaceRules(workspaceId, { enabledOnly: true })
  return rules.slice(0, max).map((r) => ({
    kind: r.kind,
    title: r.title,
    body: r.body,
  }))
}

export function formatRulesForPrompt(rules) {
  if (!rules?.length) return ''
  return (
    `\n## Workspace rules (always follow)\n` +
    rules
      .map((r) => `- [${r.kind}] ${r.title}: ${r.body}`)
      .join('\n')
  )
}

/**
 * Learn a join rule from Promote (idempotent-ish by title).
 */
export async function learnRuleFromPromote(
  workspaceId,
  { fromTable, fromColumn, toTable, toColumn, userId = null } = {},
) {
  if (!fromTable || !fromColumn || !toTable || !toColumn) return null
  const title = `Prefer join ${fromTable}.${fromColumn} → ${toTable}.${toColumn}`
  const { rows } = await query(
    `SELECT id FROM workspace_rules
     WHERE workspace_id = $1 AND title = $2 AND source = 'promote'
     LIMIT 1`,
    [workspaceId, title],
  )
  if (rows[0]) return null
  return createWorkspaceRule(workspaceId, {
    kind: 'join',
    title,
    body: `When stitching ${fromTable} to ${toTable}, prefer ${fromColumn} = ${toColumn}. Learned from human Promote.`,
    source: 'promote',
    priority: 40,
    userId,
  })
}

/** Whether the workspace privacy rule gates PII column masking in grids. */
export async function isHidePiiRuleEnabled(workspaceId) {
  const rules = await listWorkspaceRules(workspaceId)
  const privacy = rules.filter((r) => r.kind === 'privacy')
  if (!privacy.length) return true
  const hideRule = privacy.find((r) => /hide.*pii/i.test(r.title))
  if (!hideRule) return true
  return hideRule.enabled
}

/** Seed default privacy rule when workspace has none (Rules page + masking). */
export async function ensureDefaultPrivacyRule(workspaceId) {
  const rules = await listWorkspaceRules(workspaceId)
  const has = rules.some(
    (r) => r.kind === 'privacy' && /hide.*pii/i.test(r.title),
  )
  if (has) return null
  return createWorkspaceRule(workspaceId, {
    kind: 'privacy',
    title: 'Hide PII columns by default',
    body:
      'Automatically redact columns containing email, phone, or SSN patterns in Managed Plane previews and job output grids.',
    source: 'system',
    priority: 50,
    enabled: true,
  })
}
