/**
 * Sprint 12 — Connector long-tail (honest matrix: 25+ types).
 * Top 10 from design-partner requests; live vs roadmap clearly labeled.
 */
import { CONNECTOR_MATRIX, getConnectorMatrix } from './connectorMatrix.js'

/** Design-partner request priority (S12.1) */
export const DESIGN_PARTNER_CONNECTOR_PRIORITY = [
  { id: 'hubspot', rank: 1, region: 'US/EU SaaS', status: 'live_fixture' },
  { id: 'stripe', rank: 2, region: 'Global payments', status: 'live_fixture' },
  { id: 'google_ads', rank: 3, region: 'Marketing attribution', status: 'live_fixture' },
  { id: 'netsuite', rank: 4, region: 'Enterprise ERP', status: 'roadmap_q2' },
  { id: 'mysql', rank: 5, region: 'India SMB', status: 'live_fixture' },
  { id: 'redshift', rank: 6, region: 'AWS warehouse', status: 'join_path' },
  { id: 'mysql_rds', rank: 7, region: 'India cloud DB', status: 'beta_doc' },
  { id: 'google_sheets', rank: 8, region: 'Spreadsheet teams', status: 'via_spreadsheet' },
  { id: 'intercom', rank: 9, region: 'SaaS support', status: 'roadmap_q2' },
  { id: 'chargebee', rank: 10, region: 'India SaaS billing', status: 'live_fixture' },
]

export const LONG_TAIL_CONNECTORS = [
  { id: 'mysql', name: 'MySQL', depth: 'S12', live: true, status: 'live_fixture', incremental: 'Binlog doc' },
  { id: 'mysql_rds', name: 'Amazon RDS (MySQL)', depth: 'S12', live: true, status: 'via_mysql', incremental: 'RDS TLS introspect' },
  { id: 'redshift', name: 'Amazon Redshift', depth: 'S12', live: false, status: 'join_path', incremental: 'Query history' },
  { id: 'hubspot', name: 'HubSpot', depth: 'S12', live: true, status: 'live_fixture', incremental: 'CRM objects' },
  { id: 'stripe', name: 'Stripe', depth: 'S12', live: true, status: 'live_fixture', incremental: 'Balance transactions' },
  { id: 'google_ads', name: 'Google Ads', depth: 'S12', live: true, status: 'live_fixture', incremental: 'Campaign stats' },
  { id: 'facebook_ads', name: 'Meta Ads', depth: 'S12', live: false, status: 'roadmap_q2', incremental: 'Insights API' },
  { id: 'netsuite', name: 'NetSuite', depth: 'S12', live: false, status: 'roadmap_q2', incremental: 'SuiteQL' },
  { id: 'quickbooks', name: 'QuickBooks', depth: 'S12', live: false, status: 'roadmap_q2', incremental: 'Invoices' },
  { id: 'intercom', name: 'Intercom', depth: 'S12', live: false, status: 'roadmap_q2', incremental: 'Conversations' },
  { id: 'chargebee', name: 'Chargebee', depth: 'S12', live: true, status: 'live_fixture', incremental: 'Subscriptions' },
  { id: 'google_sheets', name: 'Google Sheets', depth: 'S12', live: false, status: 'via_spreadsheet', incremental: 'Re-sync' },
  { id: 'kafka', name: 'Kafka', depth: 'S12', live: false, status: 'partner_only', incremental: 'Topic schema' },
  { id: 's3', name: 'Amazon S3', depth: 'S12', live: false, status: 'partner_only', incremental: 'File landing' },
  { id: 'gcs', name: 'Google Cloud Storage', depth: 'S12', live: false, status: 'partner_only', incremental: 'File landing' },
  { id: 'azure_sql', name: 'Azure SQL', depth: 'S12', live: false, status: 'roadmap_q3', incremental: 'CDC doc' },
  { id: 'oracle', name: 'Oracle', depth: 'S12', live: false, status: 'roadmap_q3', incremental: 'LogMiner doc' },
  { id: 'sqlserver', name: 'SQL Server', depth: 'S12', live: false, status: 'roadmap_q3', incremental: 'CDC doc' },
  { id: 'freshdesk', name: 'Freshdesk', depth: 'S12', live: false, status: 'india_roadmap', incremental: 'Tickets' },
  { id: 'tally', name: 'Tally ERP', depth: 'S12', live: false, status: 'india_roadmap', incremental: 'Export bridge' },
  { id: 'clevertap', name: 'CleverTap', depth: 'S12', live: false, status: 'india_roadmap', incremental: 'Events' },
  { id: 'mixpanel', name: 'Mixpanel', depth: 'S12', live: false, status: 'roadmap_q2', incremental: 'Export API' },
  { id: 'segment', name: 'Segment', depth: 'S12', live: false, status: 'reverse_etl', incremental: 'Destinations' },
  { id: 'looker', name: 'Looker (import)', depth: 'S12', live: true, status: 'export_merge', incremental: 'LookML merge kit' },
  { id: 'airbyte', name: 'Airbyte (partner)', depth: 'S12', live: true, status: 'ingest_hook', incremental: 'Post-sync webhook' },
]

export function getExtendedConnectorMatrix() {
  const base = getConnectorMatrix()
  const liveIds = new Set(base.queConnectors.map((c) => c.id))
  const merged = [
    ...base.queConnectors,
    ...LONG_TAIL_CONNECTORS.filter((c) => !liveIds.has(c.id)),
  ]
  const liveCount = merged.filter((c) => c.live).length
  return {
    ...base,
    updatedAt: '2026-08-28',
    sprint: 12,
    connectorCount: merged.length,
    liveConnectorCount: liveCount,
    designPartnerPriority: DESIGN_PARTNER_CONNECTOR_PRIORITY,
    queConnectors: merged,
    honestyNote:
      'Que lists 25+ connector types — 16+ live today. Long-tail ingest remains partner/stack motion; Que wins post-sync cert loop.',
  }
}

export { CONNECTOR_MATRIX }
