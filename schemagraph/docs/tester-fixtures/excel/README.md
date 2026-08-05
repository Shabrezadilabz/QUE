# Que tester fixtures — Excel + CSV pack (~1 lakh rows)

Shareable pack for **Step 5** in `Que-Manual-Tester-Guide.pdf`.

## Summary

| Metric | Value |
|--------|--------|
| Files | **15** (9 × `.xlsx` + 6 × `.csv`) |
| Total rows | **109,000** (~1 lakh) |
| Columns per file | 3–15 (avg ~8) |
| Join keys | `email`, `owner_email`, `customer_id` (aligns with Postgres / Mongo `customer_demo`) |

## How these were created

```powershell
cd D:\ADC\prosols\adc\schemagraph\api
npm run fixtures:tester-excel
# same as: node scripts/generateTesterExcelPack.js
```

Output directory (this folder):

```text
adc/schemagraph/docs/tester-fixtures/excel/
```

Machine-readable inventory: `MANIFEST.json`.

## File list

| # | File | Rows | Cols | Type |
|---|------|------|------|------|
| 1 | `01_campaigns.xlsx` | 8,000 | 6 | Excel |
| 2 | `02_leads.xlsx` | 10,000 | 7 | Excel |
| 3 | `03_accounts.xlsx` | 8,000 | 7 | Excel |
| 4 | `04_support_tickets.xlsx` | 12,000 | 10 | Excel |
| 5 | `05_web_events.xlsx` | 15,000 | 8 | Excel |
| 6 | `06_invoices.xlsx` | 7,000 | 9 | Excel |
| 7 | `07_products_catalog.xlsx` | 5,000 | 12 | Excel |
| 8 | `08_nps_responses.csv` | 6,000 | 5 | CSV |
| 9 | `09_marketing_touch.csv` | 10,000 | 6 | CSV |
| 10 | `10_refunds.csv` | 4,000 | 8 | CSV |
| 11 | `11_referrals.csv` | 5,000 | 4 | CSV |
| 12 | `12_subscriptions.xlsx` | 6,000 | 11 | Excel |
| 13 | `13_device_registry.csv` | 3,000 | 15 | CSV |
| 14 | `14_geo_ip_lookup.csv` | 2,000 | 3 | CSV |
| 15 | `15_order_shipments.xlsx` | 8,000 | 14 | Excel |

## Que UI — how to connect

Que treats Excel and CSV as **upload** connectors (not a live server account).

### Option A — Excel connection (recommended for `.xlsx`)

1. Sources → Add → **Excel**
2. Name e.g. `excel_tester_pack`
3. Upload one or more `.xlsx` files from this folder (you can do batches)
4. Sync → each sheet becomes a table

### Option B — CSV connection

1. Sources → Add → **CSV**
2. Upload `.csv` files from this folder
3. Sync

### Practical tip for 15 files

Upload in **2–3 batches** (e.g. Excel batch 01–07 + 12 + 15, then CSV 08–11 + 13–14) so the UI stays responsive. Or create two connections: `excel_pack` and `csv_pack`.

## Where files live / share

Zip this entire folder to hand to another tester:

```powershell
Compress-Archive -Path D:\ADC\prosols\adc\schemagraph\docs\tester-fixtures\excel\* `
  -DestinationPath D:\ADC\prosols\adc\schemagraph\docs\tester-fixtures\excel_pack_109k.zip -Force
```

## Notes

- Que introspects **schema + capped samples** — it does not load all 109k rows into the graph.
- Large uploads may take a few seconds; keep API running on `:8787`.
- Emails include `ada@example.com` / `grace@example.com` / `alan@example.com` / `user{N}@example.com` for cross-source joins.
