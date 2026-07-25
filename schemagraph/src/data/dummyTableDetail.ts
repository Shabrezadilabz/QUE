import type { SampleDataRow, TableDetailStats } from '@/types/tableDetail'
import type { SchemaTable } from '@/types/schema'
import { DUMMY_TABLES } from '@/data/dummySchema'

/**
 * Dummy “API” metadata for RightSidebar demos.
 * Keyed by table id — swap for real fetch later.
 */
export const DUMMY_TABLE_STATS: Record<string, TableDetailStats> = {
  'tbl-users-main': {
    rowCount: 1_248_390,
    storageLabel: '482 MB',
    description:
      'Main application users table on production-master. Handles auth and core profile data.',
  },
  'tbl-user-logs': {
    rowCount: 48_902_112,
    storageLabel: '12.4 GB',
    description: 'Append-only event log collection in Mongo Atlas.',
  },
  'tbl-analytics-cube': {
    rowCount: 902_441,
    storageLabel: '1.1 GB',
    description: 'Aggregated analytics view in Snowflake warehouse.',
  },
  'tbl-orgs': {
    rowCount: 4_812,
    storageLabel: '18 MB',
    description: 'Organization directory — billing and plan metadata.',
  },
}

/** Build a few preview rows from column.sampleValues (columnar → row-wise). */
export function buildSampleRowsFromColumns(
  table: SchemaTable,
  rowCount = 3,
): SampleDataRow[] {
  const rows: SampleDataRow[] = []
  for (let i = 0; i < rowCount; i++) {
    const row: SampleDataRow = {}
    for (const col of table.columns) {
      const samples = col.sampleValues ?? []
      row[col.name] = samples[i % Math.max(samples.length, 1)] ?? null
    }
    rows.push(row)
  }
  return rows
}

/** Explicit mock grid for users_main (richer than sampleValues alone). */
export const DUMMY_SAMPLE_ROWS: Record<string, SampleDataRow[]> = {
  'tbl-users-main': [
    {
      id: 'a1b2c3d4-1111',
      email: 'ada@ex.com',
      created_at: '2024-01-12T08:01:00Z',
      org_id: 'org-1111',
    },
    {
      id: 'e5f6a7b8-2222',
      email: 'linus@ex.com',
      created_at: '2024-03-02T14:22:11Z',
      org_id: 'org-2222',
    },
    {
      id: '9c0d1e2f-3333',
      email: 'grace@ex.com',
      created_at: '2024-06-18T09:44:02Z',
      org_id: 'org-1111',
    },
  ],
}

export function resolveSampleRows(table: SchemaTable): SampleDataRow[] {
  return (
    DUMMY_SAMPLE_ROWS[table.id] ?? buildSampleRowsFromColumns(table)
  )
}

export function resolveTableStats(tableId: string): TableDetailStats | undefined {
  return DUMMY_TABLE_STATS[tableId]
}

/** Lookup table in a list (API or dummy). */
export function findTable(
  tables: SchemaTable[],
  tableId: string | null,
): SchemaTable | null {
  if (!tableId) return null
  return tables.find((t) => t.id === tableId) ?? null
}

/** @deprecated use findTable(tables, id) */
export function findDummyTable(tableId: string | null): SchemaTable | null {
  return findTable(DUMMY_TABLES, tableId)
}
