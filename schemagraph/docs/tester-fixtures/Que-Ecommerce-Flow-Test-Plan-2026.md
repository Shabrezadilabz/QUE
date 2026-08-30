# Que — Ecommerce Full-Stack Flow Test Plan (2026)

**For:** Manual QA, customer demos, production sign-off  
**Scenario:** India D2C ecommerce — connectors synced, joins promoted, jobs + AI + BI  
**Fixture roots:** `docs/tester-fixtures/` (Postgres, Excel, SportEdge) + `api/fixtures/*_demo.json` (commerce POC)  
**Prod reference:** UI (Vercel) · API `https://que-k31z.onrender.com`

**Companion docs:**
- [`../customer/Que-Customer-Guide-And-Testing-Flows-2026.md`](../customer/Que-Customer-Guide-And-Testing-Flows-2026.md) — what each page does
- [`../MANUAL-TESTING-MASTER-2026.md`](../MANUAL-TESTING-MASTER-2026.md) — internal §A–§M checklist

---

## 1. Test session header (fill before every run)

| Field | Your value |
|-------|------------|
| **Date** | |
| **Tester** | |
| **Environment** | Local / Staging / **Production** |
| **UI URL** | |
| **API URL** | |
| **Login email** | |
| **Workspace name** | |
| **Git commit / build** | |

**Ecommerce stack installed (check all that apply):**

- [ ] India D2C commerce POC (Shopify + Razorpay + Stripe)
- [ ] India SMB POC (MySQL + Shopify + Razorpay)
- [ ] Marketing attribution POC (Google Ads + Shopify)
- [ ] India SaaS POC (Chargebee + Stripe + HubSpot)
- [ ] Live Postgres from `tester-fixtures/postgres/customer_demo`
- [ ] SportEdge Excel/CSV from `tester-fixtures/sportedge/`
- [ ] Que Warehouse provisioned (`/load`)
- [ ] Neon migrations through **053** (prod — required for chat)

---

## 2. Your ecommerce data map (golden keys)

Use these **known join bridges** when testing joins, chat, and jobs. Values come from `api/fixtures/*_demo.json`.

### Cross-source reconciliation (D2C)

| Business fact | Source A | Key | Source B | Key |
|---------------|----------|-----|----------|-----|
| Order **5001001** | Shopify `orders.id` | `5001001` | Stripe `charges.metadata_shopify_order_id` | `5001001` |
| Same order (INR 2499) | Shopify `orders.total_price` | `2499.00` | Razorpay `orders.receipt` | `shopify_5001001` |
| Payment amount | Razorpay `payments.amount` | `249900` (paise) | Stripe `charges.amount` | `249900` |
| Buyer email | Shopify `customers.email` | `buyer@example.in` | Stripe `customers.email` | `buyer@example.in` |
| HubSpot contact | HubSpot `contacts.email` | `buyer@example.in` | Chargebee `customers.email` | `founder@sportedge.in` (SaaS pack) |

### Marketing attribution

| Fact | Google Ads | Shopify |
|------|------------|---------|
| Campaign drove orders | `campaign_stats_daily.shopify_order_ids` | `5001001,5001002` |
| Order ID | — | `orders.id` = `5001001` |

### SaaS billing chain (India SaaS pack)

| Step | Table | Link field |
|------|-------|------------|
| Chargebee → Stripe sub | `subscriptions.stripe_subscription_id` | `sub_1Qabc789` |
| Stripe subscription | `subscriptions.id` | `sub_1Qabc789` |
| Chargebee → HubSpot | `customers.hubspot_company_id` | `hs_88291001` |

### MySQL OLTP (SMB pack)

| Table | FK |
|-------|-----|
| `orders.customer_id` → `customers.id` | e.g. `1001` |
| `order_items.order_id` → `orders.id` | e.g. `90001` |
| `order_items.product_id` → `products.id` | e.g. `501` |

### Postgres `customer_demo` (live DB — `tester-fixtures/postgres/`)

After `customer_demo_rebuild.sql`: **2500 customers · 500 products · 3500 orders · 4500 order_items · 11000 rows**.

Que Sources → PostgreSQL: `localhost:5432` / `customer_demo` / user `stitch` (see [`postgres/README.md`](postgres/README.md)).

---

## 3. Testing maturity levels (pick your path)

| Level | Time | Who | Goal |
|-------|------|-----|------|
| **L0 — Smoke** | 5 min | Anyone | Login + hub loads + one sync |
| **L1 — Easy click** | 30 min | QA / PM | Every nav group opens; no AI |
| **L2 — Ecommerce flow** | 90 min | Steward | POC → joins → job → validate |
| **L3 — AI dynamic** | 60 min | Steward + engineer | Chat, agent, pipes, Monk |
| **L4 — Production realtime** | 45 min | Release owner | Live API smoke + embed + worker |

Run **L0 → L2** before any customer demo. Run **L4** before go-live.

---

## 4. L0 — Smoke (5 minutes)

| # | Action | Expected | PASS |
|---|--------|----------|------|
| 0.1 | Open UI → login | Dashboard loads | |
| 0.2 | `/hub` | Module cards + health score | |
| 0.3 | `/sources` | Your ecommerce connections listed | |
| 0.4 | Sync one connection | Toast: tables synced > 0 | |
| 0.5 | `/workspace` | Table nodes visible | |
| 0.6 | `GET {API}/health` | `"ok": true`, worker enabled | |

**Automated (PowerShell):**

```powershell
$env:QUE_API_BASE = "https://que-k31z.onrender.com"
$env:MONK_E2E_EMAIL = "<your-email>"
$env:MONK_E2E_PASSWORD = "<your-password>"
cd adc/schemagraph/api
node eval/smokeE2e.js
```

---

## 5. L1 — Every page, easy verification (30 minutes)

Use sidebar groups. Mark **PASS / FAIL / N/A** per row.

### Public (no login)

| Route | Do | Expected |
|-------|-----|----------|
| `/login` | Sign in / out | Session works |
| `/status` | Open | API health JSON or status page |
| `/connectors` | Scroll matrix | Que vs Fivetran rows load |

### Platform group (`/hub` + sub-nav)

| Route | Do | Expected |
|-------|-----|----------|
| `/hub` | Open | Modules grid + infrastructure row |
| `/load` | Pipelines tab | Connections + SLA badges |
| `/load?tab=runs` | Runs tab | Queue / history (may be empty) |
| `/model` | Open | Model list or empty state |
| `/studio/grid` | Open | Table picker (needs warehouse) |
| `/catalog` | Search `orders` | Shopify/Razorpay tables appear |
| `/pipes` | Type prompt, don't submit | Textarea + Draft button |
| `/observe` | Open | Health score + stat cards |

### Core

| Route | Do | Expected |
|-------|-----|----------|
| `/workspace` | Pan canvas | All synced sources as nodes |
| `/sources` | List connections | Status dots (active/warning) |
| `/joins` | Suggested tab | ≥1 suggested join if multi-source |
| `/chat` | `/help` | Skills list (500 = run migrations on prod) |

### Build group

| Route | Do | Expected |
|-------|-----|----------|
| `/jobs` | List jobs | Create or open existing |
| `/jobs/:id/notebook` | Run Test | Dry-run logs |
| `/lineage` | Open | Graph or empty state |
| `/templates` | Open | Template list |
| `/validation` | Open | Suite UI |
| `/drift-agent` | Open | Drift proposals or empty |

### Analytics group

| Route | Do | Expected |
|-------|-----|----------|
| `/bi` | Open canvas | Report Studio loads |
| `/metrics` | Open | KPI list (may need Monk) |
| `/ship` | Draft title | Draft created |

### Govern group

| Route | Do | Expected |
|-------|-----|----------|
| `/observe` | Refresh | Status label |
| `/compliance` | Open | Evidence sections |
| `/marketplace` | Browse packs | Pack cards |
| `/monk` | Select pack | Phase UI |
| `/eval` | Open | Golden eval UI |
| `/glossary` | Add term | Saves |

### Settings

| Route | Do | Expected |
|-------|-----|----------|
| `/settings/members` | View team | Roles shown |
| `/settings/ai-policy` | Toggle Que Agent | Saves |
| `/settings/bi-access` | View groups | Admin only |
| `/settings/governance` | Export audit | CSV downloads |

---

## 6. L2 — Ecommerce steward flow (90 minutes)

**Goal:** Prove the full loop on your ecommerce connectors with **known golden keys**.

### Phase A — Verify data landed (15 min)

| # | Step | Expected | PASS |
|---|------|----------|------|
| A.1 | `/sources` — confirm POC connections **active** | Green/warning, last sync time | |
| A.2 | `/catalog` → filter **Tables** → search `orders` | Shopify + Razorpay + MySQL orders | |
| A.3 | `/workspace` — count nodes | ≥10 tables across sources | |
| A.4 | `/load` → **Provision warehouse** (if not done) | Warehouse READY on `/hub` | |
| A.5 | Sync all connections again | `/hub` infrastructure shows rows replicated | |

### Phase B — Joins (20 min)

Promote these joins (or verify AI suggested them):

| # | Join | Evidence to check | PASS |
|---|------|-------------------|------|
| B.1 | Shopify `orders.customer_id` → `customers.id` | FK + samples | |
| B.2 | Razorpay `payments.order_id` → Razorpay `orders.id` | FK | |
| B.3 | **Cross-source:** Razorpay `orders.receipt` ↔ Shopify `orders.id` | Sample `shopify_5001001` | |
| B.4 | Stripe `charges.metadata_shopify_order_id` ↔ Shopify `orders.id` | Sample `5001001` | |
| B.5 | Google Ads `campaign_stats_daily.shopify_order_ids` ↔ Shopify orders | Contains `5001001` | |
| B.6 | MySQL `order_items` → `orders` → `customers` | Line-item path | |

**Steps:**
1. `/joins` → **Run inference**
2. Open each join → read risk tier + sample overlap
3. **Promote** B.1–B.4 minimum
4. **Reject** one low-confidence join → confirm stays rejected after reload

### Phase C — Job: orders ↔ payments mart (25 min)

| # | Step | Expected | PASS |
|---|------|----------|------|
| C.1 | `/jobs` → create **E2E · Orders payments mart** | Notebook opens | |
| C.2 | Paste engineer SQL (below) or use chat `/job` | Cells populated | |
| C.3 | **Run Test** (dry-run) | Logs, no error | |
| C.4 | **Validate** (live, ≤20 rows) | Preview grid with rows | |
| C.5 | **Mark Ready** | Status = ready | |
| C.6 | Export JSON → `/verify` | Attestation valid | |
| C.7 | Materialize (if enabled) | Warehouse job queued on `/load` runs | |

**Sample stitch SQL (adapt table names to your graph labels):**

```sql
-- Engineer notebook — reconcile Shopify order to Razorpay payment (schema-only names)
SELECT
  s.id AS shopify_order_id,
  s.total_price,
  r.receipt AS razorpay_receipt,
  p.amount AS razorpay_amount_paise,
  p.status AS payment_status
FROM shopify_orders s
LEFT JOIN razorpay_orders r ON r.receipt = CONCAT('shopify_', CAST(s.id AS TEXT))
LEFT JOIN razorpay_payments p ON p.order_id = r.id
WHERE s.id = 5001001
LIMIT 20;
```

### Phase D — Model + Studio (15 min)

| # | Step | Expected | PASS |
|---|------|----------|------|
| D.1 | `/model` → new **staging** model | Saves | |
| D.2 | SQL references warehouse `raw_*` table | Preview runs or clear error | |
| D.3 | Export **dbt bundle** | JSON downloads | |
| D.4 | `/studio/grid` → pick warehouse table | Grid preview ≤200 rows | |

### Phase E — BI + Ship (15 min)

| # | Step | Expected | PASS |
|---|------|----------|------|
| E.1 | `/bi` → add bar chart | Visual placeholder | |
| E.2 | Run preview | Data or cert gate message | |
| E.3 | `/ship` → draft **Revenue by channel** | Draft created | |
| E.4 | Approve → copy embed URL | `/embed/:token` renders | |
| E.5 | Rollback ship | Embed stops working | |

---

## 7. L3 — AI chat & agent (dynamic questions)

**Settings:** `/settings/ai-policy` → **Que Agent ON** · Audience toggle on Chat page.

### Tier 1 — Easy (schema only, no cert needed)

| # | Audience | Prompt | Expected |
|---|----------|--------|----------|
| 3.1 | Engineer | `/help` | Lists slash skills |
| 3.2 | Engineer | `/list` | Tables from all ecommerce sources |
| 3.3 | Engineer | `/describe orders` (or @mention Shopify orders) | Columns + keys |
| 3.4 | Engineer | `/suggested` | Pending joins list |
| 3.5 | CEO | What tables do we have? | Plain list, no SQL wall |
| 3.6 | Engineer | `/privacy` | Schema-only policy explanation |

### Tier 2 — Join & SQL (engineer)

| # | Prompt | Expected |
|---|--------|----------|
| 3.7 | How do I join Shopify orders to Razorpay payments? | Join path mentioning `receipt` / `shopify_` prefix |
| 3.8 | `/sql` + @shopify orders @razorpay payments | SELECT draft with JOIN |
| 3.9 | Show joins for order_items | MySQL FK path if SMB pack installed |
| 3.10 | `/diff` | Workspace summary counts |

### Tier 3 — Agent & jobs (HITL checkpoints)

| # | Prompt | Expected |
|---|--------|----------|
| 3.11 | `/que Create a job joining Shopify orders and Razorpay payments for order 5001001` | Agent plan → may ask to **promote join** |
| 3.12 | Approve checkpoint → open job link | `/jobs/:id/notebook` with SQL |
| 3.13 | `/que Materialize the orders payments job as a table` | Materialize panel or gate message |
| 3.14 | Genie (✨) on Jobs page: Add Stripe charge amount to this query | Uses job context |

### Tier 4 — Outcome & BI (CEO path)

| # | Prompt | Expected |
|---|--------|----------|
| 3.15 | `/outcome I want D2C revenue reconciled across Shopify, Razorpay, and Stripe` | Outcome plan card: sources → joins → metrics → ship |
| 3.16 | `/bi Build an executive dashboard: revenue KPI, orders by payment method, top products` | Scaffold or cert requirement message |
| 3.17 | `/dashboard` | Genie draft → Report Studio link |
| 3.18 | CEO: What is total revenue for order 5001001? | Answer or cert/join gate (honest) |

### Tier 5 — Pipes (NL pipeline)

| # | Step | Expected |
|---|------|----------|
| 3.19 | `/pipes` → *Load Shopify orders, join Razorpay payments, aggregate daily revenue* | Multi-step proposal |
| 3.20 | Approve → Apply | Job created |

### Tier 6 — Monk autopilot (45 min standalone)

| # | Step | Expected |
|---|------|----------|
| 3.21 | `/monk` → **Ecommerce** pack → Start | Phase stream |
| 3.22 | Complete Discover → Certify | Green cert state |
| 3.23 | `/metrics` | KPIs seeded |
| 3.24 | CEO chat on certified metric | Live grid or attested answer |

---

## 8. L4 — Production & realtime testing

### 8.1 Pre-requisites (prod)

| # | Check | How |
|---|-------|-----|
| P.1 | Migrations 037+ and 048–053 | `npm run migrate` on Neon |
| P.2 | `GET /health` | worker.enabled = true |
| P.3 | GitHub secret `QUE_API_BASE` | Points to Render URL |
| P.4 | Vercel UI latest commit | Matches `main` |

### 8.2 Realtime API smoke

```powershell
$env:QUE_API_BASE = "https://que-k31z.onrender.com"
$env:MONK_E2E_EMAIL = "<email>"
$env:MONK_E2E_PASSWORD = "<password>"
cd adc/schemagraph/api
node eval/smokeE2e.js
node eval/runConnectorDepthTests.js
```

| Check | Expected |
|-------|----------|
| Login | 200 + workspaces |
| Platform hub | 6 modules |
| Chat `/help` | 200 (not 500) |
| Create fixture + sync | tablesSynced > 0 |
| SSM route A/B | 200 |

### 8.3 Monk prod E2E (optional, 10–45 min)

```powershell
$env:MONK_E2E_WORKSPACE_ID = "<your-workspace-uuid>"
node eval/runMonkProdE2E.js
```

### 8.4 Realtime UI checks (prod browser)

| # | Flow | Realtime signal |
|---|------|-----------------|
| R.1 | Sync connection | `last_sync_at` updates within 30s |
| R.2 | Job **Validate** | Live SQL returns rows in UI grid |
| R.3 | `/load` runs tab | Worker job appears after materialize |
| R.4 | `/observe` refresh | Health score changes after sync |
| R.5 | Chat engineer question | SSM routing chip in response metadata |
| R.6 | Scheduled sync (Settings → Automation) | `sync_next_at` advances hourly |

### 8.5 Load / worker stress (light)

| # | Action | Expected |
|---|--------|----------|
| S.1 | Sync **all** POC connections back-to-back | All complete; no auth errors |
| R.2 | Run **Validate** on 3 jobs | Worker queue ≤ configured max |
| S.3 | `/observe` after failures | Worker failed count visible |

---

## 9. Page × functionality matrix (full catalog)

Use this as a **coverage checklist** after L2. Each cell: one action + expected outcome.

| Page | Must-test functions |
|------|---------------------|
| **Hub** | Refresh · module card links · infrastructure stats |
| **Load** | Sync now · provision WH · runs tab |
| **Model** | CRUD model · preview · dbt export · delete |
| **Studio** | Table pick · filter · QueExpr · SQL mode · run grid |
| **Catalog** | Search · filter kind · register asset |
| **Pipes** | Draft · approve · reject · apply → job |
| **Observe** | Stat drill-downs · incident feed |
| **Workspace** | Filter joins · drag join · export PNG/JSON · Monk modal |
| **Sources** | Add connector · POC pack install · sync · edit · delete |
| **Joins** | Promote · reject · inference · duplicates tab · comments |
| **Chat** | CEO/Engineer · slash skills · @mention · agent · sessions |
| **Jobs** | Notebook · results · deploy · schedule · materialize · dbt PR |
| **Lineage** | Trace job → tables |
| **Metrics** | View/create KPI · lineage |
| **BI** | Visuals · filters · certify · embed · Looker export |
| **Ship** | Draft · approve · rollback |
| **Monk** | Full pack run · pause · certify |
| **Marketplace** | Install pack |
| **Pack Studio** | Blend · mapping · export |
| **Compliance** | Evidence export |
| **Settings** | Invite · roles · AI policy · automation · audit CSV |

---

## 10. Extended fixtures (`docs/tester-fixtures/`)

Use when you outgrow commerce POC fixtures.

| Folder | Use in Que | Test focus |
|--------|------------|------------|
| [`postgres/`](postgres/README.md) | Sources → PostgreSQL live | 11k rows · real FK joins |
| [`excel/`](excel/README.md) | Upload Excel/CSV sources | 15 spreadsheets · messy headers |
| [`mongodb/`](mongodb/README.md) | Sources → MongoDB | events · profiles · sessions |
| [`databricks/`](databricks/README.md) | Snowflake/DBX fixture JSON | Lakehouse joins |
| [`sportedge/`](sportedge/excel/) | Excel upload (SportEdge brand) | Campaigns · vendors · web events |

**SportEdge bootstrap (local API):**

```powershell
cd adc/schemagraph/api
npm run bootstrap:sportedge-pg
npm run seed:demo
```

Then `/login?sandbox=1` or use seeded workspace with Que Agent on.

---

## 11. Recommended test order (one day)

| Block | Time | Level | Activities |
|-------|------|-------|------------|
| Morning 1 | 30 min | L0 + L1 | Smoke + every page opens |
| Morning 2 | 90 min | L2 | Ecommerce joins + job + validate + verify |
| Lunch | — | — | Run `smokeE2e.js` on prod |
| Afternoon 1 | 60 min | L3 Tier 1–3 | Chat + agent + job from chat |
| Afternoon 2 | 45 min | L3 Tier 4–6 | Outcome · BI · Pipes · Monk |
| End of day | 30 min | L4 | Prod browser realtime + embed rollback |

---

## 12. Sign-off criteria

**Demo-ready (customer):**
- [ ] L0 + L2 Phase A–C complete
- [ ] At least **4 cross-source joins promoted**
- [ ] One job **Validated** with attestation
- [ ] CEO chat answers table inventory

**Production-ready:**
- [ ] L4 smoke green (including chat `/help`)
- [ ] Migrations applied on Neon
- [ ] Worker enabled on `/health`
- [ ] One embed ship tested approve + rollback
- [ ] Viewer role blocked from creating sources (403)

---

## 13. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Chat `/help` → 500 | Run `npm run migrate` on prod DB (missing `source_object_id`) |
| Empty workspace | Sync sources first |
| No cross-source joins | Install ≥2 POC packs · Run inference |
| Studio grid empty | Provision warehouse on `/load` |
| CEO revenue blocked | Run Monk certify or promote joins first |
| Validate returns 0 rows | Check promoted joins + table names in SQL |

---

*Version 2026-08-28 · Ecommerce fixture keys aligned to `api/fixtures/*_demo.json`*
