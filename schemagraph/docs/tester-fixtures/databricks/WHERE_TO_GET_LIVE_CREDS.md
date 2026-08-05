# Where to get live Databricks credentials

Use only if you switch Que Sources from **Fixture** to **Live**.

## 1. Host

1. Open your Databricks workspace in the browser.
2. Copy the hostname from the URL, e.g.  
   `https://adb-1234567890123456.7.azuredatabricks.net` → host =  
   `adb-1234567890123456.7.azuredatabricks.net`  
   (no `https://`, no trailing slash).

## 2. SQL Warehouse ID

1. In Databricks: **SQL** → **SQL Warehouses** (or Compute → SQL warehouses).
2. Open a warehouse (Serverless or Pro).
3. Copy the **Warehouse ID** (long alphanumeric id, not the display name).

Start the warehouse if it is stopped before Sync / live validate.

## 3. Personal Access Token (PAT)

1. Click your user icon → **Settings** → **Developer** → **Access tokens**.
2. **Generate new token** · copy once (`dapi…`).
3. Paste into Que Sources → Token (stored encrypted; UI masks as `••••••••`).

Never commit tokens. Prefer workspace secrets / env `STITCH_DATABRICKS_TOKEN` for automation only.

## 4. Catalog & schema

Unity Catalog: pick a catalog (often `main`) and schema that contains tables you care about.  
Que introspects `information_schema` for that schema only (metadata + capped samples).

## Smoke check outside Que (optional)

```bash
# Replace HOST, WH, TOKEN
curl -s -X POST "https://HOST/api/2.0/sql/statements" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"warehouse_id\":\"WH\",\"statement\":\"SELECT 1\"}"
```
