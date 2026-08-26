/**
 * Monk Mode SOX / audit evidence export (Phase 4).
 */
import { query } from './db.js'
import { getLatestPackCertification } from './packCertification.js'
import { listWorkspaceMemory } from './workspaceMemory.js'

export async function buildMonkEvidencePack(workspaceId, opts = {}) {
  const packId = opts.packId || null
  const limit = Math.min(Number(opts.limit) || 5, 20)

  let runSql = `SELECT * FROM monk_mode_runs WHERE workspace_id = $1`
  const params = [workspaceId]
  if (packId) {
    params.push(packId)
    runSql += ` AND pack_id = $${params.length}`
  }
  runSql += ` ORDER BY created_at DESC LIMIT ${limit}`

  const { rows: runs } = await query(runSql, params)
  const evidence = []

  for (const run of runs) {
    const { rows: events } = await query(
      `SELECT phase, level, message, detail_json, created_at
       FROM monk_mode_events WHERE run_id = $1 ORDER BY created_at ASC`,
      [run.id],
    )
    evidence.push({
      runId: run.id,
      packId: run.pack_id,
      industry: run.industry,
      status: run.status,
      phase: run.phase,
      matchScore: run.match_score,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      summary: run.summary_json || {},
      capability: run.capability_json || {},
      events: events.map((e) => ({
        phase: e.phase,
        level: e.level,
        message: e.message,
        detail: e.detail_json,
        at: e.created_at,
      })),
    })
  }

  const cert = packId
    ? await getLatestPackCertification(workspaceId, packId)
    : null
  const memory = await listWorkspaceMemory(workspaceId, { limit: 30 })
  const { rows: inboxRows } = await query(
    `SELECT issue_kind, severity, status, title, resolved_at, created_at
     FROM steward_inbox_issues WHERE workspace_id = $1
     ORDER BY updated_at DESC LIMIT 50`,
    [workspaceId],
  )

  return {
    disclaimer:
      'Monk Mode evidence export for SOC/SOX diligence — not a certification of compliance.',
    generatedAt: new Date().toISOString(),
    workspaceId,
    packId,
    runCount: evidence.length,
    runs: evidence,
    certification: cert,
    stewardDecisions: inboxRows,
    workspaceMemory: memory,
    controls: [
      {
        id: 'MONK-1',
        title: 'Immutable Monk event log',
        status: evidence.length ? 'implemented' : 'pending',
        evidence: `${evidence.reduce((n, r) => n + r.events.length, 0)} events captured`,
      },
      {
        id: 'MONK-2',
        title: 'Human approval gates',
        status: inboxRows.some((r) => r.status === 'approved') ? 'implemented' : 'partial',
        evidence: `${inboxRows.filter((r) => r.status === 'approved').length} steward approvals`,
      },
      {
        id: 'MONK-3',
        title: 'Golden join certification',
        status: cert?.status === 'passed' ? 'implemented' : 'partial',
        evidence: cert
          ? `Recall ${cert.goldenRecall != null ? (Number(cert.goldenRecall) * 100).toFixed(1) : '—'}%`
          : 'Not run',
      },
    ],
  }
}

export function formatMonkEvidenceMarkdown(pack) {
  const lines = [
    '# Que Monk Mode — SOX / Audit Evidence',
    '',
    `Generated: ${pack.generatedAt}`,
    `Workspace: ${pack.workspaceId}`,
    '',
    '## Controls',
    '',
    '| ID | Control | Status | Evidence |',
    '| --- | --- | --- | --- |',
  ]
  for (const c of pack.controls || []) {
    lines.push(`| ${c.id} | ${c.title} | ${c.status} | ${c.evidence} |`)
  }
  lines.push('', '## Monk runs', '')
  for (const r of pack.runs || []) {
    lines.push(`### ${r.runId} · ${r.packId} · ${r.status}`)
    lines.push(`- Match: ${r.matchScore ?? '—'}%`)
    lines.push(`- Events: ${r.events.length}`)
    lines.push('')
  }
  return lines.join('\n')
}
