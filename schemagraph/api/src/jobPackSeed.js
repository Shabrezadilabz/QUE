/**
 * Create ecommerce jobs from Monk Mode pack recipes (Phase 2).
 */
import { buildNotebookFromFields } from './jobNotebook.js'
import { createJob } from './jobs.js'
import { applyTablePlaceholders } from './templateMapper.js'
import { inferJoinsForWorkspace } from './inferJoins.js'

/**
 * @param {string} workspaceId
 * @param {object} pack
 * @param {{ matches: object[], canRunMonk?: boolean }} matchResult
 * @param {{ userId?: string|null }} [opts]
 */
export async function seedJobsFromPack(
  workspaceId,
  pack,
  matchResult,
  opts = {},
) {
  const jobs = pack.jobs || []
  if (!jobs.length || !matchResult?.canRunMonk) {
    return { created: 0, jobs: [], skipped: true }
  }

  const createdJobs = []
  for (const recipe of jobs) {
    const sqlText = applyTablePlaceholders(recipe.sql || '', matchResult.matches)
    const notebook = buildNotebookFromFields({
      title: recipe.title || recipe.id,
      notes: `${recipe.description || ''}\n\nCreated by Monk Mode · ${pack.displayName}`,
      sqlText,
      tables: matchResult.matches.map((m) => m.table),
      status: 'draft',
    })
    const job = await createJob(workspaceId, {
      title: `[Monk] ${recipe.title || recipe.id}`,
      notebook,
      sqlText,
      notes: `${recipe.description || ''}\npackId:${pack.id}\npackRecipeId:${recipe.id}`,
      tables: matchResult.matches.map((m) => m.table),
    })
    createdJobs.push({ id: job.id, title: job.title, recipeId: recipe.id })
  }

  try {
    await inferJoinsForWorkspace(workspaceId, {})
  } catch {
    /* non-fatal */
  }

  return {
    created: createdJobs.length,
    jobs: createdJobs,
    skipped: false,
  }
}
