/**
 * SaaS metrics pack v1 — accounts, subscriptions, product usage, MRR/churn.
 */
export const SAAS_METRICS_PACK_V1 = {
  id: 'saas-metrics-v1',
  industry: 'SaaS',
  displayName: 'SaaS · Product & Revenue Metrics',
  description:
    'Accounts, subscriptions, and product events — MRR, churn, WAU, and expansion KPIs for PLG teams.',
  minMatchScore: 0.5,
  tableMatchers: [
    { pattern: 'accounts', weight: 1.0, entity: 'DimAccount' },
    { pattern: 'subscriptions', weight: 0.95, entity: 'FactSubscription' },
    { pattern: 'events', weight: 0.9, entity: 'FactEvent' },
    { pattern: 'invoices', weight: 0.85, entity: 'FactInvoice' },
    { pattern: 'plans', weight: 0.8, entity: 'DimPlan' },
  ],
  requiredForMonk: ['accounts', 'events'],
  kpis: [
    {
      id: 'mrr',
      label: 'Monthly recurring revenue',
      ceoQuestion: 'What is our MRR?',
      sqlTemplate: `SELECT COALESCE(SUM(s.mrr_amount), 0) AS mrr
FROM {subscriptions} s
WHERE s.status = 'active'`,
    },
    {
      id: 'wau',
      label: 'Weekly active accounts',
      ceoQuestion: 'How many accounts were active this week?',
      sqlTemplate: `SELECT COUNT(DISTINCT e.account_id) AS wau
FROM {events} e
WHERE e.event_at >= CURRENT_DATE - INTERVAL '7 days'`,
    },
    {
      id: 'churn_rate',
      label: 'Logo churn rate',
      ceoQuestion: 'What is our churn rate?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(CASE WHEN s.status = 'cancelled' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS churn_pct
FROM {subscriptions} s`,
    },
  ],
  jobs: [
    {
      id: 'account_usage_mart',
      title: 'Account usage mart',
      description: 'Weekly events per account for product analytics.',
      sql: `SELECT a.account_id, a.name, COUNT(e.event_id) AS events_7d
FROM {accounts} a
LEFT JOIN {events} e
  ON a.account_id = e.account_id
 AND e.event_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 3 DESC
LIMIT 500`,
    },
  ],
  qualityRules: [
    {
      id: 'orphan_subscription',
      severity: 'high',
      title: 'Subscriptions missing account link',
      description: 'subscription.account_id should reference accounts.account_id',
    },
  ],
  capabilities: [
    { id: 'product_chat', label: 'Product metrics chat', href: '/chat' },
    { id: 'joins_saas', label: 'Account join graph', href: '/joins' },
    { id: 'metrics_kpis', label: 'SaaS KPI registry', href: '/metrics' },
    { id: 'ceo_dashboard', label: 'SaaS metrics board', href: '/bi?report=saas-metrics' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
  ],
  dashboards: [{ id: 'saas-metrics', title: 'SaaS Metrics Board', audience: 'CEO' }],
  goldenPairSource: null,
  templatePackId: 'saas-product-usage',
}
