import type { DataSource } from '@/types/dataSource'

/**
 * Dummy connected sources for UI development.
 * Replace with API / PowerSync / context fetch when backend is ready —
 * keep the DataSource shape stable so the sidebar does not need a rewrite.
 */
export const DUMMY_DATA_SOURCES: DataSource[] = [
  {
    id: 'src-pg-prod',
    name: 'pg_production_v2',
    type: 'postgresql',
    status: 'active',
    description: 'Primary OLTP cluster',
  },
  {
    id: 'src-mongo-atlas',
    name: 'mongo_atlas_main',
    type: 'mongodb',
    status: 'active',
    description: 'Document store — user events',
  },
  {
    id: 'src-snowflake-dw',
    name: 'snowflake_warehouse',
    type: 'snowflake',
    status: 'error',
    description: 'Sync disabled — credentials expired',
  },
  {
    id: 'src-databricks-lake',
    name: 'databricks_lakehouse',
    type: 'databricks',
    status: 'warning',
    description: 'Latency elevated on bronze jobs',
  },
  {
    id: 'src-excel-finance',
    name: 'finance_q3_workbook',
    type: 'excel',
    status: 'active',
    description: 'Uploaded XLSX — finance team',
  },
  {
    id: 'src-sql-legacy',
    name: 'legacy_sql_server',
    type: 'sql',
    status: 'warning',
    description: 'Read replica lag > 30s',
  },
  {
    id: 'src-mysql-billing',
    name: 'mysql_billing',
    type: 'mysql',
    status: 'active',
  },
  {
    id: 'src-csv-imports',
    name: 'csv_daily_imports',
    type: 'csv',
    status: 'error',
    description: 'Last ingest failed schema check',
  },
  {
    id: 'src-kafka-telemetry',
    name: 'kafka_telemetry',
    type: 'kafka',
    status: 'active',
    description: 'Realtime event bus',
  },
]
