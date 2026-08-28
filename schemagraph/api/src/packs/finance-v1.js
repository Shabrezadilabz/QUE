/**
 * Finance reconciliation pack v1 — ledger ↔ bank feed tie-out.
 */
export const FINANCE_PACK_V1 = {
  id: 'finance-v1',
  industry: 'Finance',
  displayName: 'Finance · Ledger Reconciliation',
  description:
    'Ledger lines, bank feeds, and entities — unmatched %, variance, and tie-out KPIs with human gates on production ledger.',
  minMatchScore: 0.5,
  tableMatchers: [
    { pattern: 'ledger', weight: 1.0, entity: 'FactLedger' },
    { pattern: 'bank_feed', weight: 0.95, entity: 'FactBankFeed' },
    { pattern: 'entities', weight: 0.8, entity: 'DimEntity' },
    { pattern: 'finance.payments', weight: 0.75, entity: 'FactPayment' },
    { pattern: 'finance.invoices', weight: 0.75, entity: 'FactInvoice' },
  ],
  requiredForMonk: ['ledger', 'bank_feed'],
  policies: {
    noAutoMaterialize: true,
    noAutoFixApply: true,
    minCertRecall: 0.45,
    requireHumanPublish: true,
  },
  kpis: [
    {
      id: 'unmatched_pct',
      label: 'Unmatched ledger lines %',
      ceoQuestion: 'What percent of ledger lines are unmatched?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(CASE WHEN b.ref IS NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS unmatched_pct
FROM {ledger} l
LEFT JOIN {bank_feed} b ON l.external_ref = b.ref`,
    },
    {
      id: 'variance_total',
      label: 'Total variance $',
      ceoQuestion: 'What is our reconciliation variance?',
      sqlTemplate: `SELECT COALESCE(SUM(l.amount - COALESCE(b.amount, 0)), 0) AS variance_total
FROM {ledger} l
LEFT JOIN {bank_feed} b ON l.external_ref = b.ref`,
    },
    {
      id: 'tie_out_status',
      label: 'Tie-out pass rate',
      ceoQuestion: 'How many entities tie out cleanly?',
      sqlTemplate: `SELECT COUNT(*) AS tied_out_entities
FROM (
  SELECT entity_id FROM {ledger} l
  JOIN {bank_feed} b ON l.external_ref = b.ref
  GROUP BY 1 HAVING ABS(SUM(l.amount - b.amount)) < 0.01
) t`,
    },
  ],
  jobs: [
    {
      id: 'unmatched_ledger_mart',
      title: 'Unmatched ledger lines',
      description: 'Ledger rows with no bank feed match — steward review required.',
      sql: `SELECT l.*
FROM {ledger} l
LEFT JOIN {bank_feed} b ON l.external_ref = b.ref
WHERE b.ref IS NULL
LIMIT 500`,
    },
  ],
  qualityRules: [
    {
      id: 'orphan_ledger_ref',
      severity: 'high',
      title: 'Ledger missing bank feed match',
      description: 'external_ref should match bank_feed.ref',
    },
  ],
  capabilities: [
    { id: 'reconciliation_chat', label: 'Finance chat', href: '/chat' },
    { id: 'joins_ledger', label: 'Ledger join graph', href: '/joins' },
    { id: 'metrics_kpis', label: 'Reconciliation KPIs', href: '/metrics' },
    { id: 'steward_gates', label: 'Steward approval gates', href: '/steward' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
    { id: 'compliance_export', label: 'SOX evidence export', href: '/compliance' },
  ],
  dashboards: [{ id: 'finance-recon', title: 'Finance Reconciliation Board', audience: 'CFO' }],
  goldenPairSource: 'finance/finance-golden-pairs.json',
  templatePackId: 'finance-reconciliation',
}
