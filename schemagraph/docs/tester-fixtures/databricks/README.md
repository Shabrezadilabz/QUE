# Que tester fixtures — Databricks (Unity Catalog fixture + optional live)

Shareable pack for **Step 4** in `Que-Manual-Tester-Guide.pdf`.

## Two modes

| Mode | Need cloud account? | What Que uses |
|------|---------------------|---------------|
| **Fixture** (recommended for POC) | **No** | JSON schema pack under `api/fixtures/` |
| **Live** | Yes — workspace + SQL warehouse + PAT | Databricks Statement Execution API |

This pack focuses on **fixture** (same as Postgres/Mongo local path). Live fields are documented so you can switch later.

## “Account” for fixture mode

There is **no** Databricks login for fixture mode. Que loads:

```text
api/fixtures/databricks_unity_demo.json
```

Relative path from the API process (also copied here for sharing).

## Fixture contents (catalog `main` · schema `analytics`)

| Object | Kind | Join keys vs PG / Mongo |
|--------|------|-------------------------|
| `dim_customer` | TABLE | `email`, `pg_customer_id` |
| `fact_orders` | TABLE | FK `customer_sk` → `dim_customer` |
| `gold_campaign_attribution` | VIEW | `email` |

## Files in this folder

| File | Role |
|------|------|
| `README.md` | This guide |
| `databricks_unity_demo.json` | Shareable copy of the fixture (authoritative runtime copy is `api/fixtures/…`) |
| `sample_rows_dim_customer.csv` | Illustrative row dump (not loaded by Que — for human review) |
| `sample_rows_fact_orders.csv` | Same |
| `WHERE_TO_GET_LIVE_CREDS.md` | Host / warehouse / token from Databricks UI |

## Commands — verify fixture locally

```powershell
# Confirm fixture parses
cd D:\ADC\prosols\adc\schemagraph\api
node --input-type=module -e "import { readFileSync } from 'fs'; const j=JSON.parse(readFileSync('fixtures/databricks_unity_demo.json','utf8')); console.log(j.catalog+'.'+j.schema, j.tables.map(t=>t.name).join(', '))"

# Optional: API health
Invoke-RestMethod http://localhost:8787/health
```

No Docker container is required for fixture mode.

## Que UI — fixture connector

Sources → Databricks → **One-click fixture**

| Field | Value | Where from |
|-------|--------|------------|
| Mode | Fixture | Toggle in form |
| Fixtures path | `fixtures/databricks_unity_demo.json` | Relative to `api/` (default) |
| Catalog / schema | From JSON (`main` / `analytics`) | Inside fixture; optional overrides if UI exposes them |

Then **Sync** → Workspace shows `dim_customer`, `fact_orders`, `gold_campaign_attribution`.

## Que UI — live connector (optional)

| Field | Example | Where from |
|-------|---------|------------|
| Host | `adb-xxxx.azuredatabricks.net` | Workspace URL (no `https://`) |
| Warehouse ID | `abc123…` | SQL Warehouses → warehouse → ID |
| Token | `dapi…` | User Settings → Developer → Access tokens |
| Catalog | `main` | Unity Catalog |
| Schema | `analytics` or `default` | Your schema |

See `WHERE_TO_GET_LIVE_CREDS.md`.

## Re-copy fixture into this share folder

```powershell
Copy-Item D:\ADC\prosols\adc\schemagraph\api\fixtures\databricks_unity_demo.json `
  D:\ADC\prosols\adc\schemagraph\docs\tester-fixtures\databricks\ -Force
```
