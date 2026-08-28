# Que — Customer Guide & Testing Flows (2026)

**Audience:** Design partners, sales demos, customer onboarding stewards  
**Purpose:** Explain **every page**, **what it does**, **how to test it**, and **recommended demo order**  
**Prod reference:** UI on Vercel · API `https://que-k31z.onrender.com`  
**Companion:** [`MANUAL-TESTING-MASTER-2026.md`](../MANUAL-TESTING-MASTER-2026.md) (internal PASS/FAIL checklist)

---

## 1. The Que story (30-second pitch)

Que is **one login** for the full data steward loop:

```
Connect sources → Sync schema → Review joins (human approval)
→ Build jobs / models → Certify KPIs (Monk) → Chat & BI on certified data
→ Observe drift & quality
```

**Key promise to customers:** Que does **not** silently merge tables or run unchecked AI on raw data. A **human steward promotes joins** and **certifies metrics** before CEO-facing answers and live dashboards go out.

---

## 2. Prerequisites chain (what must exist first)

| Step | You need… | Unlocks… |
|------|-----------|----------|
| 1 | Account + workspace | Everything |
| 2 | At least one **Source** connection | Workspace graph, joins, jobs |
| 3 | **Sync** on that source | Tables on canvas, join suggestions |
| 4 | **Promote** at least one join (Joins page) | Stitch jobs, cross-table SQL |
| 5 | **Job** dry-run / validate | Export, materialize, dbt bundle |
| 6 | **Monk certify** or manual metric | CEO chat KPI answers, BI certify |
| 7 | **Que Warehouse** provisioned (Load page) | Model preview, Studio grid, replicate |

**Fastest demo path:** Use a **POC pack** on Sources (one click installs fixture connectors + sync).

---

## 3. Navigation map (left sidebar)

| Sidebar label | Route | One-line purpose |
|---------------|-------|------------------|
| **Workspace** | `/workspace` | Interactive schema graph (ERD) |
| **Platform** | `/hub` | Six-module readiness dashboard |
| **Load** | `/load` | Sync pipelines, warehouse replicate, worker runs |
| **Model** | `/model` | SQL models + dbt export |
| **Catalog** | `/catalog` | Search all assets (tables, metrics, jobs…) |
| **Pipes** | `/pipes` | Natural language → pipeline proposal |
| **Observe** | `/observe` | Health, drift, golden eval, incidents |
| **Sources** | `/sources` | Add & sync connectors |
| **Joins** | `/joins` | Approve / reject AI-suggested joins |
| **Chat** | `/chat` | CEO & engineer Q&A, Que Agent |
| **Jobs** | `/jobs` | SQL notebooks, validate, export, materialize |
| **Lineage** | `/lineage` | Job → table lineage graph |
| **Compliance** | `/compliance` | Evidence pack, controls |
| **Marketplace** | `/marketplace` | Industry packs |
| **Metrics** | `/metrics` | Certified KPI definitions |
| **BI** | `/bi` | Report Studio dashboards |
| **Settings** | `/settings/*` | Team, security, AI policy, billing |

**Also linked from nav groups:** `/monk`, `/ship`, `/studio/grid`, `/managed`, `/glossary`, `/eval`, `/templates`, `/validation`, `/drift-agent`

---

## 4. Recommended demo flows

### A. CEO demo — 20 minutes (non-technical buyer)

| Min | Go to | Do this | Say this |
|-----|-------|---------|----------|
| 0–2 | `/login` | Sign in | “One login for load, model, BI, and AI.” |
| 2–4 | `/hub` | Show module cards | “Live readiness across six modules — no separate tools.” |
| 4–8 | `/sources` | Install **India D2C POC pack** → sync all | “Connectors in one click; schema lands in minutes.” |
| 8–11 | `/workspace` | Pan graph, show suggested join lines | “Que discovers relationships — nothing merges without your team.” |
| 11–14 | `/joins` | Promote one join, show evidence | “Human-in-the-loop — green/yellow/red risk tiers.” |
| 14–17 | `/chat` | Audience **CEO** → “What tables do we have?” | “Plain English answers on **your** schema.” |
| 17–19 | `/ship` or `/bi` | Draft → approve chart | “Certified output ships to embed / Looker export.” |
| 19–20 | `/observe` | Health score | “Drift and golden eval in one place — not a separate observability SKU.” |

### B. Steward onboarding — 60 minutes (technical champion)

| Block | Pages | Goal |
|-------|-------|------|
| Connect | `/sources`, `/load` | Postgres or POC pack + sync + warehouse provision |
| Graph | `/workspace`, `/joins` | Promote 2 joins, run inference |
| Build | `/jobs`, `/model` | Create stitch job → validate → mark Ready → export dbt JSON |
| Certify | `/monk`, `/metrics` | Run ecommerce pack → certify KPI |
| Consume | `/chat`, `/bi` | Engineer SQL in chat; scaffold Report Studio board |
| Govern | `/observe`, `/compliance`, `/settings/governance` | Drift, audit export |

### C. India stack POC — 15 minutes (fixture, no credentials)

1. `/sources` → scroll to **POC packs** → choose one:
   - **India D2C commerce** — Shopify + Razorpay + Stripe  
   - **India SMB full stack** — MySQL + Shopify + Razorpay  
   - **India SaaS billing** — Chargebee + Stripe + HubSpot  
   - **Marketing attribution** — Google Ads + Shopify  
2. Click **Install pack** (admin) → wait for sync toasts  
3. `/workspace` → see all tables  
4. `/joins` → **Run inference** → promote `orders ↔ payments`  
5. `/chat` → `/joins orders payments`  
6. `/hub` → all modules show activity  

---

## 5. Page-by-page reference

Each section: **What it does** · **Key actions** · **Prerequisites** · **How to test (step-by-step)**

---

### Public pages (no login)

#### `/login` — Sign in & register

**What it does:** Email/password auth, workspace creation, optional SSO, sandbox entry.

**Key actions:** Sign in · Register · SSO (if configured) · `/login?sandbox=1` for demo workspace

**How to test:**
1. Register with email + password (≥8 chars) → lands on `/workspace` or `/hub`
2. Sign out → sign in again
3. Confirm no passwords pre-filled on production UI

---

#### `/sales`, `/pricing`, `/roi`, `/connectors`, `/status`, `/eval/public`

| Route | What it does | How to test |
|-------|--------------|-------------|
| `/sales` | Prospect landing, case studies, CTAs | Click sandbox, pricing, status links |
| `/pricing` | Plan tiers | Verify Growth / Enterprise copy loads |
| `/roi` | ROI calculator | Change inputs, see output update |
| `/connectors` | Honest matrix vs Fivetran/Hevo | Scroll Que vs competitor rows |
| `/status` | Public API health | Should show `ok: true` when API up |
| `/eval/public` | Public quality scorecard | Golden recall / agent metrics display |

---

#### `/verify` — Attestation verification

**What it does:** Verify HMAC attestation on exported job JSON (trust chain for compliance).

**How to test:**
1. Export a job from `/jobs` → Deploy tab → copy attestation payload
2. Open `/verify` → paste → confirm **valid**

---

#### `/embed/:token` — Embedded BI

**What it does:** Read-only embedded chart/board for CEO views (after Ship or BI mints token).

**Prerequisites:** Approved ship draft or BI embed token

**How to test:**
1. `/ship` → Approve draft → copy embed URL  
2. Open in incognito → chart renders  
3. Rollback on Ship → embed should stop working  

---

### Platform module pages

#### `/hub` — Platform hub

**What it does:** Single dashboard showing readiness of **Load · Model · Studio · Catalog · Pipes · Observe** plus warehouse and execution summaries.

**Key actions:** Refresh · Click module card · Jump to workspace

**Prerequisites:** Authenticated workspace (empty OK — shows “Not configured”)

**How to test:**
1. Open `/hub` → confirm 6 module cards
2. Before any sync → several cards show **empty** or **review**
3. After POC pack sync → cards move to **ready** / **review**
4. Click **Load** card → lands on `/load`

**Customer line:** “This replaces checking five different vendor dashboards.”

---

#### `/load` — Que Load

**What it does:** Operations view for connectors — sync schedules, SLA badges, warehouse replication pipelines, background worker queue and run history.

**Tabs:** `?tab=pipelines` (default) · `?tab=runs`

**Key actions:**
- **Sync now** on a connection  
- **Provision Que Warehouse** (first-time)  
- **Run due syncs** (scheduled)  
- View worker job queue on Runs tab  

**Prerequisites:** At least one source; admin for provision

**How to test:**
1. `/sources` → add + sync a fixture (e.g. Shopify POC)
2. `/load` → Pipelines tab → see connection with **last sync** time
3. Click **Sync now** → badge updates
4. **Provision warehouse** if prompted → refresh hub
5. Runs tab → after a warehouse job, see queue entry

**Customer line:** “Schema introspect today; full replicate into **your** Que Warehouse — not a shared multi-tenant lake.”

---

#### `/model` — Que Model

**What it does:** dbt-class SQL model IDE — staging/mart layers, preview on warehouse, lineage view, export dbt bundle.

**Routes:** `/model` · `/model/:modelId`

**Key actions:** Create model · Edit SQL · Run preview · Export dbt JSON · Delete

**Prerequisites:** Que Warehouse provisioned; tables in `raw.*`

**How to test:**
1. `/load` → ensure warehouse provisioned + at least one replicated/synced table
2. `/model` → **New model** → staging layer
3. Write `SELECT * FROM raw_<connection>.<table> LIMIT 100`
4. **Run preview** → see rows (or empty if replicate off)
5. **Lineage** tab → shows dependencies
6. **Export dbt** → download JSON bundle

---

#### `/studio/grid` — Que BI Studio (grid explore)

**What it does:** Spreadsheet-style explore on warehouse tables — column pick, aggregations, filters, QueExpr formulas, optional raw SQL mode.

**Route:** `/studio` redirects to `/studio/grid`

**Key actions:** Pick table · Configure columns · Add formula · Run grid (200 row cap)

**Prerequisites:** Warehouse tables exist

**How to test:**
1. Open `/studio/grid`
2. Select a warehouse table from picker
3. Hide columns, add **SUM** on amount column
4. Add filter → **Run grid**
5. Toggle SQL mode → see generated SELECT

**Customer line:** “Sigma-class explore — but SQL always runs on **your** warehouse, not a black box.”

---

#### `/catalog` — Que Catalog

**What it does:** Unified search across tables, metrics, dashboards, pipelines, models, datasets, glossary terms.

**Key actions:** Search · Filter by kind · Register manual asset · Open lineage link

**Prerequisites:** Some workspace activity (sync, jobs, metrics) for rich index

**How to test:**
1. After sync → `/catalog` → filter **Tables**
2. Search for `orders`
3. Register a manual **Dashboard** asset → appears in list
4. Click through to glossary/lineage links

---

#### `/pipes` — Que Pipes

**What it does:** Type natural language → Que drafts an ELT **pipeline proposal** (steps) → steward approves → creates a Job.

**Key actions:** Enter prompt · Draft · Review steps · Approve · Reject · Apply (opens job)

**Prerequisites:** Synced schema; write role; AI enabled in settings

**How to test:**
1. `/pipes` → prompt: *“Load Shopify orders and join to Razorpay payments”*
2. Click **Draft** → wait for proposal
3. Review steps → **Approve**
4. **Apply** → redirects to `/jobs/:id/notebook`
5. Run job Test from there

**Customer line:** “Weld-style speed — but every pipeline becomes a governed job with audit trail.”

---

#### `/observe` — Que Observe

**What it does:** Reliability command center — schema drift, golden eval status, worker failures, duplicate-key risk, load SLA, incident feed.

**Key actions:** Refresh · Click stat cards (drill to drift-agent, eval, joins, load)

**Prerequisites:** Workspace activity for meaningful signals (empty workspace shows “All clear” with zeros)

**How to test:**
1. Open `/observe` after sync + join promote
2. Note **health score** and status label
3. Click **Open high drift** (if any) → `/drift-agent`
4. After golden eval run → see threshold badge

---

### Core steward pages

#### `/workspace` — Schema graph (ERD)

**What it does:** Visual canvas of all synced tables, relationship lines (explicit + AI-suggested), drag-to-create joins, filters, export PNG/PDF/JSON, post-sync Monk prompt.

**Key actions:**
- Pan/zoom canvas  
- Filter by relationship type / confidence / source  
- Drag column → column to propose join  
- Promote/reject from canvas  
- Export graph  
- Open stitch job dialog from selection  

**Prerequisites:** Synced connection(s)

**How to test:**
1. Sync a POC pack → `/workspace`
2. Confirm table nodes appear per source
3. Toggle filter **AI-inferred only**
4. Select a yellow suggested edge → promote or reject
5. Export **JSON** → re-import sanity check
6. Reload page → layout positions persist

**Customer line:** “This is the graph Fivetran never built — upstream of dbt.”

---

#### `/sources` — Sources & connectors

**What it does:** Connection home, connector catalog wizard, POC pack installer, per-connection sync/edit/delete, file upload for CSV/Excel.

**Routes:**
| Route | View |
|-------|------|
| `/sources` | Connection list (home) |
| `/sources/new` | Catalog — choose connector |
| `/sources/new/:connector` | Configure wizard |
| `/sources/:sourceId` | Connection detail |

**Key actions:**
- **Add connection** from catalog  
- **Install POC pack** (admin) — batch fixture connectors  
- **Sync** — introspect schema (+ optional warehouse replicate)  
- **Edit** — blank password field = keep existing secret  
- **Delete** connection  
- Upload CSV/Excel files  

**POC packs available:**
- SF ↔ DBX fixture  
- India D2C commerce (Shopify + Razorpay + Stripe)  
- India SMB (MySQL + Shopify + Razorpay)  
- India SaaS billing (Chargebee + Stripe + HubSpot)  
- Marketing attribution (Google Ads + Shopify)  

**How to test:**
1. `/sources/new` → pick **Shopify** → fixture mode → Save → **Sync**
2. Toast shows tables synced count
3. `/workspace` → tables visible
4. Install **India D2C POC pack** → 3 connections appear → sync each
5. Edit connection name only (no password) → save → sync still works

---

#### `/joins` — Join review (HITL)

**What it does:** Inbox for AI-suggested joins — **never auto-accepted**. Risk tiers, evidence, sample overlap, promote/reject, run inference, golden eval, duplicates tab.

**Route:** `/joins` · `/joins?tab=duplicates`

**Key actions:** Promote · Reject · Run inference · Add comment · Golden eval · Duplicates tab

**Prerequisites:** Synced schema with ≥2 related tables

**How to test:**
1. After POC sync → `/joins` → tab **Suggested**
2. Open one join → read evidence + samples
3. **Promote** → moves to Accepted
4. **Reject** another → stays rejected after reload
5. **Run inference** → new suggestions appear
6. Duplicates tab → profile duplicate keys (if data exists)

**Customer line:** “Que proposes; your steward disposes. No silent Cartesian products.”

---

#### `/chat` — Chat & Que Agent

**What it does:** Schema Q&A with **CEO** (plain language) vs **Engineer** (SQL, citations) audiences; live result grid; Outcome plans; Que Agent with HITL checkpoints; voice; @mentions; session history.

**Key actions:**
- Switch **CEO / Engineer** audience  
- Ask natural language questions  
- Use **slash skills** (below)  
- `@table` / `@table.column` mentions  
- Approve agent checkpoints (join promote, job create)  
- **Reindex AI** after major schema change  

**Prerequisites:** Synced schema; Que Agent enabled (`/settings/ai-policy`); certified data for CEO KPI answers

**Slash commands:**

| Command | What it does |
|---------|--------------|
| `/help` | List skills and @ mention tips |
| `/list` | Inventory all tables |
| `/describe` | Column detail for focused table |
| `/joins` | Explain joins for focused tables |
| `/suggested` | Show joins awaiting review |
| `/sql` | Draft SELECT/JOIN SQL |
| `/job` | Draft stitch job artifact |
| `/diff` | Workspace schema summary |
| `/privacy` | Schema-only AI policy explanation |
| `/outcome` | CEO plan: sources → joins → metrics → Ship |
| `/que` | Que Agent — jobs, materialize, BI |
| `/genie` | Same as agent (floating Genie elsewhere) |
| `/bi` | Build Report Studio report |
| `/dashboard` | Genie dashboard draft → Studio |

**How to test:**
1. **Engineer:** “List tables in this workspace” → see table list + optional SQL
2. `/help` → skills list returns
3. `/describe orders` (after @mention or POC sync)
4. **CEO:** “What is total revenue?” before certify → should explain cert gate or schema-only answer
5. `/que Create a job joining orders and payments` → approve checkpoints
6. Toggle **Que Agent off** in settings → agent commands show disabled message

**Prod note:** Chat requires Neon migrations through **037+** (and **048–053** for full platform). Error `column "source_object_id" does not exist` → run `npm run migrate` on prod DB.

---

#### `/jobs` — Jobs & notebooks

**What it does:** Job monitor, multi-cell SQL notebook, dry-run vs live validate, mark Ready, export with attestation, dbt/GitHub PR, materialize to warehouse, schedule, drift blocking.

**Routes:** `/jobs` · `/jobs/:jobId/notebook` · `/results` · `/deploy`

**Key actions:** Create job · Run Test · Validate (≤20 rows live) · Mark Ready · Export JSON · Materialize · Schedule

**Prerequisites:** Promoted joins for cross-source stitch jobs

**How to test:**
1. `/joins` → promote a join between two tables
2. `/jobs` → create job or use chat `/job`
3. Notebook tab → edit SQL → **Run Test** (dry-run)
4. **Validate** → live read-only, capped rows
5. **Mark Ready** → status changes
6. Deploy tab → **Export JSON** → verify attestation on `/verify`
7. **Materialize** panel → queue warehouse write (if enabled)

---

#### `/monk` — Monk Mode (industry packs)

**What it does:** Autopilot onboarding — pick industry pack (e.g. ecommerce) → phases Discover → Map → Clean → Build → Certify → Done with live event stream.

**Key actions:** Select pack · Start · Pause/resume · Certify · Open deliverables (metrics, BI)

**Prerequisites:** Synced source(s); write role

**How to test:**
1. `/marketplace` or `/monk` → pick **ecommerce** pack
2. **Start run** → watch phase feed
3. Wait for **Certify** phase → complete checklist
4. `/metrics` → certified KPIs appear
5. `/bi` → scaffold from pack templates

**Customer line:** “Monk is your autopilot steward — not a black-box ETL engine.”

---

#### `/metrics` — Certified metrics

**What it does:** KPI definitions tied to certified marts — name, formula, lineage, cert badge.

**How to test:**
1. After Monk certify → `/metrics` → list populated
2. Open one metric → see lineage + tags
3. Reference metric name in CEO chat

---

#### `/bi` — Report Studio (BI)

**What it does:** Dashboard authoring — bar/line/KPI/table visuals, board filters, cross-filter, parameters, scaffold full report, certify chart, embed token, export to Looker/Metabase/Tableau/Power BI, drill-to-SQL.

**Also:** `/studio/grid` for grid explore (see above)

**Key actions:** Add visual · Preview/run · Scaffold report · Certify · Mint embed · Schedule refresh

**Prerequisites:** Certified managed datasets and/or metrics

**How to test:**
1. `/bi` → **Scaffold** report from workspace summary
2. Add bar chart visual → pick metric/table
3. **Run preview** → data grid populates
4. **Certify** chart → badge appears
5. **Mint embed** → open `/embed/:token`
6. Export **Looker** pack → download LookML merge kit

---

#### `/ship` — Ship to BI (CEO one-screen)

**What it does:** Fast path: chart title → draft → approve → live embed URL; rollback revokes embed.

**Key actions:** Create draft · Approve · Rollback · Link materialization

**Prerequisites:** Certified dataset recommended for live embed

**How to test:**
1. `/ship` → enter chart title → **Create draft**
2. **Approve** → copy embed URL
3. Open embed in new tab
4. **Rollback** → embed invalid

---

#### `/lineage` — Lineage graph

**What it does:** Visual lineage from jobs → output tables → upstream sources.

**How to test:**
1. Create + run a job with materialize
2. `/lineage` → trace job node to tables

---

### Governance & compliance pages

#### `/compliance` — Compliance evidence

**What it does:** Controls checklist, evidence pack export, attestation summary for audits.

**How to test:** Open → export evidence pack CSV/JSON → verify sections populated after workspace activity

---

#### `/glossary` — Business glossary

**What it does:** Terms, definitions, linked assets — steward-maintained vocabulary.

**How to test:** Add term → link to table/column from catalog

---

#### `/steward` — Steward inbox

**What it does:** Tasks awaiting steward action (reviews, cert items).

---

#### `/rules` — Workspace rules for AI

**What it does:** Custom rules injected into chat context (admin).

**How to test:** Add rule “Always use INR for currency” → ask chat → rule reflected

---

#### `/eval` — Golden join evaluation (authenticated)

**What it does:** Run golden set recall/precision on join inference quality.

---

#### `/validation` — Job validation suite

**What it does:** Batch validation checks on an existing job.

**Route:** linked from Jobs nav group

---

#### `/drift-agent` — Drift fix proposals

**What it does:** When schema drift detected → AI proposes fix jobs.

**How to test:** Trigger drift (change source schema) → `/observe` → open drift → propose fix

---

#### `/proposals`, `/transforms` — Transform drafts

**What it does:** HITL approve/apply transform proposals from agent or drift.

**Linked from:** Joins nav group

---

#### `/marketplace`, `/pack-studio`, `/templates`

| Route | Purpose |
|-------|---------|
| `/marketplace` | Browse/install industry packs |
| `/pack-studio` | Blend/custom packs, replication export |
| `/templates` | Job templates from installed packs |

---

#### `/managed`, `/plane` — Managed datasets & plane

**What it does:** Certified managed datasets list; managed plane NLP landing (when enabled).

---

#### `/outcome` — Outcome plan page

**What it does:** Standalone outcome planning (also available via `/outcome` in chat).

---

### Settings (`/settings/*`)

| Tab | Route | What it does | How to test |
|-----|-------|--------------|-------------|
| **Members** | `/settings/members` | Invite users, roles (viewer/member/admin/owner) | Invite → accept → change role |
| **Security** | `/settings/security` | Sessions, API keys overview, SSO status | Revoke a session |
| **AI Policy** | `/settings/ai-policy` | Samples/scrub, join infer, Que Agent, materialize, BYOK keys, RAG, GitHub/dbt | Toggle Que Agent → verify chat |
| **Automation** | `/settings/automation` | Scheduled sync, scheduled jobs, webhooks | Set hourly sync on a connection |
| **BI Access** | `/settings/bi-access` | Table/column ACL for Studio (admin) | Deny column → verify hidden in BI |
| **Billing** | `/settings/billing` | Seats, usage, checkout | View usage counters |
| **Governance** | `/settings/governance` | Drift webhooks, attestations, audit CSV | Export audit log |
| **Team** | `/settings/team` | Propose vs Promote min roles, Slack webhooks | Set promote = admin only |
| **Domains** | `/settings/domains` | Data product domains, table globs | Create domain scoped to one source |
| **Enterprise** | `/settings/enterprise` | SCIM, SSO enforce, CMK, SIEM, SOC2 export | View SCIM endpoint docs |

---

## 6. Role-based “who uses what”

| Persona | Primary pages | Rarely touches |
|---------|---------------|----------------|
| **CEO / business** | `/chat` (CEO), `/ship`, `/embed`, `/bi` | `/jobs`, `/model` |
| **Data steward** | `/sources`, `/joins`, `/workspace`, `/monk`, `/observe` | `/settings/enterprise` |
| **Analytics engineer** | `/jobs`, `/model`, `/pipes`, `/chat` (Engineer) | `/ship` |
| **Admin** | `/settings/*`, `/compliance`, `/marketplace` | — |
| **Viewer** | `/bi`, `/chat` (read-only areas) | Cannot create sources/jobs |

---

## 7. Automated test commands (for your team)

Run against prod after customer session to confirm health:

```powershell
$env:QUE_API_BASE = "https://que-k31z.onrender.com"
$env:MONK_E2E_EMAIL = "<your-test-email>"
$env:MONK_E2E_PASSWORD = "<your-test-password>"
cd adc/schemagraph/api
node eval/smokeE2e.js
```

Full Monk E2E (10–45 min):

```powershell
node eval/runMonkProdE2E.js
```

---

## 8. Troubleshooting for demos

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Chat `/help` → 500 | Prod DB missing migrations | Run `npm run migrate` on Neon (through 053) |
| Empty workspace graph | No sync yet | `/sources` → Sync |
| No join suggestions | Single table or infer off | Add 2nd source; Settings → join infer ON |
| CEO chat “not certified” | Expected before Monk | Run `/monk` or explain cert gate |
| Studio grid empty | Warehouse not provisioned | `/load` → Provision warehouse |
| Viewer can create source | Role bug | Should get 403 — report if not |

---

## 9. One-page customer handout (printable)

**Day 1 — Connect:** Sources → POC pack → Sync → Workspace graph  
**Day 2 — Trust:** Joins → Promote evidence-backed joins  
**Day 3 — Build:** Jobs or Pipes → Validate → Export  
**Day 4 — Certify:** Monk → Metrics  
**Day 5 — Consume:** Chat (CEO) + BI + Ship embed  
**Ongoing:** Observe + Compliance  

**Support:** `/status` · Settings → Members (invite your team)

---

*Document version: 2026-08-28 · Matches platform commit with Load/Model/Studio/Catalog/Pipes/Observe modules and 17 live connectors.*
