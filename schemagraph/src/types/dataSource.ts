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
  | 'mysql'
  | 'csv'
  | 'kafka'

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
}
