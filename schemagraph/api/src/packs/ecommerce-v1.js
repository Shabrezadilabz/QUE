/**
 * Ecommerce industry pack v1 — SportEdge-aligned ontology, KPIs, quality rules, jobs.
 */
export const ECOMMERCE_PACK_V1 = {
  id: 'ecommerce-v1',
  industry: 'Ecommerce',
  displayName: 'Ecommerce (Retail / D2C)',
  description:
    'Orders, brands, customers, products — revenue KPIs, join graph, and quality rules for retail.',
  minMatchScore: 0.55,
  tableMatchers: [
    { pattern: 'orders', weight: 1.0, entity: 'FactOrder' },
    { pattern: 'brands', weight: 0.95, entity: 'DimBrand' },
    { pattern: 'customers', weight: 0.85, entity: 'DimCustomer' },
    { pattern: 'products', weight: 0.85, entity: 'DimProduct' },
    { pattern: 'order_items', weight: 0.9, entity: 'FactOrderLine' },
    { pattern: 'payments', weight: 0.7, entity: 'FactPayment' },
  ],
  requiredForMonk: ['orders', 'brands'],
  kpis: [
    {
      id: 'revenue_by_brand',
      label: 'Revenue by brand',
      ceoQuestion: "What's {brand} revenue?",
      sqlTemplate: `SELECT b.name AS brand, SUM(o.order_total) AS revenue
FROM {orders} o
JOIN {brands} b ON o.brand_id = b.brand_id
GROUP BY 1
ORDER BY 2 DESC`,
    },
    {
      id: 'order_count',
      label: 'Order count',
      ceoQuestion: 'How many orders do we have?',
      sqlTemplate: `SELECT COUNT(*) AS order_count FROM {orders}`,
    },
    {
      id: 'aov',
      label: 'Average order value',
      ceoQuestion: 'What is our average order value?',
      sqlTemplate: `SELECT AVG(order_total) AS average_order_value FROM {orders}`,
    },
    {
      id: 'top_skus',
      label: 'Top products by revenue',
      ceoQuestion: 'What are our best sellers?',
      sqlTemplate: `SELECT p.name AS product, SUM(oi.quantity * oi.unit_price) AS revenue
FROM {order_items} oi
JOIN {products} p ON oi.product_id = p.product_id
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10`,
    },
    {
      id: 'repeat_customers',
      label: 'Repeat customer rate',
      ceoQuestion: 'How many customers ordered more than once?',
      sqlTemplate: `SELECT COUNT(*) AS repeat_customers
FROM (
  SELECT customer_id FROM {orders}
  GROUP BY 1 HAVING COUNT(*) > 1
) t`,
    },
  ],
  jobs: [
    {
      id: 'brand_revenue_mart',
      title: 'Brand revenue mart',
      description:
        'Aggregate order revenue by brand — CEO chat and KPI registry source.',
      sql: `-- Monk Mode: brand revenue mart
SELECT b.name AS brand, b.brand_code,
       COUNT(DISTINCT o.order_id) AS orders,
       SUM(o.order_total) AS revenue
FROM {orders} o
JOIN {brands} b ON o.brand_id = b.brand_id
GROUP BY 1, 2
ORDER BY revenue DESC`,
      materialize: {
        kind: 'view',
        schema: 'que_marts',
        objectName: 'brand_revenue_mart',
      },
    },
    {
      id: 'order_quality_scan',
      title: 'Order quality scan',
      description: 'Null keys and negative totals for steward review.',
      sql: `-- Monk Mode: quality scan
SELECT 'orphan_brand' AS issue, COUNT(*) AS n
FROM {orders} o
LEFT JOIN {brands} b ON o.brand_id = b.brand_id
WHERE b.brand_id IS NULL
UNION ALL
SELECT 'negative_total', COUNT(*)
FROM {orders}
WHERE order_total < 0`,
    },
  ],
  qualityRules: [
    {
      id: 'orphan_order_brand',
      severity: 'high',
      title: 'Orders missing brand link',
      description: 'order.brand_id should reference brands.brand_id',
    },
    {
      id: 'negative_order_total',
      severity: 'medium',
      title: 'Negative order totals',
      description: 'order_total should be >= 0',
    },
  ],
  capabilities: [
    { id: 'ceo_revenue_chat', label: 'CEO revenue chat', href: '/chat' },
    { id: 'brand_joins', label: 'Brand join graph', href: '/joins' },
    { id: 'revenue_jobs', label: 'Revenue mart jobs', href: '/jobs' },
    { id: 'metrics_kpis', label: 'KPI registry', href: '/metrics' },
    { id: 'ceo_dashboard', label: 'CEO revenue dashboard', href: '/bi?report=ceo-revenue' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
  ],
  dashboards: [
    {
      id: 'ceo-revenue',
      title: 'CEO Revenue Dashboard',
      audience: 'CEO',
    },
  ],
  goldenPairSource: 'sportedge-golden-pairs.json',
}
