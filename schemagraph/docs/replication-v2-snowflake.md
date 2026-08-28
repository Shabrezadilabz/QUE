# Replication v2 — Snowflake scope (MVP)

Sprint 8 delivers **scoping and pipeline planning** for Snowflake → `que_replica_snowflake`. Execution uses connector sync + v1 Postgres replication until S9 adds JDBC pull.

## Prerequisites

1. Snowflake connection configured in Que  
2. Schema sync completed (`schema_objects` populated)  
3. Steward promoted cross-database joins if using multiple schemas

## Recommended CDC pattern

```
Snowflake source tables
  → Fivetran/Hevo landing (or Streams + Tasks)
  → Que schema sync
  → Monk multi-source cert (optional SF join)
  → que_replica_snowflake marts
```

## API

```
GET /workspaces/:id/replication/v2/scope?warehouse=snowflake
POST /workspaces/:id/replication/v2/run  { "warehouse": "snowflake" }
```

Returns `recommendedTables`, `plan.steps`, and limitations.

## S9 E2E run

Simulated replication run creates/updates a pipeline and records row counts from schema metadata (no JDBC in S9).

## Limitations

- No Snowflake JDBC replication runner in this sprint  
- Watermark column must exist for incremental mode  
- Max 50 tables per scope plan

## Next (S9)

Second warehouse path (Databricks) E2E + replication run hook.
