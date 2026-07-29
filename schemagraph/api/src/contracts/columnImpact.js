/**
 * Column-impact helpers for drift → block dbt PR.
 */
import { getOpenHighDrift } from '../contracts/contractFreeze.js'

/**
 * Open high drift that mentions column changes / broken joins touching job tables.
 */
export async function columnImpactBlockingExport(workspaceId, job) {
  const open = await getOpenHighDrift(workspaceId)
  const tables = new Set(
    (job?.tables || []).map((t) => String(t).toLowerCase()),
  )
  const hits = []
  for (const d of open || []) {
    const code = String(d.code || d.kind || '').toLowerCase()
    const summary = String(d.summary || '')
    const detail = d.detail || d.payload || {}
    const columnish =
      /column|type_change|nullable|key_kind|broken.?join|join_broken/i.test(
        code + ' ' + summary,
      )
    if (!columnish && !Array.isArray(detail.columnsChanged)) continue

    let touchesJob = tables.size === 0
    if (tables.size > 0) {
      const blob = JSON.stringify(detail).toLowerCase() + summary.toLowerCase()
      touchesJob = [...tables].some((t) => blob.includes(t))
    }
    if (touchesJob) {
      hits.push({
        id: d.id,
        code: d.code,
        summary: d.summary,
      })
    }
  }
  return hits
}
