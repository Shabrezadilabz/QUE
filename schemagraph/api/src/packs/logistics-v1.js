/**
 * Logistics pack v1 — shipments, carriers, SLA clocks for ops DE handoff.
 */
export const LOGISTICS_PACK_V1 = {
  id: 'logistics-v1',
  industry: 'Logistics',
  displayName: 'Logistics · Shipment SLA',
  description:
    'Shipments, carriers, and SLA clocks — on-time delivery %, late shipment drill-down, carrier scorecards.',
  minMatchScore: 0.5,
  tableMatchers: [
    { pattern: 'shipments', weight: 1.0, entity: 'FactShipment' },
    { pattern: 'carriers', weight: 0.95, entity: 'DimCarrier' },
    { pattern: 'sla_clocks', weight: 0.85, entity: 'DimSlaClock' },
    { pattern: 'tracking', weight: 0.75, entity: 'FactTracking' },
    { pattern: 'warehouses', weight: 0.7, entity: 'DimWarehouse' },
  ],
  requiredForMonk: ['shipments', 'carriers'],
  kpis: [
    {
      id: 'on_time_pct',
      label: 'On-time delivery %',
      ceoQuestion: 'What percent of shipments arrive on time?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(CASE WHEN s.delivered_at <= s.promised_at THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS on_time_pct
FROM {shipments} s`,
    },
    {
      id: 'late_shipments',
      label: 'Late shipments',
      ceoQuestion: 'How many shipments are late?',
      sqlTemplate: `SELECT COUNT(*) AS late_shipments
FROM {shipments} s
WHERE s.delivered_at IS NULL OR s.delivered_at > s.promised_at`,
    },
    {
      id: 'avg_transit_days',
      label: 'Average transit days',
      ceoQuestion: 'What is our average transit time?',
      sqlTemplate: `SELECT AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.shipped_at)) / 86400) AS avg_transit_days
FROM {shipments} s
WHERE s.delivered_at IS NOT NULL AND s.shipped_at IS NOT NULL`,
    },
  ],
  jobs: [
    {
      id: 'late_shipments_mart',
      title: 'Late shipments mart',
      description: 'Shipments past promised_at — ops review queue.',
      sql: `SELECT s.shipment_id, s.carrier_id, s.promised_at, s.delivered_at
FROM {shipments} s
WHERE s.delivered_at IS NULL OR s.delivered_at > s.promised_at
LIMIT 500`,
    },
  ],
  qualityRules: [
    {
      id: 'orphan_carrier',
      severity: 'high',
      title: 'Shipments missing carrier link',
      description: 'shipment.carrier_id should reference carriers.carrier_id',
    },
  ],
  capabilities: [
    { id: 'ops_chat', label: 'Ops SLA chat', href: '/chat' },
    { id: 'joins_logistics', label: 'Shipment join graph', href: '/joins' },
    { id: 'metrics_kpis', label: 'SLA KPIs', href: '/metrics' },
    { id: 'ceo_dashboard', label: 'SLA dashboard', href: '/bi?report=logistics-sla' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
  ],
  dashboards: [{ id: 'logistics-sla', title: 'Logistics SLA Dashboard', audience: 'Ops' }],
  goldenPairSource: null,
  templatePackId: 'logistics-shipment-sla',
}
