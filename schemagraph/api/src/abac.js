/**
 * Phase 5 — ABAC policies layered on RBAC roles.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { ROLE_RANK } from './auth.js'

function mapPolicy(r) {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    effect: r.effect,
    actions: Array.isArray(r.actions_json) ? r.actions_json : [],
    resourceTypes: Array.isArray(r.resource_types_json)
      ? r.resource_types_json
      : [],
    conditions: r.conditions_json || {},
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listAbacPolicies(workspaceId) {
  const { rows } = await query(
    `SELECT * FROM abac_policies WHERE workspace_id = $1 ORDER BY name`,
    [workspaceId],
  )
  return rows.map(mapPolicy)
}

export async function createAbacPolicy(workspaceId, body = {}) {
  const name = String(body.name || '').trim()
  if (!name) {
    const err = new Error('name required')
    err.status = 400
    throw err
  }
  const id = randomUUID()
  await query(
    `INSERT INTO abac_policies (
       id, workspace_id, name, effect, actions_json, resource_types_json,
       conditions_json, enabled
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8)`,
    [
      id,
      workspaceId,
      name,
      body.effect === 'deny' ? 'deny' : 'allow',
      JSON.stringify(
        (Array.isArray(body.actions) ? body.actions : ['*']).slice(0, 40),
      ),
      JSON.stringify(
        (Array.isArray(body.resourceTypes) ? body.resourceTypes : ['*']).slice(
          0,
          40,
        ),
      ),
      JSON.stringify(body.conditions && typeof body.conditions === 'object'
        ? body.conditions
        : {}),
      body.enabled !== false,
    ],
  )
  return (await listAbacPolicies(workspaceId)).find((p) => p.id === id)
}

export async function deleteAbacPolicy(workspaceId, policyId) {
  await query(
    `DELETE FROM abac_policies WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, policyId],
  )
  return { ok: true }
}

/**
 * Evaluate ABAC after RBAC. Deny wins. Empty policies → allow (RBAC already passed).
 */
export async function evaluateAbac(workspaceId, ctx = {}) {
  const {
    action = '*',
    resourceType = '*',
    role = 'member',
    attributes = {},
  } = ctx
  const policies = (await listAbacPolicies(workspaceId)).filter((p) => p.enabled)
  if (!policies.length) {
    return { allowed: true, reason: 'no_abac_policies', matched: null }
  }

  let matchedDeny = null
  let matchedAllow = null
  for (const p of policies) {
    const actionOk =
      p.actions.includes('*') || p.actions.includes(action)
    const typeOk =
      p.resourceTypes.includes('*') || p.resourceTypes.includes(resourceType)
    if (!actionOk || !typeOk) continue

    const cond = p.conditions || {}
    if (cond.minRole) {
      const need = ROLE_RANK[cond.minRole] ?? 0
      const have = ROLE_RANK[role] ?? 0
      if (have < need) continue
    }
    if (cond.requireAttribute) {
      const [k, v] = String(cond.requireAttribute).split('=')
      if (attributes[k] !== v) continue
    }
    if (cond.emailDomain) {
      const dom = String(attributes.email || '')
        .split('@')[1]
        ?.toLowerCase()
      if (dom !== String(cond.emailDomain).toLowerCase()) continue
    }

    if (p.effect === 'deny') matchedDeny = p
    else matchedAllow = p
  }

  if (matchedDeny) {
    return {
      allowed: false,
      reason: 'abac_deny',
      matched: matchedDeny,
    }
  }
  // If any allow policies exist for this action space, require a match
  const relevantAllows = policies.filter(
    (p) =>
      p.effect === 'allow' &&
      (p.actions.includes('*') || p.actions.includes(action)),
  )
  if (relevantAllows.length && !matchedAllow) {
    return { allowed: false, reason: 'abac_no_allow_match', matched: null }
  }
  return { allowed: true, reason: 'abac_allow', matched: matchedAllow }
}

export function requireAbac(action, resourceType) {
  return async function abacMiddleware(req, res, next) {
    try {
      const workspaceId = req.params.workspaceId
      if (!workspaceId) return next()
      const decision = await evaluateAbac(workspaceId, {
        action,
        resourceType,
        role: req.workspaceRole || 'member',
        attributes: {
          email: req.user?.email,
          apiKey: Boolean(req.apiKey),
        },
      })
      if (!decision.allowed) {
        res.status(403).json({
          error: `forbidden — ABAC ${decision.reason}`,
          policyId: decision.matched?.id || null,
        })
        return
      }
      req.abac = decision
      next()
    } catch (err) {
      next(err)
    }
  }
}
