# Que — Production deploy checklist

**Use before every production release** (Render API + Vercel UI).  
Automated gate: `npm run test:deploy-gate` (local, no DB — includes `test:prod-ship` + `test:migrate-check` for 048–053).  
Live smoke: `QUE_API_BASE=https://your-api npm run test:smoke`.

Related: [`DEPLOY-FREE.md`](../DEPLOY-FREE.md) · [`on-call-runbook.md`](./on-call-runbook.md) · [`MANUAL-TESTING-MASTER-2026.md`](../MANUAL-TESTING-MASTER-2026.md)

---

## 1. Pre-deploy (local)

Run from `adc/schemagraph/api`:

```powershell
cd adc/schemagraph/api
npm ci
npm run test:prod-ship
npm run test:deploy-gate
```

Run from `adc/schemagraph` (UI build):

```powershell
cd adc/schemagraph
npm ci
npm run build
```

**Gate must be green** before merging to `main` or tagging a release.

---

## 2. Database migrations

Migrations apply in numeric order via `npm run migrate` (also runs on API boot).

| Migration | Purpose |
|-----------|---------|
| `048_que_warehouse.sql` | Que Warehouse registry + `raw.*` table tracking |
| `049_ssm_workspace_events.sql` | SSM-B workspace event log |
| `050_warehouse_job_queue.sql` | Warehouse worker job queue |
| `051_que_sql_models.sql` | Que Model IDE (`que_sql_models`) |
| `052_bi_access_groups.sql` | BI Studio access groups |
| `053_que_pipes.sql` | Que Pipes proposals |

**Manual migrate (if boot migrate fails):**

```powershell
cd adc/schemagraph/api
$env:DATABASE_URL = "postgresql://..."
npm run migrate
```

Confirm in logs: `[Que] migrations up to date` or `ok` for each new file.

---

## 3. Required environment variables

### API (Render / Docker)

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Neon Postgres + `sslmode=require` |
| `QUE_SECRETS_KEY` | Yes | 32+ chars; **not** the local default |
| `QUE_ATTESTATION_HMAC_SECRET` | Yes | Random secret for export attestation |
| `QUE_CORS_ORIGINS` | Yes | Comma-separated Vercel origin(s), no trailing slash |
| `STITCH_AUTH_DISABLED` | Yes | Must be `false` in production |

### API — recommended

| Variable | Purpose |
|----------|---------|
| `QUE_PUBLIC_URL` / `QUE_PUBLIC_API_URL` | Public API URL for webhooks |
| `QUE_APP_URL` | Vercel UI URL (Slack/Teams approve links) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | LLM features |
| `QUE_SEED_DEMO_USERS` | `true` for pilot/demo only |

Boot validation lives in `api/src/env.js` — missing production secrets **refuse to start**.

### UI (Vercel)

| Variable | Value |
|----------|-------|
| `VITE_STITCH_API_URL` | `https://<your-api-host>` |

---

## 4. Deploy sequence

1. **Merge to `main`** (after local deploy gate passes).
2. **Render** — deploy API Docker service; watch logs for migrate + `Production boot refused` errors.
3. **Vercel** — deploy UI (or auto on push); confirm `VITE_STITCH_API_URL` matches Render URL.
4. **Wake API** — `GET /health` once (free tier cold start ~30–90s).
5. **Post-deploy smoke** — see §5.

---

## 5. Post-deploy verification

### Quick (2 min)

```powershell
$env:QUE_API_BASE = "https://your-api.onrender.com"
cd adc/schemagraph/api
npm run test:smoke
```

Smoke covers: health (incl. worker rollup), auth, settings, schema, jobs, chat **graphContext.ssmRouting**, **que-expr compile**, **warehouse/worker**, platform hub (phase1 + phase5), observe, pack studio, agent runtime, page autofill.

### Full prod path (10–45 min)

```powershell
$env:QUE_API_BASE = "https://your-api.onrender.com"
$env:MONK_E2E_EMAIL = "your-pilot-user@company.com"
$env:MONK_E2E_PASSWORD = "..."
$env:MONK_E2E_WORKSPACE_ID = "..."   # optional
npm run test:monk-prod
```

### Manual UI (5 min)

1. Login → `/hub` — six modules show status dots  
2. `/load` — autofill banner visible  
3. `/chat` — open context sidebar → **SSM runtime** panel loads  
4. `/observe` — incidents table renders  

See [`SMOKE-CEO.md`](../SMOKE-CEO.md) for CEO demo path.

---

## 6. GitHub Actions (weekly prod smoke)

Workflow: `.github/workflows/que-prod-smoke.yml`

| Job | When | Needs secrets |
|-----|------|---------------|
| `deploy-gate` | Every push + weekly | None |
| `unit-gate` | Every push + weekly | None |
| `smoke` | Weekly + manual | `QUE_API_BASE` |
| `monk-prod` | Weekly + manual | `QUE_API_BASE`, `MONK_E2E_EMAIL`, `MONK_E2E_PASSWORD` |

**Repository secrets to set:**

- `QUE_API_BASE` — production API URL  
- `MONK_E2E_EMAIL` / `MONK_E2E_PASSWORD` — pilot workspace login  
- `MONK_E2E_WORKSPACE_ID` — optional fixed workspace UUID  

---

## 7. Warehouse worker pool (Phase 5.3)

Scheduled warehouse jobs (`warehouse_job_queue`) run via an in-process ticker on the **API** by default, or a dedicated worker process in production.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `QUE_WAREHOUSE_WORKER_ENABLED` | `true` | Set `false` to disable worker ticks |
| `QUE_WAREHOUSE_WORKER_TICK_MS` | `5000` | Poll interval (2s–60s) |
| `QUE_WORKER_ID` | auto | Stable worker id in multi-instance deploys |

### Local worker process

```powershell
cd adc/schemagraph/api
$env:DATABASE_URL = "postgresql://..."
$env:QUE_WAREHOUSE_WORKER_ENABLED = "true"
$env:QUE_WORKER_ID = "worker-local-1"
npm run worker
```

### Render — Background Worker (recommended for prod)

1. Create a **Background Worker** service from the same repo.
2. **Dockerfile:** `adc/schemagraph/api/docker/que-worker/Dockerfile`
3. **Start command:** `node scripts/runWarehouseWorker.js`
4. Use the **same** `DATABASE_URL`, `QUE_SECRETS_KEY`, and production secrets as the API.
5. Set `QUE_WORKER_ID=worker-render-1` (unique per worker instance).

The API service also runs `startWarehouseWorkerLoop()` on boot — fine for single-instance pilots; use a dedicated worker when scaling scheduled ETL.

Verify after deploy: `GET /workspaces/{id}/load/summary` → `worker.enabled` and `recentRuns` include queue items.

---

## 8. Rollback

1. **Render** — redeploy previous successful image from dashboard.  
2. **Vercel** — promote previous deployment.  
3. **Migrations** — forward-only; rollback = restore DB snapshot (Neon branch/point-in-time).  
4. Post rollback: run `npm run test:smoke` against rolled-back API.

---

## 9. Sign-off

| Check | Owner | Date |
|-------|-------|------|
| `test:deploy-gate` green locally | Eng | |
| Migrations applied (048–053) | Eng | |
| Production env vars verified | Eng | |
| `test:smoke` green on prod URL | Eng | |
| Manual `/hub` + `/chat` SSM panel | PM/QA | |
| On-call notified (if breaking) | Eng | |
