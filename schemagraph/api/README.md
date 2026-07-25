# Que API (Step 2)

Minimal read API over the Postgres metadata DB.

## Run

```bash
# Postgres container must be up
docker start stitch-pg

cd adc/Que/api
npm install
npm run seed
npm run dev
```

API: `http://localhost:8787`

## Auth

Bearer sessions on all `/workspaces/:workspaceId/*` routes (and `GET /workspaces`).

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | `{ email, password }` → `{ token, user, workspaces }` |
| POST | `/auth/logout` | Invalidates session |
| GET | `/auth/me` | Current user + memberships |

### Roles

| Capability | viewer | member | admin | owner |
|------------|--------|--------|-------|-------|
| Read (schema, sources, jobs, settings GET, context) | yes | yes | yes | yes |
| Layout, promote/reject, sync, chat, jobs write/export | no | yes | yes | yes |
| Connection CRUD, settings PATCH, BYOK secrets | no | no | yes | yes |

Demo accounts (seeded at API boot):

- **Owner:** `dev@stitch.local` / `stitch-dev`
- **Member:** `member@stitch.local` / `stitch-member`
- **Viewer:** `viewer@stitch.local` / `stitch-viewer`

Apply `db/005_auth.sql` once. Set `STITCH_AUTH_DISABLED=1` to skip checks locally.

## Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | `{ ok: true }` |
| GET | `/workspaces/:id/sources` | Connections (+ redacted config) |
| POST | `/workspaces/:id/connections` | Create connection |
| PATCH | `/workspaces/:id/connections/:id` | Update name/config |
| DELETE | `/workspaces/:id/connections/:id` | Delete connection (cascades schema) |
| GET | `/workspaces/:id/schema` | `{ tables, relationships }` |
| PUT | `/workspaces/:id/layout` | `{ positions }` — save canvas node x/y |
| PATCH | `/workspaces/:id/relationships/:relationshipId` | `{ action: 'promote' \| 'reject' }` — review inferred edge |
| POST | `/workspaces/:id/connections/:connectionId/sync` | Introspect Postgres / Excel / CSV / Mongo → upsert schema |
| GET | `/workspaces/:id/settings` | Workspace stats + policy flags + capabilities |
| PATCH | `/workspaces/:id/settings` | Update policy flags (admin+) |
| PUT | `/workspaces/:id/secrets/llm` | BYOK — set/clear OpenAI/Anthropic keys (admin+; never echoes plaintext) |
| GET | `/workspaces/:id/secrets/status` | Masked key status + source (`workspace` \| `env` \| `none`) |
| POST | `/workspaces/:id/chat` | `{ message, history? }` — schema-only AI answer |
| GET | `/workspaces/:id/jobs` | List stitch job drafts |
| POST | `/workspaces/:id/jobs` | Create job from chat draft |
| PATCH | `/workspaces/:id/jobs/:jobId` | Update title / status / steps |
| POST | `/workspaces/:id/jobs/:jobId/export` | `{ format: 'json' \| 'sql' }` — minimal runner export |

Chat uses metadata + RAG vector chunks only. Workspace **BYOK** keys (Settings → BYOK) win over env; otherwise set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for LLM mode. Set `QUE_SECRETS_KEY` (32+ chars) so workspace keys encrypt with a stable master key (local demo falls back if unset). Without any key, local embeddings + heuristic skills still answer.

Apply `db/009_workspace_secrets.sql` once for BYOK storage.

Vector DB: Postgres **pgvector** (`pgvector/pgvector:pg16`). Apply `db/007_ai_rag.sql`. Reindex via `POST /workspaces/:id/ai/reindex` or Chat/Settings **REINDEX**.

- **promote** → `status=accepted`, `relation_type=explicit`
- **reject** → `status=rejected` (hidden from schema GET)
- **sync** → Postgres, spreadsheet, or Mongo connectors; capped samples; writes `schema_snapshots`; suggests cross-source joins

Demo workspace id: `22222222-2222-2222-2222-222222222222`

| Seed connection | Id | Notes |
|-----------------|----|-------|
| `pg_customer_demo` | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4` | Live DB `customer_demo` |
| `excel_marketing_pack` | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5` | `api/fixtures/*.csv` + `regions.xlsx` |
| `databricks_lakehouse_demo` | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7` | Fixture Unity Catalog demo (or live token) |

Databricks sync: `mode: fixture` (default demo) or `mode: live` with `host`, `warehouseId`, `token`.

### First-time demo sources

```bash
npm run bootstrap:demo-source   # Postgres customer_demo
docker start stitch-mongo       # or first-time: docker run -d --name stitch-mongo -p 27017:27017 mongo:7
npm run bootstrap:demo-mongo    # Mongo customer_demo collections
npm run seed
```

Seeded AI edge for smoke tests: `dddddddd-dddd-dddd-dddd-ddddddddddd3`
