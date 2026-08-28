/**
 * India GST pack v1 — GST invoices, returns, vendors (India mid-market stub).
 */
export const INDIA_GST_PACK_V1 = {
  id: 'india-gst-v1',
  industry: 'India GST',
  displayName: 'India · GST Compliance (stub)',
  description:
    'GST invoices, returns, and vendor master — ITC eligibility, GSTR-1 vs books variance, HSN summary for India finance teams.',
  minMatchScore: 0.45,
  tableMatchers: [
    { pattern: 'gst_invoices', weight: 1.0, entity: 'FactGstInvoice' },
    { pattern: 'gst_returns', weight: 0.95, entity: 'FactGstReturn' },
    { pattern: 'vendors', weight: 0.9, entity: 'DimVendor' },
    { pattern: 'hsn', weight: 0.75, entity: 'DimHsn' },
    { pattern: 'purchase_register', weight: 0.85, entity: 'FactPurchase' },
  ],
  requiredForMonk: ['gst_invoices', 'vendors'],
  policies: {
    noAutoMaterialize: true,
    requireHumanPublish: true,
    minCertRecall: 0.4,
  },
  kpis: [
    {
      id: 'itc_eligible',
      label: 'ITC eligible amount',
      ceoQuestion: 'How much input tax credit is eligible?',
      sqlTemplate: `SELECT COALESCE(SUM(i.itc_amount), 0) AS itc_eligible
FROM {gst_invoices} i
WHERE i.itc_eligible = true`,
    },
    {
      id: 'gstr1_variance',
      label: 'GSTR-1 vs books variance',
      ceoQuestion: 'What is the variance between GSTR-1 and books?',
      sqlTemplate: `SELECT COALESCE(SUM(i.taxable_value), 0) - COALESCE(SUM(r.reported_taxable), 0) AS variance
FROM {gst_invoices} i
FULL OUTER JOIN {gst_returns} r ON i.return_period = r.return_period`,
    },
    {
      id: 'vendor_gstin_coverage',
      label: 'Vendor GSTIN coverage %',
      ceoQuestion: 'What percent of vendors have valid GSTIN?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(CASE WHEN v.gstin IS NOT NULL AND LENGTH(v.gstin) = 15 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS gstin_coverage_pct
FROM {vendors} v`,
    },
  ],
  jobs: [
    {
      id: 'itc_review_queue',
      title: 'ITC review queue',
      description: 'Invoices flagged for ITC mismatch — steward review required.',
      sql: `SELECT i.invoice_id, i.vendor_id, i.itc_amount, i.itc_eligible
FROM {gst_invoices} i
WHERE i.itc_eligible = false OR i.itc_amount IS NULL
LIMIT 500`,
    },
  ],
  qualityRules: [
    {
      id: 'invalid_gstin',
      severity: 'critical',
      title: 'Invalid vendor GSTIN format',
      description: 'GSTIN must be 15 characters; flag before filing.',
    },
  ],
  capabilities: [
    { id: 'gst_chat', label: 'GST compliance chat', href: '/chat' },
    { id: 'joins_gst', label: 'Vendor join graph', href: '/joins' },
    { id: 'metrics_kpis', label: 'GST KPIs', href: '/metrics' },
    { id: 'compliance_export', label: 'Compliance export', href: '/compliance' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
  ],
  dashboards: [{ id: 'india-gst', title: 'GST Compliance Board', audience: 'Finance' }],
  goldenPairSource: null,
  templatePackId: 'india-gst-compliance',
}
