/**
 * Data-source domain types for the left sidebar and future API wiring.
 */

/** Connection health shown as a status LED on each source row. */
export type DataSourceStatus = 'active' | 'warning' | 'error'

/**
 * Supported connector kinds.
 * Extend this union when new adapters are added on the backend.
 */
export type DataSourceType =
  | 'excel'
  | 'sql'
  | 'postgresql'
  | 'mongodb'
  | 'databricks'
  | 'snowflake'
  | 'bigquery'
  | 'salesforce'
  | 'shopify'
  | 'razorpay'
  | 'zoho'
  | 'stripe'
  | 'hubspot'
  | 'mysql'
  | 'chargebee'
  | 'google_ads'
  | 'csv'
  | 'kafka'

/** Per-source data landing preference (stored in connection config). */
export type DataLandingMode =
  | 'schema_only'
  | 'managed_plane'
  | 'customer_warehouse'

export interface DataSource {
  /** Stable id — use for selection + API keys later */
  id: string
  /** Display name (e.g. pg_production_v2) */
  name: string
  /** Connector / dialect type */
  type: DataSourceType
  /** Health: active (green), warning (amber), error (rose) */
  status: DataSourceStatus
  /** Optional human-readable subtitle */
  description?: string
  /** Connector config (passwords redacted from API) */
  config?: Record<string, unknown>
  syncable?: boolean
  hasSecrets?: boolean
  updatedAt?: string
  createdAt?: string
  /** Wave 1.3 — last successful schema sync */
  lastSyncAt?: string | null
  /** Wave 1.3 — last failed sync message */
  lastSyncError?: string | null
  /** Wave 1.3 — auth | network | config | unknown */
  lastSyncErrorKind?: 'auth' | 'network' | 'config' | 'unknown' | null
  /** Wave 1.3 — show re-auth CTA when credentials look stale */
  needsReauth?: boolean
  /** Wave 2.5 — off | hourly | daily schema introspect */
  syncSchedule?: 'off' | 'hourly' | 'daily'
  /** Next scheduled introspect (ISO) */
  syncNextAt?: string | null
  /** Last scheduler-driven sync (ISO) */
  lastScheduledSyncAt?: string | null
  /** Sprint 4 — where row data should land when sync/materialize is enabled */
  dataLandingMode?: DataLandingMode
  /** Phase 1 — replicate raw rows into Que Warehouse on sync */
  replicateToWarehouse?: boolean
  monkPromptDismissed?: boolean
  monkPromptLastSyncAt?: string | null
}

