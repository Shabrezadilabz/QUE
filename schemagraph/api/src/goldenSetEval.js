/**
 * Phase 0.2 — Customer golden-set join eval → printable POC report.
 * Body: { pairs: [{ fromTable, fromColumn, toTable, toColumn }] }
 */
import { query } from './db.js'
import { leafName, norm } from './inferJoins.js'

export async function evaluateGoldenSet(workspaceId, pairs = []) {
  const clean = (Array.isArray(pairs) ? pairs : [])
    .map((p) => ({
      fromTable: String(p.fromTable || p.from_table || '').trim(),
      fromColumn: String(p.fromColumn || p.from_column || '').trim(),
      toTable: String(p.toTable || p.to_table || '').trim(),
      toColumn: String(p.toColumn || p.to_column || '').trim(),
    }))
    .filter((p) => p.fromTable && p.fromColumn && p.toTable && p.toColumn)
    .slice(0, 200)

  const { rows: rels } = await query(
    `SELECT r.id, r.status, r.confidence, r.relation_type,
            fo.name AS from_table, fc.name AS from_column,
            tto.name AS to_table, tc.name AS to_column
     FROM relationships r
     JOIN schema_objects fo ON fo.id = r.from_object_id
     JOIN schema_columns fc ON fc.id = r.from_column_id
     JOIN schema_objects tto ON tto.id = r.to_object_id
     JOIN schema_columns tc ON tc.id = r.to_column_id
     WHERE r.workspace_id = $1 AND r.status <> 'rejected'`,
    [workspaceId],
  )

  const key = (a, b, c, d) =>
    `${norm(leafName(a))}.${norm(b)}|${norm(leafName(c))}.${norm(d)}`
  const rev = (a, b, c, d) => key(c, d, a, b)

  const index = new Map()
  for (const r of rels) {
    const k = key(r.from_table, r.from_column, r.to_table, r.to_column)
    index.set(k, r)
    index.set(rev(r.from_table, r.from_column, r.to_table, r.to_column), r)
  }

  const details = []
  let hits = 0
  let promotedHits = 0
  for (const p of clean) {
    const k = key(p.fromTable, p.fromColumn, p.toTable, p.toColumn)
    const found = index.get(k) || null
    if (found) hits += 1
    if (found?.status === 'accepted') promotedHits += 1
    details.push({
      ...p,
      found: Boolean(found),
      status: found?.status || null,
      confidence: found?.confidence ?? null,
      relationshipId: found?.id || null,
    })
  }

  const precisionDenom = rels.filter((r) => r.status === 'suggested' || r.status === 'accepted').length
  const recall = clean.length ? hits / clean.length : 0
  const promotedRecall = clean.length ? promotedHits / clean.length : 0

  const report = {
    workspaceId,
    evaluatedAt: new Date().toISOString(),
    goldenPairs: clean.length,
    hits,
    promotedHits,
    recall: Number(recall.toFixed(4)),
    promotedRecall: Number(promotedRecall.toFixed(4)),
    workspaceSuggestedOrAccepted: precisionDenom,
    note: 'Recall = golden pairs present as suggested/accepted edges. Promote joins before claiming production readiness.',
    details,
  }

  return report
}

export function formatGoldenSetMarkdown(report) {
  const lines = [
    `# Que golden-set join eval`,
    ``,
    `- Evaluated: ${report.evaluatedAt}`,
    `- Golden pairs: ${report.goldenPairs}`,
    `- Hits (suggested or accepted): ${report.hits}`,
    `- Promoted hits: ${report.promotedHits}`,
    `- Recall: ${(report.recall * 100).toFixed(1)}%`,
    `- Promoted recall: ${(report.promotedRecall * 100).toFixed(1)}%`,
    ``,
    `## Pairs`,
    ``,
    `| From | To | Found | Status | Conf |`,
    `| --- | --- | --- | --- | --- |`,
  ]
  for (const d of report.details || []) {
    lines.push(
      `| ${d.fromTable}.${d.fromColumn} | ${d.toTable}.${d.toColumn} | ${d.found ? 'yes' : 'no'} | ${d.status || '—'} | ${d.confidence != null ? Math.round(d.confidence * 100) + '%' : '—'} |`,
    )
  }
  lines.push(``, `_${report.note}_`, ``)
  return lines.join('\n')
}
