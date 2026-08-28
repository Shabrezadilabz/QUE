/**
 * Manufacturing pack v1 — work orders, BOM, inventory for plant ops.
 */
export const MANUFACTURING_PACK_V1 = {
  id: 'manufacturing-v1',
  industry: 'Manufacturing',
  displayName: 'Manufacturing · OEE & Inventory',
  description:
    'Work orders, bill of materials, and inventory — yield %, scrap rate, and stock-out risk KPIs.',
  minMatchScore: 0.5,
  tableMatchers: [
    { pattern: 'work_orders', weight: 1.0, entity: 'FactWorkOrder' },
    { pattern: 'bom', weight: 0.95, entity: 'DimBom' },
    { pattern: 'inventory', weight: 0.9, entity: 'FactInventory' },
    { pattern: 'plants', weight: 0.75, entity: 'DimPlant' },
    { pattern: 'skus', weight: 0.8, entity: 'DimSku' },
  ],
  requiredForMonk: ['work_orders', 'inventory'],
  kpis: [
    {
      id: 'yield_pct',
      label: 'Production yield %',
      ceoQuestion: 'What is our production yield?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(w.good_qty) / NULLIF(SUM(w.planned_qty), 0), 2) AS yield_pct
FROM {work_orders} w`,
    },
    {
      id: 'scrap_rate',
      label: 'Scrap rate',
      ceoQuestion: 'What is our scrap rate?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(w.scrap_qty) / NULLIF(SUM(w.planned_qty), 0), 2) AS scrap_rate_pct
FROM {work_orders} w`,
    },
    {
      id: 'stock_out_skus',
      label: 'SKUs below reorder',
      ceoQuestion: 'How many SKUs are below reorder point?',
      sqlTemplate: `SELECT COUNT(*) AS stock_out_skus
FROM {inventory} i
WHERE i.on_hand_qty < i.reorder_point`,
    },
  ],
  jobs: [
    {
      id: 'yield_variance_mart',
      title: 'Yield variance mart',
      description: 'Work orders below target yield — ops review.',
      sql: `SELECT w.work_order_id, w.planned_qty, w.good_qty, w.scrap_qty
FROM {work_orders} w
WHERE w.good_qty < w.planned_qty * 0.95
LIMIT 500`,
    },
  ],
  qualityRules: [
    {
      id: 'bom_orphan',
      severity: 'high',
      title: 'BOM lines missing SKU',
      description: 'bom.sku_id should reference skus.sku_id',
    },
  ],
  capabilities: [
    { id: 'plant_chat', label: 'Plant ops chat', href: '/chat' },
    { id: 'joins_mfg', label: 'BOM join graph', href: '/joins' },
    { id: 'metrics_kpis', label: 'OEE KPIs', href: '/metrics' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
  ],
  dashboards: [],
  goldenPairSource: null,
  templatePackId: 'manufacturing-oee',
}
