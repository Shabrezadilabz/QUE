# Step 1 — PostgreSQL for SportEdge ecommerce testing

Use this guide to load **PUMA + NIKE** order/finance data into cloud Postgres, then connect it from your **deployed Que app (Vercel UI + Render API)**.

---

## What you get

| Item | Detail |
|------|--------|
| **Database name** | `sportedge_ecommerce` (you choose on Neon) |
| **Schemas** | `public` (orders/ops) + `finance` (payments/refunds) |
| **Tables** | 15 tables — brands, customers, products, variants, orders, items, wishlist, tracking, warehouses, finance tables |
| **Rows** | ~35,000+ after seed (scalable later to 2L/table) |
| **Join keys** | `customer_id`, `email` (`user{N}@example.com`), `sku`, `order_id` — aligned with Excel tester pack |

SQL files:

- `db/sportedge/001_schema.sql` — tables + FKs
- `db/sportedge/002_seed_bulk.sql` — bulk data

Bootstrap script:

```powershell
cd d:\ADC\prosols\adc\schemagraph\api
$env:SPORTEDGE_PG_URL="postgresql://USER:PASS@HOST/DB?sslmode=require"
npm run bootstrap:sportedge-pg
```

---

## Part A — Create Neon Postgres (recommended, free tier)

### A1. Sign up

1. Open [https://neon.tech](https://neon.tech)
2. Sign up with GitHub or email
3. Create a project: **`sportedge-que-test`**
4. Region: pick **AWS ap-south-1 (Mumbai)** if testing from India, or closest to your Render API region

### A2. Create database

1. In Neon dashboard → **Databases**
2. Default database is often `neondb` — you can use that **or** create `sportedge_ecommerce`
3. Note your **connection string** (Connection details → **URI**)

Example shape:

```
postgresql://neondb_owner:XXXXXXXX@ep-cool-name-12345678.ap-south-1.aws.neon.tech/neondb?sslmode=require
```

### A3. Allow external connections

Neon allows public connections by default. No IP whitelist needed (unlike Atlas).

Your **Render API** must reach this host — Neon is public internet, so this works.

### A4. Create a read-only user for Que (recommended)

In Neon **SQL Editor**, run as owner:

```sql
CREATE USER que_reader WITH PASSWORD 'Pick-A-Strong-Password-Here';

GRANT CONNECT ON DATABASE neondb TO que_reader;
GRANT USAGE ON SCHEMA public TO que_reader;
GRANT USAGE ON SCHEMA finance TO que_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO que_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA finance TO que_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO que_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT SELECT ON TABLES TO que_reader;
```

Replace `neondb` with your database name if different.

**Que connection user:** `que_reader` (read-only — safe for testing)

---

## Part B — Load SportEdge data

### B1. From your Windows machine

```powershell
cd d:\ADC\prosols\adc\schemagraph\api

# Use OWNER connection string first (needs CREATE/INSERT rights)
$env:SPORTEDGE_PG_URL="postgresql://neondb_owner:OWNER_PASS@ep-xxxx.ap-south-1.aws.neon.tech/neondb?sslmode=require"

npm run bootstrap:sportedge-pg
```

Expected output:

```
Applying 001_schema.sql…
  ✓ 001_schema.sql
Applying 002_seed_bulk.sql…
  ✓ 002_seed_bulk.sql

Row counts:
  customers: 2500
  products: 500
  orders: 3500
  ...
Done.
```

Takes ~30–90 seconds on Neon free tier.

### B2. Verify in Neon SQL Editor

```sql
SELECT brand_code, COUNT(*) FROM products p JOIN brands b ON b.brand_id = p.brand_id GROUP BY 1;
SELECT COUNT(*) FROM finance.payments;
SELECT email, customer_id FROM customers LIMIT 5;
```

---

## Part C — Connect in Que (Vercel deployment)

### C1. Open your deployed app

1. Go to your Vercel URL → **Login**
2. Open **Sources** → **Add connector** → **PostgreSQL**

### C2. Fill the form

| Field | Example |
|-------|---------|
| **Name** | `pg_sportedge_orders` |
| **Host** | `ep-cool-name-12345678.ap-south-1.aws.neon.tech` |
| **Port** | `5432` |
| **Database** | `neondb` |
| **User** | `que_reader` |
| **Password** | your que_reader password |
| **Schema** | `public` |

> **SSL:** Que auto-enables SSL for non-localhost hosts (Neon/Supabase/RDS). No extra toggle needed.

### C3. Sync

1. Click **Save** → **Sync schema**
2. Wait 30–60 seconds
3. Status should turn **active**
4. Open **Workspace** — you should see tables: `brands`, `customers`, `products`, `orders`, …

### C4. Second connection for finance schema (optional)

If you want `finance.*` tables as a separate source in the canvas:

| Field | Value |
|-------|-------|
| Name | `pg_sportedge_finance` |
| Same host/db/user/password | |
| **Schema** | `finance` |

Sync again → `invoices`, `payments`, `refunds`, `cod_ledger`.

---

## Part D — Test that Postgres works

| # | Action | Pass? |
|---|--------|-------|
| 1 | Sources shows **active** | ☐ |
| 2 | Workspace shows **10+ tables** from `public` | ☐ |
| 3 | Click `customers` → see sample emails `user1@example.com` | ☐ |
| 4 | Go **Joins** → filter **Suggested** → see internal FK joins (orders → customers) | ☐ |
| 5 | **Promote** `orders.customer_id → customers.customer_id` | ☐ |
| 6 | After Excel is connected (Step 2), cross-source join `customers ↔ leads` appears | ☐ |

Golden pairs file for `/eval` (after Excel + Postgres both synced):

`docs/testing/ecommerce/sportedge-golden-pairs.json`

---

## Part E — Connection string cheat sheet

| Use case | Connection string |
|----------|-------------------|
| **Bootstrap (owner)** | Full URI from Neon dashboard |
| **Que app (read-only)** | Same host/db, user `que_reader` |
| **psql CLI** | `psql "postgresql://que_reader:PASS@ep-xxx.neon.tech/neondb?sslmode=require"` |

**Never commit passwords to GitHub.** Store only in Neon + Que connection form.

---

## Part F — Troubleshooting

| Error | Fix |
|-------|-----|
| `connection refused` | Check host spelling; Neon project not suspended |
| `SSL required` | Fixed in latest Que API (auto SSL for cloud hosts). Redeploy API if old build |
| `password authentication failed` | Reset password in Neon → update Que source |
| `permission denied` | Grant SELECT to `que_reader` on both schemas |
| Sync timeout | Neon free tier cold start — retry sync after 10s |
| Only 4 tables visible | You synced `finance` schema only — use `public` for main ops tables |
| Render API can't reach DB | Neon is public; check Render outbound isn't blocked (rare) |

---

## Part G — Scale to 2 lakh rows later

When Phase 1 joins look good, extend `002_seed_bulk.sql`:

```sql
-- Example: 200k customers
FROM generate_series(1, 200000) AS g
```

Re-run bootstrap (or append-only seed script). **Que still only stores schema + 5–10 sample rows per table** — large source volume is fine.

---

## Next step

When Postgres is **active** on Vercel, tell me and we do **Step 2 — Excel/CSV (Marketing team)** with the same join keys.
