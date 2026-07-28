# Que database (Step 1)

Local **PostgreSQL** metadata store for Que.  
This does **not** change the React UI yet — schema only.

## Status (automated)

Postgres runs in Docker container **`stitch-pg`** with schema applied.

**AI / RAG requires pgvector.** Use image `pgvector/pgvector:pg16` (not stock `postgres:16`).

| Setting | Value |
|---------|--------|
| Host | `localhost` |
| Port | `5432` |
| Database | `stitch` |
| User | `stitch` |
| Password | `stitch` |
| Seed workspace | slug `demo` |
| Image | `pgvector/pgvector:pg16` |

### Useful commands

```bash
docker start stitch-pg
docker stop stitch-pg
docker exec -it stitch-pg psql -U stitch -d stitch
```

### First-time / migrate to pgvector

If `stitch-pg` was created with stock Postgres (no `vector` extension):

```bash
docker stop stitch-pg
docker rm stitch-pg
docker run -d --name stitch-pg \
  -e POSTGRES_USER=stitch -e POSTGRES_PASSWORD=stitch \
  -e POSTGRES_DB=stitch -p 5432:5432 \
  pgvector/pgvector:pg16
# then apply 001 → 007 (see Migrations below) and re-seed
```

## Optional: DBeaver GUI

Not required (CLI/Docker is enough). To browse tables:

1. New connection → PostgreSQL  
2. Use the credentials above  
3. Test connection → Finish  

## Manual create (if not using Docker)

1. Install PostgreSQL (or run Docker as above).
2. Create database `stitch`.
3. Run [`001_init.sql`](./001_init.sql).

## What you get

| Table | Purpose |
|-------|---------|
| `users` / `workspaces` / `workspace_members` | Tenancy silo |
| `connections` | Data sources (sidebar) |
| `schema_objects` / `schema_columns` | Schema truth |
| `relationships` | Que Relations (explicit / inferred + promote status) |
| `diagram_layouts` | Node positions (UX only) |
| `schema_snapshots` | Future AI context packs |

## Migrations

```bash
# Jobs table (draft → ready → export)
Get-Content db/003_jobs.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Workspace settings_json
Get-Content db/004_workspace_settings.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Auth (password_hash + sessions)
Get-Content db/005_auth.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Quality layer
Get-Content db/006_quality_layer.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# AI RAG (pgvector chunks + feedback + turns)
Get-Content db/007_ai_rag.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Production spine (contract freeze + drift events + event outbox)
Get-Content db/008_production_spine.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Workspace BYOK LLM keys (encrypted)
Get-Content db/009_workspace_secrets.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Job notebooks (cells JSON)
Get-Content db/010_job_notebook.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Job runs (dry-run process history)
Get-Content db/011_job_runs.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Join inference HITL audit (promote/reject events)
Get-Content db/012_join_inference.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Export attestation audit trail
Get-Content db/013_export_attestation.sql | docker exec -i stitch-pg psql -U stitch -d stitch

# Preferred: ordered migrator (tracks schema_migrations)
cd api; npm run migrate
```

### Docker Compose (API + Postgres)

```bash
cd schemagraph
docker compose up --build
# applies migrations then starts que-api on :8787
```

### Diligence tests

```bash
cd api
npm run test:diligence   # join golden-set + privacy red-team
```

| Table | Purpose |
|-------|---------|
| `ai_chunks` | Schema + doc embeddings for RAG |
| `ai_chat_feedback` | Thumbs / RLHF-lite ratings |
| `ai_chat_turns` | Durable limited-memory chat turns |
| `jobs.schema_snapshot_id` / `contract_json` | Frozen stitch contract |
| `workspace_drift_events` | Sync drift alarms (gate exports) |
| `contract_event_outbox` | Streaming-later contract/drift events |
| `relationship_review_events` | HITL promote/reject audit for join memory |
| `export_audit_events` | Schema-only attestation on every job export |

