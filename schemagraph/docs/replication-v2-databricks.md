# Replication v2 — Databricks scope (MVP)

Sprint 8 delivers **scoping and pipeline planning** for Databricks → `que_replica_databricks`.

## Prerequisites

1. Databricks SQL warehouse connection in Que  
2. Unity Catalog or hive_metastore tables synced  
3. Delta tables with `updated_at` or CDF enabled for incremental plans

## Recommended CDC pattern

```
Delta tables (CDF enabled)
  → Que Databricks connector sync
  → Join infer across catalog schemas
  → Monk cert on mart candidates
  → que_replica_databricks staging
```

## API

```
GET /workspaces/:id/replication/v2/scope?warehouse=databricks
```

## S9 E2E

```
POST /workspaces/:id/replication/v2/run  { "warehouse": "databricks" }
```

## Limitations

- Planning only — no Spark job submission  
- Large tables need partition watermark columns  
- Private runner recommended for VPC deployments

## Next (S9)

Full E2E replication run for Databricks + Snowflake parity.
