import type { DataSourceType } from '@/types/dataSource'

/** Que capability badges (Databox-style: Datasets / Metric Builder → our wedge). */
export type ConnectorCapability =
  | 'Schema sync'
  | 'Join assist'
  | 'Live validate'
  | 'Fixture POC'
  | 'Upload'

export type ConnectorCategoryId =
  | 'all'
  | 'databases'
  | 'warehouses'
  | 'files'
  | 'crm'
  | 'commerce'
  | 'custom'

export type ConnectorAuthMode = 'fixture' | 'credentials' | 'upload' | 'request'

export type CatalogItem = {
  key: string
  title: string
  categoryId: ConnectorCategoryId
  categoryLabel: string
  blurb: string
  /** One-line “what this source is for” */
  purpose: string
  type?: DataSourceType
  creatable: boolean
  capabilities: ConnectorCapability[]
  /** Preferred first-run path — fixtures feel like one-click OAuth */
  preferredAuth: ConnectorAuthMode
  /** Optional wizard defaults (e.g. RDS SSL, live mode) */
  defaultLive?: boolean
  defaultConfig?: Record<string, unknown>
}

export const CONNECTOR_CATEGORIES: {
  id: ConnectorCategoryId
  label: string
}[] = [
  { id: 'all', label: 'All' },
  { id: 'databases', label: 'Databases' },
  { id: 'warehouses', label: 'Warehouses' },
  { id: 'files', label: 'Files' },
  { id: 'crm', label: 'CRM' },
  { id: 'commerce', label: 'Commerce & billing' },
  { id: 'custom', label: 'Custom' },
]

export const CONNECTOR_CATALOG: CatalogItem[] = [
  {
    key: 'postgresql',
    title: 'PostgreSQL',
    categoryId: 'databases',
    categoryLabel: 'Relational DB',
    blurb: 'Managed RDS or on-prem — sync tables and FKs into the Que graph.',
    purpose: 'OLTP / app schemas for join discovery',
    type: 'postgresql',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Live validate'],
    preferredAuth: 'credentials',
  },
  {
    key: 'mysql',
    title: 'MySQL',
    categoryId: 'databases',
    categoryLabel: 'Relational DB',
    blurb: 'India SMB OLTP — fixture POC or live RDS/Aurora introspect.',
    purpose: 'App DB schema for join discovery (India SMB #5)',
    type: 'mysql',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC', 'Live validate'],
    preferredAuth: 'fixture',
  },
  {
    key: 'mysql_rds',
    title: 'Amazon RDS (MySQL)',
    categoryId: 'databases',
    categoryLabel: 'AWS RDS',
    blurb: 'Same MySQL connector — preset for RDS/Aurora with TLS to your endpoint.',
    purpose: 'India cloud OLTP on RDS — live introspect or fixture fallback',
    type: 'mysql',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC', 'Live validate'],
    preferredAuth: 'credentials',
    defaultLive: true,
    defaultConfig: { ssl: true, port: 3306 },
  },
  {
    key: 'mongodb',
    title: 'MongoDB',
    categoryId: 'databases',
    categoryLabel: 'Document DB',
    blurb: 'Infer collections as tables for cross-source stitch sessions.',
    purpose: 'Document stores next to relational warehouses',
    type: 'mongodb',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist'],
    preferredAuth: 'credentials',
  },
  {
    key: 'snowflake',
    title: 'Snowflake',
    categoryId: 'warehouses',
    categoryLabel: 'Cloud warehouse',
    blurb: 'Fixture POC in one click, or live account + warehouse + token.',
    purpose: 'Cross-cloud warehouse joins (SF ↔ lakehouse)',
    type: 'snowflake',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Live validate', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'databricks',
    title: 'Databricks',
    categoryId: 'warehouses',
    categoryLabel: 'Lakehouse',
    blurb: 'Unity Catalog fixtures or live SQL warehouse — optional query-history joins.',
    purpose: 'Lakehouse tables for HITL join review',
    type: 'databricks',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Live validate', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'excel',
    title: 'Excel',
    categoryId: 'files',
    categoryLabel: 'Spreadsheet',
    blurb: 'Upload workbooks — Que infers sheets as tables.',
    purpose: 'Quick schema from business spreadsheets',
    type: 'excel',
    creatable: true,
    capabilities: ['Schema sync', 'Upload'],
    preferredAuth: 'upload',
  },
  {
    key: 'csv',
    title: 'CSV',
    categoryId: 'files',
    categoryLabel: 'Flat file',
    blurb: 'Drop CSV/TSV samples for fast onboarding and join demos.',
    purpose: 'Lightweight file-based schema samples',
    type: 'csv',
    creatable: true,
    capabilities: ['Schema sync', 'Upload'],
    preferredAuth: 'upload',
  },
  {
    key: 'bigquery',
    title: 'BigQuery',
    categoryId: 'warehouses',
    categoryLabel: 'Cloud warehouse',
    blurb: 'Fixture POC or live project + dataset + OAuth access token.',
    purpose: 'GCP warehouse schemas for HITL stitch',
    type: 'bigquery',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'salesforce',
    title: 'Salesforce',
    categoryId: 'crm',
    categoryLabel: 'CRM',
    blurb: 'Fixture CRM objects or live describe via instance URL + token.',
    purpose: 'CRM schema for Account/Contact/Opportunity joins',
    type: 'salesforce',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'shopify',
    title: 'Shopify',
    categoryId: 'commerce',
    categoryLabel: 'D2C storefront',
    blurb: 'Orders, customers, products — fixture POC for India D2C stack.',
    purpose: 'E-commerce orders joined to Razorpay / Stripe payments',
    type: 'shopify',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'razorpay',
    title: 'Razorpay',
    categoryId: 'commerce',
    categoryLabel: 'India payments',
    blurb: 'Payments, orders, refunds — fixture for UPI/card reconciliation.',
    purpose: 'India payment rails next to Shopify orders',
    type: 'razorpay',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'zoho',
    title: 'Zoho Books',
    categoryId: 'commerce',
    categoryLabel: 'India ERP',
    blurb: 'Invoices and ledger objects — fixture for GST / billing joins.',
    purpose: 'India invoicing joined to orders and payments',
    type: 'zoho',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'stripe',
    title: 'Stripe',
    categoryId: 'commerce',
    categoryLabel: 'Global billing',
    blurb: 'Customers, charges, subscriptions — fixture POC (S12 priority).',
    purpose: 'SaaS billing + payment metadata for join inference',
    type: 'stripe',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'chargebee',
    title: 'Chargebee',
    categoryId: 'commerce',
    categoryLabel: 'India SaaS billing',
    blurb: 'Subscriptions, invoices, GST — fixture POC (S12 priority #10).',
    purpose: 'India SaaS MRR + invoice joins to Stripe / HubSpot',
    type: 'chargebee',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'google_ads',
    title: 'Google Ads',
    categoryId: 'commerce',
    categoryLabel: 'Marketing attribution',
    blurb: 'Campaigns, ad groups, daily stats — fixture POC (S12 priority #3).',
    purpose: 'Paid search spend joined to Shopify orders / HubSpot deals',
    type: 'google_ads',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 'hubspot',
    title: 'HubSpot',
    categoryId: 'crm',
    categoryLabel: 'CRM',
    blurb: 'Companies, contacts, deals — fixture POC (S12 priority #1).',
    purpose: 'CRM pipeline joined to product usage and revenue',
    type: 'hubspot',
    creatable: true,
    capabilities: ['Schema sync', 'Join assist', 'Fixture POC'],
    preferredAuth: 'fixture',
  },
  {
    key: 's3',
    title: 'AWS S3',
    categoryId: 'custom',
    categoryLabel: 'Object store',
    blurb: 'JSON / CSV / Parquet from buckets — request connector.',
    purpose: 'Lake files as schema sources (roadmap)',
    creatable: false,
    capabilities: ['Schema sync'],
    preferredAuth: 'request',
  },
  {
    key: 'custom-api',
    title: 'Custom API',
    categoryId: 'custom',
    categoryLabel: 'REST',
    blurb: 'Bring your own OpenAPI / REST — use CSV upload as a bridge today.',
    purpose: 'Any SaaS without a native connector yet',
    creatable: false,
    capabilities: ['Upload'],
    preferredAuth: 'request',
  },
]

export function filterConnectorCatalog(
  items: CatalogItem[],
  opts: { query?: string; categoryId?: ConnectorCategoryId },
): CatalogItem[] {
  const q = (opts.query ?? '').trim().toLowerCase()
  const cat = opts.categoryId ?? 'all'
  return items.filter((c) => {
    if (cat !== 'all' && c.categoryId !== cat) return false
    if (!q) return true
    const hay = [
      c.title,
      c.categoryLabel,
      c.blurb,
      c.purpose,
      ...c.capabilities,
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export const POC_PACK = {
  id: 'sf-dbx-fixture',
  title: 'SF ↔ DBX fixture POC pack',
  body: 'Adds Snowflake + Databricks connector slots. Skip any you do not need; add live credentials or use demo data per row.',
  snowflake: {
    name: 'POC · Snowflake fixture',
    description: 'Que POC pack — Snowflake demo schema (fixture)',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/snowflake_demo.json',
    },
  },
  databricks: {
    name: 'POC · Databricks fixture',
    description: 'Que POC pack — Unity Catalog demo (fixture)',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/databricks_unity_demo.json',
      catalog: 'main',
      schema: 'analytics',
    },
  },
} as const

/** India SMB — app DB + commerce payments (fixture POC). */
export const INDIA_SMB_POC_PACK = {
  id: 'india-smb-fixture',
  title: 'India SMB full stack POC',
  body:
    'MySQL + Shopify + Razorpay slots — pick connectors, skip any, then Connect live or Use demo before Workspace fills.',
  mysql: {
    name: 'POC · MySQL fixture',
    description: 'Que POC pack — India SMB app schema (customers/orders)',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/mysql_demo.json',
    },
  },
  shopify: {
    name: 'POC · Shopify fixture',
    description: 'Que POC pack — Shopify storefront orders',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/shopify_demo.json',
    },
  },
  razorpay: {
    name: 'POC · Razorpay fixture',
    description: 'Que POC pack — Razorpay UPI/card payments',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/razorpay_demo.json',
    },
  },
} as const

/** Marketing attribution — Google Ads spend + Shopify orders (fixture POC). */
export const MARKETING_ATTRIBUTION_POC_PACK = {
  id: 'marketing-attribution-fixture',
  title: 'Marketing attribution POC pack',
  body:
    'Google Ads + Shopify slots — skip either, Connect live or Use demo, then join campaign spend ↔ order IDs.',
  google_ads: {
    name: 'POC · Google Ads fixture',
    description: 'Que POC pack — campaigns/ad groups/daily stats',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/google_ads_demo.json',
    },
  },
  shopify: {
    name: 'POC · Shopify fixture',
    description: 'Que POC pack — Shopify orders for UTM / campaign joins',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/shopify_demo.json',
    },
  },
} as const

/** India SaaS — Chargebee subscriptions + Stripe payments + HubSpot pipeline (fixture POC). */
export const INDIA_SAAS_POC_PACK = {
  id: 'india-saas-fixture',
  title: 'India SaaS billing POC pack',
  body:
    'Chargebee + Stripe + HubSpot slots — pick/skip connectors, then Connect live or Use demo for MRR ↔ payments ↔ deals.',
  chargebee: {
    name: 'POC · Chargebee fixture',
    description: 'Que POC pack — India SaaS subscriptions/invoices (GST)',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/chargebee_demo.json',
    },
  },
  stripe: {
    name: 'POC · Stripe fixture',
    description: 'Que POC pack — Stripe charges linked to Chargebee transactions',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/stripe_demo.json',
    },
  },
  hubspot: {
    name: 'POC · HubSpot fixture',
    description: 'Que POC pack — HubSpot deals/companies for SaaS pipeline',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/hubspot_demo.json',
    },
  },
} as const

/** India D2C stack — Shopify orders + Razorpay UPI + Stripe subscriptions (fixture POC). */
export const INDIA_COMMERCE_POC_PACK = {
  id: 'india-commerce-fixture',
  title: 'India D2C commerce POC pack',
  body:
    'Shopify + Razorpay + Stripe slots — skip any, add your connections or Use demo; Workspace fills only after sync.',
  shopify: {
    name: 'POC · Shopify fixture',
    description: 'Que POC pack — Shopify orders/customers (India D2C)',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/shopify_demo.json',
    },
  },
  razorpay: {
    name: 'POC · Razorpay fixture',
    description: 'Que POC pack — Razorpay payments/orders (India UPI)',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/razorpay_demo.json',
    },
  },
  stripe: {
    name: 'POC · Stripe fixture',
    description: 'Que POC pack — Stripe charges/subscriptions (global billing)',
    config: {
      mode: 'fixture',
      fixturesPath: 'fixtures/stripe_demo.json',
    },
  },
} as const

export type PocPackConnectorSpec = {
  name: string
  description: string
  config: Record<string, unknown>
}

export type PocPackDefinition = {
  id: string
  title: string
  body: string
  connectors: Array<{
    type: DataSourceType
    key: string
    spec: PocPackConnectorSpec
  }>
}

export const POC_PACKS: PocPackDefinition[] = [
  {
    id: POC_PACK.id,
    title: POC_PACK.title,
    body: POC_PACK.body,
    connectors: [
      { type: 'snowflake', key: 'snowflake', spec: POC_PACK.snowflake },
      { type: 'databricks', key: 'databricks', spec: POC_PACK.databricks },
    ],
  },
  {
    id: INDIA_SMB_POC_PACK.id,
    title: INDIA_SMB_POC_PACK.title,
    body: INDIA_SMB_POC_PACK.body,
    connectors: [
      { type: 'mysql', key: 'mysql', spec: INDIA_SMB_POC_PACK.mysql },
      { type: 'shopify', key: 'shopify', spec: INDIA_SMB_POC_PACK.shopify },
      { type: 'razorpay', key: 'razorpay', spec: INDIA_SMB_POC_PACK.razorpay },
    ],
  },
  {
    id: INDIA_COMMERCE_POC_PACK.id,
    title: INDIA_COMMERCE_POC_PACK.title,
    body: INDIA_COMMERCE_POC_PACK.body,
    connectors: [
      { type: 'shopify', key: 'shopify', spec: INDIA_COMMERCE_POC_PACK.shopify },
      { type: 'razorpay', key: 'razorpay', spec: INDIA_COMMERCE_POC_PACK.razorpay },
      { type: 'stripe', key: 'stripe', spec: INDIA_COMMERCE_POC_PACK.stripe },
    ],
  },
  {
    id: INDIA_SAAS_POC_PACK.id,
    title: INDIA_SAAS_POC_PACK.title,
    body: INDIA_SAAS_POC_PACK.body,
    connectors: [
      { type: 'chargebee', key: 'chargebee', spec: INDIA_SAAS_POC_PACK.chargebee },
      { type: 'stripe', key: 'stripe', spec: INDIA_SAAS_POC_PACK.stripe },
      { type: 'hubspot', key: 'hubspot', spec: INDIA_SAAS_POC_PACK.hubspot },
    ],
  },
  {
    id: MARKETING_ATTRIBUTION_POC_PACK.id,
    title: MARKETING_ATTRIBUTION_POC_PACK.title,
    body: MARKETING_ATTRIBUTION_POC_PACK.body,
    connectors: [
      { type: 'google_ads', key: 'google_ads', spec: MARKETING_ATTRIBUTION_POC_PACK.google_ads },
      { type: 'shopify', key: 'shopify', spec: MARKETING_ATTRIBUTION_POC_PACK.shopify },
    ],
  },
]
