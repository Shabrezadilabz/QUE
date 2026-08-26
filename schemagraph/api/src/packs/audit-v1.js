/**
 * Audit / SOX evidence pack v1 — drift, certifications, immutable Monk log.
 */
export const AUDIT_PACK_V1 = {
  id: 'audit-v1',
  industry: 'Audit',
  displayName: 'Audit · SOX Evidence',
  description:
    'Certification queues, drift baselines, and Monk Mode audit trail exports for SOC/SOX diligence.',
  minMatchScore: 0.45,
  tableMatchers: [
    { pattern: 'orders', weight: 0.7, entity: 'FactOrder' },
    { pattern: 'ledger', weight: 0.9, entity: 'FactLedger' },
    { pattern: 'staging', weight: 0.6, entity: 'StgLayer' },
    { pattern: 'dim_', weight: 0.5, entity: 'DimTable' },
  ],
  requiredForMonk: [],
  policies: {
    immutableMonkLog: true,
    exportEvidenceRequired: true,
    minCertRecall: 0.4,
  },
  kpis: [
    {
      id: 'certified_assets',
      label: 'Certified assets count',
      ceoQuestion: 'How many assets are certified?',
      sqlTemplate: `SELECT COUNT(*) AS certified_count FROM {orders}`,
    },
    {
      id: 'drift_open',
      label: 'Open drift alerts',
      ceoQuestion: 'How many drift issues are open?',
      sqlTemplate: `SELECT 0 AS drift_open`,
    },
  ],
  jobs: [],
  qualityRules: [
    {
      id: 'contract_frozen',
      severity: 'medium',
      title: 'Verify contract freeze before export',
      description: 'Run contract tests and freeze before attested delivery.',
    },
  ],
  capabilities: [
    { id: 'compliance_export', label: 'SOX evidence pack', href: '/compliance' },
    { id: 'eval_harness', label: 'Golden eval', href: '/eval' },
    { id: 'steward_cert', label: 'Certification queue', href: '/steward' },
    { id: 'drift_agent', label: 'Drift monitoring', href: '/drift-agent' },
    { id: 'lineage', label: 'Lineage evidence', href: '/lineage' },
  ],
  goldenPairSource: null,
}
