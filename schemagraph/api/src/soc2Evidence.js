/**
 * Phase 5 — SOC 2 evidence pack generator.
 * Produces a control checklist + audit samples for diligence.
 * Does NOT claim Type II certification — evidence for auditors only.
 */
import { query } from './db.js'
import { getSsoConfig } from './auth.js'
import { getCmkStatus } from './cmk.js'
import { getSiemConfig } from './siemExport.js'
import { listApiKeys } from './apiKeys.js'
import { listScimTokens } from './scim.js'
import { listAbacPolicies } from './abac.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import { oidcReady } from './oidc.js'
import { getSaasOpsSummary } from './saasOps.js'
import { getConnectorReliabilityStatus } from './connectorReliability.js'
import { getSoc2KickoffStatus } from './soc2Kickoff.js'

export async function buildSoc2EvidencePack(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const sso = getSsoConfig()
  const cmk = await getCmkStatus(workspaceId)
  const siem = await getSiemConfig(workspaceId)
  const apiKeys = await listApiKeys(workspaceId)
  const scimTokens = await listScimTokens(workspaceId)
  const abac = await listAbacPolicies(workspaceId)

  const { rows: auditSample } = await query(
    `SELECT action, summary, created_at FROM workspace_audit_events
     WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 25`,
    [workspaceId],
  )
  const { rows: memberCount } = await query(
    `SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1`,
    [workspaceId],
  )

  const saas = await getSaasOpsSummary(workspaceId).catch(() => null)
  const connectors = await getConnectorReliabilityStatus(workspaceId).catch(
    () => null,
  )
  const kickoff = await getSoc2KickoffStatus(workspaceId).catch(() => null)

  const controls = [
    {
      id: 'CC6.1',
      title: 'Logical access — SSO',
      status: oidcReady() ? 'implemented' : 'partial',
      evidence: sso.status || (oidcReady() ? 'ready' : 'not_configured'),
      note: settings.enforceSso
        ? 'Password login blocked when enforceSso=true (break-glass excepted)'
        : 'OIDC available; set enforceSso for org-wide SSO',
    },
    {
      id: 'CC6.2',
      title: 'SCIM directory sync',
      status: scimTokens.some((t) => !t.revokedAt) ? 'implemented' : 'available',
      evidence: `${scimTokens.filter((t) => !t.revokedAt).length} active SCIM token(s)`,
    },
    {
      id: 'CC6.3',
      title: 'Least-privilege API keys',
      status: apiKeys.some((k) => !k.revokedAt) ? 'implemented' : 'available',
      evidence: `${apiKeys.filter((k) => !k.revokedAt).length} key(s); scopes enforced`,
    },
    {
      id: 'CC6.6',
      title: 'Encryption — CMK option',
      status: cmk.enabled ? 'implemented' : 'available',
      evidence: cmk.enabled ? `CMK keyId=${cmk.keyId}` : 'Platform key; CMK optional',
    },
    {
      id: 'CC7.2',
      title: 'Monitoring — SIEM export',
      status: siem.enabled ? 'implemented' : 'available',
      evidence: siem.lastExportedAt
        ? `Last export ${siem.lastExportedAt}`
        : 'JSONL + webhook ready',
    },
    {
      id: 'CC8.1',
      title: 'Change management — audit trail',
      status: auditSample.length ? 'implemented' : 'partial',
      evidence: `${auditSample.length} recent audit events sampled`,
    },
    {
      id: 'ABAC',
      title: 'Fine-grained ABAC',
      status: abac.length ? 'implemented' : 'available',
      evidence: `${abac.length} policy(ies)`,
    },
    {
      id: 'PRIV-1',
      title: 'Schema-only AI + pinned samples',
      status: settings.aiMayUsePinnedSamples !== false ? 'implemented' : 'configured_off',
      evidence:
        'AI may use frozen scrubbed 5–10 row pins only; full lake and managed row payloads denied',
      note: `pinnedSampleRows=${settings.pinnedSampleRows ?? 10}; scrubSamples=${settings.scrubSamples !== false}`,
    },
    {
      id: 'PRIV-2',
      title: 'Offer B managed plane isolation',
      status: settings.enableManagedDataPlane ? 'implemented' : 'available',
      evidence: settings.enableManagedDataPlane
        ? `Enabled · plane=${settings.defaultExecutionPlane || 'customer'} · retention ${settings.managedRetentionDays ?? 90}d`
        : 'Disabled — customer warehouse SoR (Offer A)',
    },
    {
      id: 'HITL-1',
      title: 'Human Promote for joins',
      status: settings.enableAutoPromoteLowRisk ? 'partial' : 'implemented',
      evidence: settings.enableAutoPromoteLowRisk
        ? 'Auto-promote low-risk enabled (review policy)'
        : 'Auto-promote off — HITL Promote required',
    },
    {
      id: 'OPS-BACKUP',
      title: 'Metadata backup snapshots',
      status: saas?.checklist?.find((c) => c.id === 'backup')?.done
        ? 'implemented'
        : 'available',
      evidence:
        saas?.checklist?.find((c) => c.id === 'backup')?.evidence ||
        'No backup yet — run from Compliance ops',
    },
    {
      id: 'OPS-DR',
      title: 'DR drill evidence',
      status: saas?.checklist?.find((c) => c.id === 'dr_drill')?.done
        ? 'implemented'
        : 'available',
      evidence:
        saas?.checklist?.find((c) => c.id === 'dr_drill')?.evidence ||
        'No DR drill in 90d',
    },
    {
      id: 'OPS-ISO',
      title: 'Tenant isolation smoke tests',
      status: saas?.checklist?.find((c) => c.id === 'isolation')?.done
        ? 'implemented'
        : 'available',
      evidence:
        saas?.checklist?.find((c) => c.id === 'isolation')?.evidence ||
        'Run isolation test from enterprise settings',
    },
    {
      id: 'OPS-SYNC',
      title: 'Connector sync reliability',
      status:
        connectors?.summary?.breached > 0
          ? 'partial'
          : connectors?.summary?.total
            ? 'implemented'
            : 'available',
      evidence: connectors
        ? `${connectors.summary.ok} ok / ${connectors.summary.degraded} degraded / ${connectors.summary.breached} breached (schema sync SLA)`
        : 'n/a',
    },
  ]

  const pack = {
    schemaVersion: 1,
    kind: 'que.soc2_evidence_pack',
    disclaimer:
      'This is an engineering evidence pack for auditor diligence. It is NOT a SOC 2 Type II certification, attestation letter, or pen-test report.',
    generatedAt: new Date().toISOString(),
    workspaceId,
    region: process.env.QUE_REGION || settings.dataRegion || 'unspecified',
    residencyNote:
      settings.dataResidency ||
      process.env.QUE_DATA_RESIDENCY ||
      'Single-region deployment — configure QUE_REGION / dataResidency for customer contracts',
    slaTargets: {
      note: 'Targets for ops planning — not contractual SLAs until legal countersigns',
      uptimeTarget: settings.slaUptimeTarget || '99.9%',
      rpoHours: Number(settings.slaRpoHours) || 24,
      rtoHours: Number(settings.slaRtoHours) || 4,
    },
    membership: { members: memberCount[0]?.n || 0 },
    controls,
    auditSample: auditSample.map((a) => ({
      action: a.action,
      summary: a.summary,
      at: a.created_at,
    })),
    nextStepsForTypeII: [
      'Engage auditor (Type I then Type II observation period)',
      'Annual penetration test with remediations tracked',
      'Publish status page + on-call rota',
      'Execute DR drill and record RPO/RTO evidence',
      'Customer DPA + residency options in MSA',
    ],
    typeIIKickoff: kickoff
      ? {
          phase: kickoff.phase,
          auditorEngaged: kickoff.auditorEngaged,
          auditorName: kickoff.auditorName,
          penTestScheduledAt: kickoff.penTestScheduledAt,
          observationStartedAt: kickoff.observationStartedAt,
          evidenceFrozenAt: kickoff.evidenceFrozenAt,
          evidenceFrozenHash: kickoff.evidenceFrozenHash,
        }
      : null,
  }

  const markdown = formatEvidenceMarkdown(pack)
  return { pack, markdown }
}

function formatEvidenceMarkdown(pack) {
  const lines = [
    `# Que SOC 2 evidence pack`,
    ``,
    `> ${pack.disclaimer}`,
    ``,
    `- Generated: ${pack.generatedAt}`,
    `- Workspace: ${pack.workspaceId}`,
    `- Region: ${pack.region}`,
    `- Residency: ${pack.residencyNote}`,
    ``,
    `## SLA targets (non-contractual)`,
    `- Uptime target: ${pack.slaTargets.uptimeTarget}`,
    `- RPO: ${pack.slaTargets.rpoHours}h · RTO: ${pack.slaTargets.rtoHours}h`,
    ``,
    `## Controls`,
    `| ID | Title | Status | Evidence |`,
    `|----|-------|--------|----------|`,
  ]
  for (const c of pack.controls) {
    lines.push(
      `| ${c.id} | ${c.title} | ${c.status} | ${String(c.evidence).replace(/\|/g, '/')} |`,
    )
  }
  lines.push('', '## Next steps for Type II', '')
  for (const s of pack.nextStepsForTypeII) lines.push(`- ${s}`)
  lines.push('', '## Audit sample', '')
  for (const a of pack.auditSample.slice(0, 15)) {
    lines.push(`- \`${a.at}\` **${a.action}** — ${a.summary || ''}`)
  }
  return lines.join('\n')
}
