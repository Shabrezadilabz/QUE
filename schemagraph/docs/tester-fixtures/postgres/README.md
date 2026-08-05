# Que tester fixtures — PostgreSQL `customer_demo`

Shareable pack for manual testers. Used by **Step 2** in `Que-Manual-Tester-Guide.pdf`.

## What this is

| Item | Detail |
|------|--------|
| Purpose | **Customer source** DB that Que syncs (schema / joins) — **not** Que metadata |
| Metadata DB | `stitch` (do not connect Que Sources here) |
| Source DB | `customer_demo` |
| Engine | Same Docker container `stitch-pg` (local), or any Postgres 14+ |

## “Account” / credentials (local Docker)

We did **not** create a cloud Postgres account. Local Docker creates the role when the container is first run:

| Setting | Value | Where it comes from |
|---------|--------|---------------------|
| Host | `localhost` | Docker port publish `5432:5432` |
| Port | `5432` | Same |
| Superuser / app user | `stitch` | `POSTGRES_USER` on `docker run` |
| Password | `stitch` | `POSTGRES_PASSWORD` on `docker run` |
| Metadata database | `stitch` | `POSTGRES_DB` on `docker run` |
| Source database | `customer_demo` | Created by `npm run bootstrap:demo-source` |

Connection string for the source:

```text
postgresql://stitch:stitch@localhost:5432/customer_demo
```

## Files in this folder

| File | Size / role |
|------|-------------|
| `customer_demo_rebuild.sql` | **Preferred share** — one file, DDL + `generate_series` seed (~11k rows) |
| `002_customer_demo.sql` | Tiny schema + 3 customers (repo original) |
| `002b_customer_demo_bulk.sql` | Bulk replace to ~11k rows |
| `customer_demo_schema.sql` | `pg_dump --schema-only` |
| `customer_demo_data.sql` | `pg_dump --data-only --inserts` (~1.8 MB) |

## Commands — full recreate (PowerShell)

```powershell
# 1) Ensure Docker Postgres is up (first-time create if missing)
docker start stitch-pg
# If container does not exist:
# docker run -d --name stitch-pg `
#   -e POSTGRES_USER=stitch `
#   -e POSTGRES_PASSWORD=stitch `
#   -e POSTGRES_DB=stitch `
#   -p 5432:5432 `
#   pgvector/pgvector:pg16

# 2) Create DB + apply schema/seed via Que helpers
cd D:\ADC\prosols\adc\schemagraph\api
npm run bootstrap:demo-source
node scripts/applyCustomerDemoBulk.js

# 3) Or apply the shareable one-file rebuild
# docker exec -i stitch-pg psql -U stitch -d postgres -c "CREATE DATABASE customer_demo;"
# Get-Content ..\docs\tester-fixtures\postgres\customer_demo_rebuild.sql -Raw |
#   docker exec -i stitch-pg psql -U stitch -d customer_demo

# 4) Verify counts
docker exec -i stitch-pg psql -U stitch -d customer_demo -c "
  SELECT 'customers' t, COUNT(*) FROM customers
  UNION ALL SELECT 'products', COUNT(*) FROM products
  UNION ALL SELECT 'orders', COUNT(*) FROM orders
  UNION ALL SELECT 'order_items', COUNT(*) FROM order_items;
"
```

Expected totals: customers 2500 · products 500 · orders 3500 · order_items 4500 · **11000**.

## Que UI connector fields

Sources → PostgreSQL:

- Host `localhost` · Port `5432` · Database **`customer_demo`** · Schema `public` · User `stitch` · Password `stitch`

## Re-export dumps later

```powershell
docker exec stitch-pg pg_dump -U stitch -d customer_demo --schema-only --no-owner --no-privileges
docker exec stitch-pg pg_dump -U stitch -d customer_demo --data-only --inserts --no-owner --no-privileges
```
