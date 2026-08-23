# Step 2 — Databricks LIVE (not fixture)

SportEdge analytics lake: **20 Delta tables** in Unity Catalog, join keys aligned with Postgres/Mongo/Excel.

---

## Part A — Databricks workspace setup (one-time)

### A1. SQL Warehouse (required)

1. Databricks workspace → **SQL** → **SQL Warehouses**
2. **Create SQL Warehouse** (or use existing)
   - Name: `que-test-wh`
   - Size: **2X-Small** is enough for testing
3. **Start** the warehouse (must be running for sync)
4. Copy **Warehouse ID** from URL or warehouse details  
   Example: `a1b2c3d4e5f6g7h8`

### A2. Personal Access Token (PAT)

1. User icon (top right) → **Settings**
2. **Developer** → **Access tokens** → **Generate new token**
3. Label: `que-sportedge-test`
4. Lifetime: 90 days (or per your policy)
5. Copy token — starts with `dapi…`  
   **You only see it once.**

### A3. Workspace host

From browser URL:

```
https://dbc-abc12345-def6.cloud.databricks.com/...
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         This is HOST (no https://)
```

Azure example: `adb-1234567890123456.7.azuredatabricks.net`

### A4. Unity Catalog

Default catalog is usually **`main`**. Confirm:

```sql
SHOW CATALOGS;
```

We create schema: **`main.sportedge`** (change catalog if yours differs).

---

## Part B — Load SportEdge data

### Option 1 — Script from your PC (recommended)

```powershell
cd D:\ADC\_que_push\schemagraph\api

$env:SPORTEDGE_DATABRICKS_HOST="dbc-xxxxx.cloud.databricks.com"
$env:SPORTEDGE_DATABRICKS_WAREHOUSE_ID="your-warehouse-id"
$env:SPORTEDGE_DATABRICKS_TOKEN="dapixxxxxxxx"
# Optional if not using main/sportedge:
# $env:SPORTEDGE_DATABRICKS_CATALOG="main"
# $env:SPORTEDGE_DATABRICKS_SCHEMA="sportedge"

npm run bootstrap:sportedge-dbx
```

Takes ~2–5 minutes (20 tables + ~50k+ fact rows).

### Option 2 — Manual in Databricks SQL Editor

1. Open **SQL Editor**, attach your warehouse
2. Paste & run: `db/sportedge/databricks/001_ddl.sql`
3. Paste & run: `db/sportedge/databricks/002_seed.sql`

Verify:

```sql
SELECT COUNT(*) FROM main.sportedge.fact_orders;      -- 3500
SELECT COUNT(*) FROM main.sportedge.dim_customer;     -- 2500
SELECT order_id, pg_customer_id FROM main.sportedge.fact_orders LIMIT 5;
```

---

## Part C — Connect in Que (Vercel)

1. **Sources** → **Add** → **Databricks**
2. Toggle **Live** (not Fixture)
3. Fill in:

| Field | Example |
|-------|---------|
| **Name** | `dbx_sportedge_lake` |
| **Host** | `dbc-xxxxx.cloud.databricks.com` |
| **Warehouse ID** | `a1b2c3d4e5f6g7h8` |
| **Token** | `dapi…` |
| **Catalog** | `main` |
| **Schema** | `sportedge` |

4. **Save** → **Sync schema** (wait 1–3 min)
5. **Workspace** → should show 20 tables (`dim_customer`, `fact_orders`, …)

---

## Part D — Cross-source joins to test

After Postgres + Excel + Mongo are synced:

| Databricks | Other source | Join columns |
|------------|--------------|--------------|
| `dim_customer.pg_customer_id` | Postgres `customers.customer_id` | customer |
| `dim_customer.email` | Excel `mkt_leads.email` | email |
| `fact_orders.order_id` | Postgres `orders.order_id` | order |
| `dim_product.sku` | Postgres `products.sku` | sku |
| `fact_orders.order_id` | Mongo `pick_pack_events.order_id` | order |

Promote on **Joins** page → check **Eval** golden pairs.

---

## Part E — Render API (important for Vercel)

Your **Render API** calls Databricks over HTTPS. No extra IP whitelist for Databricks (unlike Mongo), but:

- Warehouse must be **Started**
- Token must not expire
- Token needs **SQL access** on the warehouse

Optional: set on Render env (fallback only — per-connection token in Que UI is preferred):

```
STITCH_DATABRICKS_TOKEN=dapi...
```

---

## Part F — Troubleshooting

| Error | Fix |
|-------|-----|
| `warehouse not running` | Start SQL warehouse in Databricks |
| `401 Unauthorized` | Regenerate PAT; paste fresh token in Que |
| `Catalog not found` | Run `SHOW CATALOGS`; use `hive_metastore` if no Unity Catalog |
| `Schema sportedge not found` | Re-run `npm run bootstrap:sportedge-dbx` |
| Sync shows 0 tables | Wrong **schema** name; must be `sportedge` not `analytics` |
| Sync timeout | Use smaller warehouse region; retry sync |
| `[TABLE_OR_VIEW_NOT_FOUND]` | DDL not applied — run 001_ddl.sql first |

---

## Tables created (20)

**Dimensions:** `dim_brand`, `dim_warehouse`, `dim_vendor`, `dim_customer`, `dim_product`, `dim_date`  

**Facts:** `fact_orders`, `fact_order_items`, `fact_shipments`, `fact_returns`, `fact_payments`, `fact_ad_spend`, `fact_wishlist_daily`, `fact_fraud`, `fact_inventory_daily`, `fact_cod_reconciliation`, `fact_vendor_payouts`  

**Bridges / agg:** `bridge_campaign_product`, `bridge_order_offer`, `agg_daily_revenue_by_brand`

---

## Security

- Use a **dedicated PAT** for Que testing; revoke when done.
- Do not commit tokens to GitHub.
- Que stores token encrypted in connection config (workspace secrets).

When sync succeeds, say **“Databricks live done”** and we’ll do the **full Vercel connector checklist** for all sources in order.
