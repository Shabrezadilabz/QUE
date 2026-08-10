# Que — free pilot deploy

**Stack:** Vercel Hobby (UI) + Neon free (Postgres + pgvector) + Render free (API)

Use this for demos and try-outs. **Do not** use the sleeping free API as a regression gate — run `api` diligence + Playwright locally or in CI against Docker.

Estimated cost: **$0**. Expect cold starts (Render ~30–90s after idle; Neon may pause).

---

## 1. Neon (database)

1. Create a free project at [neon.tech](https://neon.tech).
2. Enable the **pgvector** extension (`CREATE EXTENSION IF NOT EXISTS vector;` in the SQL editor, or via Neon UI).
3. Copy the connection string (include `sslmode=require`).
4. You will set this as `DATABASE_URL` on Render.

Migrations run automatically on API boot (`scripts/migrate.js`).

---

## 2. Render (API)

1. New **Web Service** from GitHub repo `Shabrezadilabz/QUE`.
2. **Root Directory:** `schemagraph` (or connect via Blueprint `schemagraph/render.yaml`).
3. **Runtime:** Docker — Dockerfile `api/Dockerfile`, context = `schemagraph`.
4. Plan: **Free**.
5. Health check path: `/health`.

### Required env vars

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon connection string |
| `QUE_SECRETS_KEY` | 32+ random chars (not the local default) |
| `QUE_ATTESTATION_HMAC_SECRET` | random secret |
| `QUE_CORS_ORIGINS` | `https://<your-app>.vercel.app` (no trailing slash) |
| `STITCH_AUTH_DISABLED` | `false` |
| `QUE_SEED_DEMO_USERS` | `true` (demo logins for pilot) |

Optional: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QUE_PUBLIC_URL` / `QUE_PUBLIC_API_URL` = your Render URL.

Generate secrets (PowerShell):

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

### After deploy

- Note the service URL, e.g. `https://que-api.onrender.com`.
- Hit `GET /` or `/health` once to wake the service and confirm migrate succeeded (check logs).

**Gotchas:** disk uploads under `api/uploads` are ephemeral on free Render; first request after idle may time out — retry once.

---

## 3. Vercel (UI)

1. Import the same QUE repo.
2. **Root Directory:** `schemagraph`.
3. Framework: Vite. Build: `npm run build`. Output: `dist`.
4. Env (Production):

| Key | Value |
|-----|--------|
| `VITE_STITCH_API_URL` | `https://<your-api>.onrender.com` |

5. Deploy. SPA rewrites are in `vercel.json`.

If you created Vercel before knowing the Render URL, set the env and **redeploy**.

---

## 4. Wire CORS

1. Set Render `QUE_CORS_ORIGINS` to the exact Vercel origin.
2. Redeploy the API.
3. Open the Vercel URL → login (demo users if seeded) → confirm Network calls go to Render, not `localhost`.

---

## 5. Smoke checklist

- [ ] `GET https://<api>/health` returns OK (wake if slept)
- [ ] Vercel UI loads; login works
- [ ] Browser Network: API base = Render URL
- [ ] No CORS errors in console
- [ ] One workspace/source flow works after cold start

---

## Regression (keep local / CI)

```bash
# From schemagraph/
docker compose up --build -d
cd api && npm run test:diligence
cd .. && npm run test:e2e
```

Playwright env: `QUE_UI_BASE`, `QUE_API_BASE` (defaults `http://localhost:5174` / `http://localhost:8787`).

---

## Templates

- API prod env: [`../api/.env.production.example`](../api/.env.production.example)
- UI prod env: [`../.env.production.example`](../.env.production.example)
- Render Blueprint: [`../render.yaml`](../render.yaml)
- Vercel SPA: [`../vercel.json`](../vercel.json)

When you outgrow free (flaky e2e, sleep, ephemeral uploads), bump Render to **Starter** (~$7) and keep Neon free until you need more storage.
