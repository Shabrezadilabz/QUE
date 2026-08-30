# Que tester fixtures

Shareable data packs for **manual QA**, design partners, and local dev.

## Quick start

| Who you are | Start here |
|-------------|------------|
| **New tester — first time, step-by-step** | **[`Que-Beginner-Manual-Testing-Guide-2026.md`](Que-Beginner-Manual-Testing-Guide-2026.md)** ← start here |
| Experienced QA / full ecommerce flow | [`Que-Ecommerce-Flow-Test-Plan-2026.md`](Que-Ecommerce-Flow-Test-Plan-2026.md) |
| What each page does (customer) | [`../customer/Que-Customer-Guide-And-Testing-Flows-2026.md`](../customer/Que-Customer-Guide-And-Testing-Flows-2026.md) |
| Internal §A–§M checklist | [`../MANUAL-TESTING-MASTER-2026.md`](../MANUAL-TESTING-MASTER-2026.md) |

## Folders

| Path | Contents |
|------|----------|
| [`postgres/`](postgres/) | `customer_demo` schema + ~11k row seed SQL |
| [`excel/`](excel/) | 15 workbooks + CSV (campaigns, orders, NPS, …) |
| [`mongodb/`](mongodb/) | BSON/JSON dumps · events, profiles, sessions |
| [`databricks/`](databricks/) | Unity Catalog demo JSON + sample CSV rows |
| [`sportedge/`](sportedge/) | Brand-specific Excel/CSV for SportEdge demos |

## Commerce POC (UI — no files needed)

Install from **Sources → POC packs** (uses `api/fixtures/*_demo.json`):

- India D2C — Shopify + Razorpay + Stripe  
- India SMB — MySQL + Shopify + Razorpay  
- Marketing attribution — Google Ads + Shopify  
- India SaaS — Chargebee + Stripe + HubSpot  

Golden join keys (order `5001001`, receipt `shopify_5001001`, etc.) are in the beginner guide and flow test plan.

## Prod smoke (manager / release owner only)

```powershell
$env:QUE_API_BASE = "https://que-k31z.onrender.com"
$env:MONK_E2E_EMAIL = "<email>"
$env:MONK_E2E_PASSWORD = "<password>"
cd adc/schemagraph/api
node eval/smokeE2e.js
```
