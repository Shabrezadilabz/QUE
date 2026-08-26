/**
 * Phase 3.1 — Plan / queue mart materialization from pack job recipes.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { getJob } from './jobs.js'
import { resolveLiveTarget } from './liveExec.js'
import { recordAuditEvent } from './auditLog.js'

/**
 * Find Monk pack jobs for a workspace by recipe id (stored in job notes).
 */
export async function findPackJobs(workspaceId, packId) {
  const { rows } = await query(
    `SELECT id, title, notes FROM jobs
     WHERE workspace_id = $1 AND title LIKE '[Monk]%'
     ORDER BY created_at DESC
     LIMIT 20`,
    [workspaceId],
  )
  return rows.map((r) => {
    const recipeMatch = String(r.notes || '').match(/packRecipeId:([^\s\n]+)/)
    return {
      id: r.id,
      title: r.title,
      recipeId: recipeMatch?.[1] || null,
      packId:
        String(r.notes || '').match(/packId:([^\s\n]+)/)?.[1] || packId,
    }
  })
}

/**
 * Queue planned materializations for pack mart recipes (no silent DDL).
 * @param {string} workspaceId
 * @param {object} pack
 * @param {{ jobs: { id: string, recipeId: string }[] }} [seededJobs]
 * @param {{ userId?: string|null }} [opts]
 */
export async function planPackMartMaterializations(
  workspaceId,
  pack,
  seededJobs,
  opts = {},
) {
  const recipes = (pack.jobs || []).filter((j) => j.materialize)
  if (!recipes.length) {
    return { planned: 0, items: [], skipped: true }
  }

  let connection
  try {
    connection = await resolveLiveTarget(workspaceId, {}, null)
  } catch {
    return { planned: 0, items: [], skipped: true, reason: 'no_live_connection' }
  }
  if (!connection?.id) {
    return { planned: 0, items: [], skipped: true, reason: 'no_connection_id' }
  }

  const jobList = seededJobs?.jobs || (await findPackJobs(workspaceId, pack.id))
  const planned = []

  for (const recipe of recipes) {
    const jobHit = jobList.find((j) => j.recipeId === recipe.id)
    if (!jobHit) continue

    const job = await getJob(workspaceId, jobHit.id)
    if (!job) continue

    const mat = recipe.materialize || {}
    const objectName = String(mat.objectName || recipe.id).slice(0, 63)
    const schema = mat.schema ? String(mat.schema).slice(0, 63) : null
    const kind = mat.kind === 'table' ? 'table' : 'view'
    const qualified = schema ? `${schema}.${objectName}` : objectName

    const { rows: existing } = await query(
      `SELECT id FROM job_materializations
       WHERE workspace_id = $1 AND job_id = $2 AND status = 'planned'
       LIMIT 1`,
      [workspaceId, jobHit.id],
    )
    if (existing[0]) {
      planned.push({ jobId: jobHit.id, recipeId: recipe.id, status: 'already_planned' })
      continue
    }

    const id = randomUUID()
    await query(
      `INSERT INTO job_materializations (
         id, workspace_id, job_id, connection_id, actor_user_id,
         object_kind, object_schema, object_name, qualified_name,
         status, meta_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'planned',$10::jsonb)`,
      [
        id,
        workspaceId,
        jobHit.id,
        connection.id,
        opts.userId ?? null,
        kind,
        schema,
        objectName,
        qualified,
        JSON.stringify({
          trigger: 'monk_mode',
          packId: pack.id,
          recipeId: recipe.id,
          note: 'Confirm in Jobs → Deploy → Materialize',
        }),
      ],
    )
    planned.push({
      id,
      jobId: jobHit.id,
      recipeId: recipe.id,
      qualifiedName: qualified,
      status: 'planned',
    })
  }

  if (planned.length) {
    void recordAuditEvent({
      workspaceId,
      actorUserId: opts.userId ?? null,
      action: 'pack.materialize_planned',
      resourceType: 'pack',
      resourceId: pack.id,
      summary: `Planned ${planned.length} pack mart materialization(s)`,
    })
  }

  return { planned: planned.length, items: planned, skipped: false }
}
