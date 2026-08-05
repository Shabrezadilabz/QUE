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
  body: 'Adds Snowflake + Databricks demo fixtures, syncs schema, then open Workspace to Promote your first join.',
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
