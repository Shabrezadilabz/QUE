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
| GET | `/auth/sso` | SSO readiness (`requireInvite`, domains, issuer) |
| GET | `/auth/sso/start` | Begin OIDC authorize (browser redirect) |
| GET | `/auth/sso/callback` | OIDC callback → SPA `#token=` or `#error=` |
| GET | `/workspaces/:id/usage` | Wave 1.5 usage counters + soft plan limits |
| GET | `/workspaces/:id/join-reviews` | Wave 2.1 join inbox (`?status=suggested`) |
| GET | `/workspaces/:id/jobs/:jobId/contract` | Wave 2.2 contract status |
| POST | `/workspaces/:id/jobs/:jobId/contract/freeze` | Freeze / re-freeze accepted joins |
| GET | `/workspaces/:id/export-attestations` | Wave 2.4 list attested exports |
| GET | `/workspaces/:id/export-attestations/:eventId` | Full attestation JSON |
| GET | `/workspaces/:id/export-attestations/:eventId/pack` | Diligence verify pack download |
| POST | `/auth/attestation/verify` | Public HMAC verify (no auth) |
| GET | `/workspaces/:id/sync-schedule` | Wave 2.5 schedule status |
| POST | `/workspaces/:id/sync-schedule/run` | Admin: run due introspects now |
| POST | `/workspaces/:id/jobs/:jobId/materialize` | Wave 3.1 CTAS/VIEW in customer warehouse (`confirm:true`) |
| GET | `/workspaces/:id/materializations` | Materialize audit (metadata only) |
| POST | `/workspaces/:id/jobs/:jobId/artifacts` | Wave 3.3 mint signed download URL |
| GET | `/workspaces/:id/artifacts` | List signed artifacts |
| POST | `/workspaces/:id/artifacts/:id/revoke` | Admin revoke download |
| GET | `/artifacts/download/:token` | Public download (no session) |
| GET | `/workspaces/:id/lineage` | Wave 3.4 lineage lite paths |
| — | BigQuery / Salesforce connectors | Wave 4.1 — fixture or live token introspect |

Env (Wave 4.1 live): `GOOGLE_ACCESS_TOKEN` / config.token (BQ); `SALESFORCE_ACCESS_TOKEN` + `instanceUrl` (SF).

| GET | `/workspaces/:id/jobs/schedule` | Wave 4.2 job schedule overview |
| POST | `/workspaces/:id/jobs/schedule/run` | Admin: run due scheduled jobs |
| GET | `/workspaces/:id/job-runs` | Workspace run history |
| GET/PATCH | `/workspaces/:id/orchestrator` | Wave 4.3 Airflow/Dagster webhook |
| POST | `/workspaces/:id/orchestrator/test` | Test ping |
| POST | `/workspaces/:id/mapping-assist` | Wave 4.4 HITL mapping assist |
| GET/PATCH | `/workspaces/:id/mapping-assist/renames…` | Rename suggestions |
| GET/PATCH | `/workspaces/:id/private-runner` | Wave 4.5 private runner config |
| POST | `/runner/callback` | Private runner result callback |
| GET | `/workspaces/:id/billing` | Wave 4.6 seat billing status |
| POST | `/workspaces/:id/billing/checkout` | Stripe Checkout session |
| POST | `/workspaces/:id/billing/portal` | Stripe Customer Portal |
| POST | `/billing/stripe/webhook` | Stripe webhooks (raw body) |

Env: `QUE_PUBLIC_API_URL` (optional absolute base for download links).

Per-job schedule: `PATCH .../jobs/:id` with `{ runSchedule, runMode, maxRetries, retryDelaySec, executionTarget }`.

Env: `QUE_SCHEDULED_JOBS_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SEAT`, `STRIPE_WEBHOOK_SECRET`, `QUE_PUBLIC_URL`.

Per-connection schedule: `PATCH .../connections/:id` with `{ "syncSchedule": "off"|"hourly"|"daily" }`.

Env: `QUE_SCHEDULED_SYNC_ENABLED` (default true), `QUE_SCHEDULED_SYNC_TICK_MS` (default 60000).

### SSO (OIDC + PKCE)

Env: `QUE_OIDC_ISSUER`, `QUE_OIDC_CLIENT_ID`, optional `QUE_OIDC_CLIENT_SECRET`,
`QUE_OIDC_REDIRECT_URI` (API callback), `QUE_OIDC_POST_LOGIN_REDIRECT` (SPA, default `:5174/auth/callback`).

| Env | Behavior |
|-----|----------|
| `QUE_SSO_REQUIRE_INVITE` | `true`/`false`; **defaults ON in production** |
| `QUE_SSO_ALLOWED_DOMAINS` | Comma list; optional domain allowlist |
| `QUE_SSO_DEFAULT_WORKSPACE_ID` | Auto-join workspace — **ignored when invite-required** |

When invite-required: first SSO login needs a pending `workspace_invites` row for that email; silent default-workspace join is disabled.

Apply `db/005_auth.sql` once. Set `STITCH_AUTH_DISABLED=1` to skip checks locally.

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
