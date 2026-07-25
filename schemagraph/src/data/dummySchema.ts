import type { SchemaColumn, SchemaRelationship, SchemaTable } from '@/types/schema'

/**
 * Dummy schema graph for MainCanvas / TableNode development.
 * Replace with API payload; keep SchemaTable / SchemaColumn shapes.
 */
export const DUMMY_TABLES: SchemaTable[] = [
  {
    id: 'tbl-users-main',
    name: 'users_main',
    sourceId: 'src-pg-prod',
    sourceType: 'postgresql',
    sourceLabel: 'POSTGRESQL',
    entityKind: 'TABLE',
    position: { x: 80, y: 100 },
    defaultExpanded: true,
    columns: [
      {
        id: 'col-users-id',
        name: 'id',
        dataType: 'UUID',
        keyKind: 'pk',
        nullable: false,
        description: 'Primary user identifier',
        sampleValues: [
          'a1b2c3d4-…',
          'e5f6a7b8-…',
          '9c0d1e2f-…',
        ],
      },
      {
        id: 'col-users-email',
        name: 'email',
        dataType: 'VARCHAR',
        keyKind: 'unique',
        nullable: false,
        description: 'Login email — unique index',
        sampleValues: ['ada@ex.com', 'linus@ex.com', 'grace@ex.com'],
      },
      {
        id: 'col-users-created',
        name: 'created_at',
        dataType: 'TIMESTAMP',
        nullable: false,
        description: 'Row creation time (UTC)',
        sampleValues: ['2024-01-12T08:01:00Z', '2024-03-02T14:22:11Z'],
      },
      {
        id: 'col-users-org',
        name: 'org_id',
        dataType: 'UUID',
        keyKind: 'fk',
        nullable: false,
        description: 'Owning organization',
        references: 'organizations.id',
        sampleValues: ['org-1111-…', 'org-2222-…'],
      },
    ],
  },
  {
    id: 'tbl-user-logs',
    name: 'user_logs',
    sourceId: 'src-mongo-atlas',
    sourceType: 'mongodb',
    sourceLabel: 'MONGODB',
    entityKind: 'COLLECTION',
    position: { x: 480, y: 220 },
    defaultExpanded: true,
    columns: [
      {
        id: 'col-logs-id',
        name: '_id',
        dataType: 'OBJECTID',
        keyKind: 'pk',
        sampleValues: ['65f0a1…', '65f0b2…'],
      },
      {
        id: 'col-logs-user',
        name: 'user_id',
        dataType: 'UUID',
        keyKind: 'fk',
        references: 'users_main.id',
        sampleValues: ['a1b2c3d4-…', 'e5f6a7b8-…'],
      },
      {
        id: 'col-logs-payload',
        name: 'payload',
        dataType: 'JSONB',
        sampleValues: ['{"evt":"login"}', '{"evt":"purchase"}'],
      },
      {
        id: 'col-logs-severity',
        name: 'severity',
        dataType: 'INT',
        sampleValues: ['1', '2', '4'],
      },
    ],
  },
  {
    id: 'tbl-analytics-cube',
    name: 'analytics_cube',
    sourceId: 'src-snowflake-dw',
    sourceType: 'snowflake',
    sourceLabel: 'SNOWFLAKE',
    entityKind: 'VIEW',
    position: { x: 120, y: 420 },
    defaultExpanded: false,
    columns: [
      {
        id: 'col-cube-event',
        name: 'event_type',
        dataType: 'STR',
        sampleValues: ['signup', 'churn', 'upgrade'],
      },
      {
        id: 'col-cube-user',
        name: 'user_id',
        dataType: 'UUID',
        keyKind: 'fk',
        references: 'users_main.id',
        sampleValues: ['a1b2c3d4-…'],
      },
      {
        id: 'col-cube-count',
        name: 'total_count',
        dataType: 'INT',
        sampleValues: ['12840', '902'],
      },
    ],
  },
  {
    id: 'tbl-orgs',
    name: 'organizations',
    sourceId: 'src-pg-prod',
    sourceType: 'postgresql',
    sourceLabel: 'POSTGRESQL',
    entityKind: 'TABLE',
    position: { x: 480, y: 40 },
    defaultExpanded: true,
    columns: [
      {
        id: 'col-orgs-id',
        name: 'id',
        dataType: 'UUID',
        keyKind: 'pk',
        sampleValues: ['org-1111-…', 'org-2222-…'],
      },
      {
        id: 'col-orgs-name',
        name: 'name',
        dataType: 'VARCHAR',
        sampleValues: ['Acme Corp', 'Globex'],
      },
      {
        id: 'col-orgs-plan',
        name: 'plan_tier',
        dataType: 'VARCHAR',
        sampleValues: ['enterprise', 'pro'],
      },
    ],
  },
]

export const DUMMY_RELATIONSHIPS: SchemaRelationship[] = [
  {
    id: 'rel-users-org',
    fromTableId: 'tbl-users-main',
    fromColumnId: 'col-users-org',
    toTableId: 'tbl-orgs',
    toColumnId: 'col-orgs-id',
    kind: 'fk',
    type: 'explicit',
    confidence: 1,
    fromId: 'col-users-org',
    toId: 'col-orgs-id',
    joinCriteria: 'users_main.org_id = organizations.id',
    label: 'org_id → organizations.id',
  },
  {
    id: 'rel-logs-users',
    fromTableId: 'tbl-user-logs',
    fromColumnId: 'col-logs-user',
    toTableId: 'tbl-users-main',
    toColumnId: 'col-users-id',
    kind: 'fk',
    type: 'explicit',
    confidence: 0.98,
    fromId: 'col-logs-user',
    toId: 'col-users-id',
    joinCriteria: 'user_logs.user_id = users_main.id',
    label: 'user_logs.user_id → users_main.id',
  },
  {
    id: 'rel-cube-users',
    fromTableId: 'tbl-analytics-cube',
    fromColumnId: 'col-cube-user',
    toTableId: 'tbl-users-main',
    toColumnId: 'col-users-id',
    kind: 'inferred',
    type: 'ai-inferred',
    confidence: 0.74,
    fromId: 'col-cube-user',
    toId: 'col-users-id',
    joinCriteria: 'analytics_cube.user_id ≈ users_main.id (name + type match)',
    label: 'analytics_cube.user_id → users_main.id',
  },
]

/**
 * Standalone sample for Storybook / isolated TableNode demos.
 * Same shape as production table payloads.
 */
export const SAMPLE_TABLE_NODE: SchemaTable = DUMMY_TABLES[0]

/** Convenience: first column of the sample table (tooltip demos). */
export const SAMPLE_COLUMN: SchemaColumn = SAMPLE_TABLE_NODE.columns[0]
