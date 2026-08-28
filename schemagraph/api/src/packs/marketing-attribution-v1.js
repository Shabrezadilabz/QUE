/**
 * Marketing attribution pack v1 — touches, conversions, campaigns.
 */
export const MARKETING_ATTRIBUTION_PACK_V1 = {
  id: 'marketing-attribution-v1',
  industry: 'Marketing',
  displayName: 'Marketing · Multi-touch Attribution',
  description:
    'Touches, conversions, and campaigns — attributed revenue, CPA, and channel mix KPIs with HITL on fuzzy keys.',
  minMatchScore: 0.5,
  tableMatchers: [
    { pattern: 'touches', weight: 1.0, entity: 'FactTouch' },
    { pattern: 'conversions', weight: 0.95, entity: 'FactConversion' },
    { pattern: 'campaigns', weight: 0.9, entity: 'DimCampaign' },
    { pattern: 'channels', weight: 0.8, entity: 'DimChannel' },
    { pattern: 'visitors', weight: 0.75, entity: 'DimVisitor' },
  ],
  requiredForMonk: ['touches', 'conversions'],
  kpis: [
    {
      id: 'attributed_revenue',
      label: 'Attributed revenue',
      ceoQuestion: 'What is our attributed revenue?',
      sqlTemplate: `SELECT COALESCE(SUM(c.revenue), 0) AS attributed_revenue
FROM {conversions} c`,
    },
    {
      id: 'cpa',
      label: 'Cost per acquisition',
      ceoQuestion: 'What is our CPA?',
      sqlTemplate: `SELECT COALESCE(SUM(cam.spend), 0) / NULLIF(COUNT(DISTINCT c.conversion_id), 0) AS cpa
FROM {conversions} c
LEFT JOIN {campaigns} cam ON c.campaign_id = cam.campaign_id`,
    },
    {
      id: 'touch_to_convert',
      label: 'Avg touches to convert',
      ceoQuestion: 'How many touches before conversion?',
      sqlTemplate: `SELECT AVG(t.touch_count) AS avg_touches
FROM (
  SELECT c.conversion_id, COUNT(t.touch_id) AS touch_count
  FROM {conversions} c
  JOIN {touches} t ON c.visitor_id = t.visitor_id
  GROUP BY 1
) t`,
    },
  ],
  jobs: [
    {
      id: 'attribution_draft',
      title: 'Touch → conversion draft',
      description: 'Multi-touch join draft — do not auto-promote fuzzy campaign keys.',
      sql: `SELECT t.touch_id, t.campaign_id, c.conversion_id, c.revenue
FROM {touches} t
LEFT JOIN {conversions} c ON t.visitor_id = c.visitor_id
LIMIT 500`,
    },
  ],
  qualityRules: [
    {
      id: 'fuzzy_campaign_key',
      severity: 'medium',
      title: 'Review fuzzy campaign keys',
      description: 'Campaign name matches require human promote before materialize.',
    },
  ],
  capabilities: [
    { id: 'marketing_chat', label: 'Attribution chat', href: '/chat' },
    { id: 'joins_marketing', label: 'Attribution join graph', href: '/joins' },
    { id: 'metrics_kpis', label: 'Marketing KPIs', href: '/metrics' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
  ],
  dashboards: [],
  goldenPairSource: null,
  templatePackId: 'marketing-attribution',
}
