# Que Master Plan — 10× Data Steward + Monk Mode

**Version:** 1.0  
**Date:** August 2026  
**Status:** Product & engineering north star

---

## Vision (one sentence)

**Connect sources → pick industry (Ecommerce / US Healthcare / Finance / Audit) → Que enters Monk Mode → maps your schema to a template ontology, profiles data, proposes fixes, creates jobs + KPIs + dashboards, and autofills every page with what’s possible — with human approval at gates.**

---

## Positioning (one sentence)

**One steward + Que does the work of a small data team — for schema, joins, quality fixes, and repeatable pipelines.**

---

## Marketing claim (defensible when plan is shipped)

### Primary headline
> **The 10× data steward — connect your warehouse, pick your industry, Que sets up schema, joins, cleaning, jobs, KPIs, and dashboards automatically.**

### Supporting lines
- *Add connectors. Pick Ecommerce, Healthcare, Finance, or Audit. Monk Mode does the rest — you approve at the gates.*
- *One senior data engineer or analyst with Que replaces the discovery, join, quality, and pipeline work of a small team.*
- *Schema intelligence + governed live answers + industry playbooks — not another chatbot on raw SQL.*

### What we do NOT claim (until Phase 4+)
- “Zero data people required”
- “Fully autonomous cleaning with no human review”
- “Replaces Snowflake/dbt/your entire stack”

### Honest narrow claim (usable today → Phase 1)
- *“10× faster schema discovery, join approval, and governed CEO/engineer chat on connected Postgres.”*

---

## Problem we solve

| Persona | Pain | Que outcome |
|---------|------|-------------|
| **CEO / business** | Waits on analysts for every metric | Plain-English answers from live data (rows never enter AI) |
| **Data engineer** | Schema archaeology, join guessing, drift | Schema graph, HITL joins, drift gates, export contracts |
| **Data analyst** | Ad-hoc SQL, duplicate profiling, manual dashboards | Steward inbox, auto KPIs, template jobs, Monk Mode |
| **Compliance / audit** | No trail of who approved what | Audit log, rules packs, certified datasets |

---

## Product architecture (four layers)

```
┌─────────────────────────────────────────────────────────────────┐
│  L4 — SURFACE (autofill UI)                                      │
│  Sources · Joins · Jobs · Rules · Chat · KPIs · Dashboards · Eval│
├─────────────────────────────────────────────────────────────────┤
│  L3 — INDUSTRY TEMPLATE PACKS                                    │
│  Ontology · matchers · KPIs · jobs · dashboards · quality rules  │
├─────────────────────────────────────────────────────────────────┤
│  L2 — MONK MODE ORCHESTRATOR (real-time AI worker)               │
│  Discover → Map → Clean → Build → Certify (+ SSE progress)       │
├─────────────────────────────────────────────────────────────────┤
│  L1 — CONNECT + SCHEMA GRAPH (foundation — built today)          │
│  Connectors · sync · graph · RAG · live read · HITL joins        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core principles (non-negotiable)

1. **Schema-first** — metadata graph is source of truth; never invent tables.
2. **Human-in-the-loop** — AI proposes; humans approve joins, fixes, and publishes.
3. **Row isolation** — live warehouse rows go to UI only; not LLM/RAG context.
4. **Live verification** — SQL uses `information_schema` + synced schema intersection.
5. **Industry playbooks** — vertical templates, not one-size-fits-all prompts.
6. **Prove before ship** — golden eval + drift baseline before “certified.”
7. **Mid-market wedge** — enterprise-grade stewardship without a 10-person data platform team.

---

## Monk Mode — end-to-end flow

### Trigger
User connects source(s) → selects industry pack → clicks **Enter Monk Mode**.

### Phase A — Discover (30–120 sec)
| Step | Action | Output |
|------|--------|--------|
| A1 | Sync schema from all connections | `buildSchemaContextPack` |
| A2 | Live table list (`information_schema`) | `listLiveTableNames` |
| A3 | Template match score vs pack ontology | % Ecommerce / Healthcare / etc. |
| A4 | Column profiling (nulls, distinct, formats, dupes) | Profile store |
| A5 | Stream events to UI | “Found orders, brands — 87% Ecommerce match” |

### Phase B — Map (1–5 min, low touch)
| Step | Action | Output |
|------|--------|--------|
| B1 | Map physical tables → template entities | `orders` → `FactOrder` |
| B2 | Infer joins + overlap scores | Join candidates |
| B3 | Auto-promote joins ≥90% confidence | Promoted edges in graph |
| B4 | Queue low-confidence mappings | Steward inbox items |
| B5 | Build GraphRAG context slice | Chat + SQL primer |

### Phase C — Clean (2–10 min, approval gates)
| Step | Action | Output |
|------|--------|--------|
| C1 | Run pack quality rules | Issue list |
| C2 | AI fix proposal per issue | Patch SQL / transform draft |
| C3 | Preview on capped rows (20) | Before/after diff |
| C4 | User batch-approve or skip | Approved fixes |
| C5 | Apply to staging marts | Materialized tables |
| C6 | PII / HIPAA / finance scrub | Policy pack applied |

### Phase D — Build (2–10 min, mostly automatic)
| Step | Action | Output |
|------|--------|--------|
| D1 | Create jobs from pack recipes | `jobs.js` + notebooks |
| D2 | Register KPIs / metrics | `metricDefinitions.js` |
| D3 | Generate dashboard specs | Widget bindings |
| D4 | Seed workspace rules | Join prefs, CEO tone, privacy |
| D5 | Index RAG chunks | Vector store refresh |
| D6 | Wire chat (CEO + Engineer) | Pack-scoped prompts |

### Phase E — Certify (1–3 min)
| Step | Action | Output |
|------|--------|--------|
| E1 | Run golden set eval | Pass/fail per KPI |
| E2 | Snapshot drift baseline | Contract freeze |
| E3 | Mark workspace certified | Badge + capability map |
| E4 | Unlock full autofill | All pages populated |

### Monk Mode UX
- Full-screen **Monk Mode** with stepper: Discover → Map → Clean → Build → Certify
- **Live event feed** (SSE/WebSocket), not a blind spinner
- **Pause / resume / skip step**
- **Approval drawer** for fixes and low-confidence joins
- **Capability map** on completion: “What you can build with this data”

---

## Industry template packs

Each pack is a **versioned JSON/YAML bundle** (extend `industryTemplates.js`).

### Pack structure
```yaml
id: ecommerce-v1
industry: Ecommerce
displayName: Ecommerce (Retail / D2C)
match:
  tables: [{ pattern: orders, weight: 1.0 }, { pattern: brands, weight: 0.9 }]
  minScore: 0.65
ontology:
  entities: [Brand, Customer, Order, OrderLine, Product, Payment]
  relationships: [...]
kpis:
  - id: revenue_by_brand
    label: Revenue by brand
    ceoQuestion: "What's {brand} revenue?"
    sqlTemplate: ...
    goldenExpected: ...
qualityRules:
  - id: orphan_order_brand
    severity: high
    sql: ...
jobs:
  - id: brand_revenue_mart
    notebook: ...
    materialize: ...
dashboards:
  - id: ceo_revenue
    widgets: [...]
chat:
  ceoPrompts: [...]
  engineerCells: [...]
policies:
  seedRules: [...]
  piiColumns: [...]
goldenPairs: [...]  # sportedge-golden-pairs.json
```

### Vertical roadmap

| Priority | Pack ID | Status | Proof dataset |
|----------|---------|--------|---------------|
| **P0** | `ecommerce-v1` | In progress (SportEdge) | `db/sportedge/*` |
| **P1** | `finance-reconciliation-v1` | Partial (`finance-reconciliation` template) | TBD ledger+bank |
| **P2** | `audit-sox-v1` | New | Evidence + drift exports |
| **P3** | `us-healthcare-v1` | New | Claims/members (HIPAA strict) |

---

## 10× steward — feature map

What **one person + Que** replaces from a **small team (≈5–10 FTE worth of recurring work)**:

| Team function | Without Que | With Que (target state) |
|---------------|-------------|-------------------------|
| Schema documentation | 1 analyst weeks | Auto sync + graph + autofill |
| Join discovery | 1 engineer weeks | AI infer + HITL + overlap |
| Ad-hoc CEO questions | Analyst queue | CEO chat + live KPIs |
| Profiling / DQ | Manual scripts | Monk Mode + rules inbox |
| Pipeline creation | Hand-built dbt/jobs | Template jobs + materialize |
| Dashboard setup | BI developer | Pack dashboards autogen |
| Drift monitoring | Custom jobs | Drift agent + block export |
| Audit trail | Spreadsheets | Audit log + certifications |

---

## Page autofill matrix (post–Monk Mode)

| Page / area | Autofill content |
|-------------|------------------|
| **Sources** | Health, row counts, pack match badge, last sync |
| **Joins** | Promoted + suggested from pack; inbox for review |
| **Jobs** | 3–8 jobs from recipes; status pipeline |
| **Rules** | Industry policy pack installed |
| **Chat** | CEO KPIs + Engineer SQL from pack |
| **Metrics** | Registered KPIs with live SQL bindings |
| **Dashboards** | Prebuilt widgets bound to marts |
| **Lineage** | Source → mart → KPI → dashboard paths |
| **Eval / Golden** | Pack golden pairs loaded |
| **Compliance** | Monk Mode audit trail export |
| **Capability map** | “Ready / needs review / not available” per feature |

---

## AI / RAG stack (built + planned)

### Shipped (main branch)
- GraphRAG-style context (`chatGraphContext.js`)
- Hybrid RAG rerank (`ai/rag.js`)
- SCHEMA PRIMER + column samples (`schemaContext.js`)
- Live-first chat + CEO/Engineer modes (`chatEngine.js`, `chatLiveQuery.js`)
- SQL allowlist + live `information_schema` verify (`chatSqlGuard.js`)
- Brand revenue fast path (orders × brands)
- Chat sessions + history

### Planned
- Monk Mode agent loop (plan → tool → event → next)
- Pack-aware graph context
- Fix copilot (propose patch SQL, not just answer)
- Profiling agent on sync
- Stewardship inbox UI
- Real-time SSE progress stream

---

## Engineering roadmap — phases

### Phase 0 — Foundation ✅ (done / in progress)
**Goal:** Trustworthy chat + schema graph on connected Postgres.

- [x] Schema context pack + relationships
- [x] Live read-only SQL (CEO + Engineer)
- [x] GraphRAG + query plan + SCHEMA PRIMER
- [x] SQL guard + live table verification
- [x] Industry template seeds (`industryTemplates.js`)
- [x] SportEdge bootstrap + golden pairs
- [ ] PUMA revenue demo stable on production Neon

**Marketing (limited):** “Governed live answers from your schema graph.”

---

### Phase 1 — Steward inbox + profiling (8–10 weeks)
**Goal:** Credible “faster analyst” — find what’s broken.

| # | Deliverable | Key files / new modules |
|---|-------------|-------------------------|
| 1.1 | Column profiling on sync | `api/src/profiling/` |
| 1.2 | Quality rules engine | `api/src/qualityRules.js` |
| 1.3 | Steward inbox API + UI | `api/src/stewardship.js`, `StewardInboxPage.tsx` |
| 1.4 | Fix proposal copilot | extend `chatLiveQuery.js` → `fixCopilot.js` |
| 1.5 | Preview / approve fix flow | staging exec in `liveExec.js` |
| 1.6 | Ecommerce quality pack v1 | extend SportEdge rules |

**Exit criteria:** Demo shows 5+ auto-detected issues + 2 approved fixes on SportEdge.

**Marketing:** “Find and fix data issues 10× faster — with AI proposals and one-click approve.”

---

### Phase 2 — Monk Mode v1 — Ecommerce only (10–12 weeks)
**Goal:** Connect Postgres → pick Ecommerce → guided autopilot.

| # | Deliverable | Key files / new modules |
|---|-------------|-------------------------|
| 2.1 | Template pack schema v2 | `industryTemplates.js` → `packs/ecommerce-v1.yaml` |
| 2.2 | Template matcher | `api/src/templateMatcher.js` |
| 2.3 | Entity mapper | `api/src/templateMapper.js` |
| 2.4 | Monk orchestrator | `api/src/monkMode.js` |
| 2.5 | SSE progress stream | `api/src/index.js` route + `MonkModePage.tsx` |
| 2.6 | Auto job creation | `jobTemplates.js` + `jobs.js` |
| 2.7 | KPI registry from pack | `metricDefinitions.js` |
| 2.8 | Capability map UI | `CapabilityMap.tsx` |
| 2.9 | Golden certification gate | `goldenSetEval.js` |

**Exit criteria:** New workspace: connect SportEdge Postgres → Monk Mode → jobs + 3 KPIs + CEO chat works in <15 min.

**Marketing:** “Connect. Pick Ecommerce. Monk Mode sets up your data steward workspace.”

---

### Phase 3 — Build + dashboards + 10× pipelines (10–14 weeks)
**Goal:** Full “small team in a box” for one vertical.

| # | Deliverable |
|---|-------------|
| 3.1 | Materialize marts from pack recipes |
| 3.2 | Dashboard template engine (3–5 widgets per pack) |
| 3.3 | Page autofill service (all nav items) |
| 3.4 | dbt bundle export from certified marts |
| 3.5 | Bulk fix + dedupe assistant |
| 3.6 | Column standardization rules |
| 3.7 | Data health scorecard (single % for execs) |
| 3.8 | Team workflow (assign / comment / approve) |

**Exit criteria:** Case study — 1 steward certifies Ecommerce workspace end-to-end; CEO dashboard live.

**Marketing:** “One steward + Que = schema, joins, quality, pipelines, KPIs, dashboards.”

---

### Phase 4 — Multi-vertical + realtime agent (12–16 weeks)
**Goal:** Finance, Audit, US Healthcare packs + production-grade agent.

| # | Deliverable |
|---|-------------|
| 4.1 | Finance reconciliation pack + Monk Mode |
| 4.2 | Audit / SOX evidence pack |
| 4.3 | US Healthcare pack (HIPAA policy hard gate) |
| 4.4 | Agent tool loop (profile, join test, create job, eval) |
| 4.5 | Learn from approvals → workspace memory |
| 4.6 | Multi-source Monk Mode (Postgres + Salesforce) |
| 4.7 | BI ship (Looker/Metabase/Que canvas export) |

**Exit criteria:** 3 vertical demos on video; 1 design partner per vertical.

**Marketing (full claim):** “10× fastest path from connectors to clean, certified, dashboard-ready data.”

---

## Monk Mode — technical components (build list)

| Component | Purpose | Priority |
|-----------|---------|----------|
| `monkMode.js` | State machine, phases, resume | P2 |
| `templateMatcher.js` | Score warehouse vs pack | P2 |
| `templateMapper.js` | Table/column → ontology entity | P2 |
| `profiling/` | Column stats store | P1 |
| `qualityRules.js` | Pack + custom rules | P1 |
| `stewardship.js` | Inbox CRUD + approve | P1 |
| `fixCopilot.js` | AI patch generator | P1 |
| `capabilityMap.js` | “What you can build” | P2 |
| `dashboardTemplates.js` | Widget spec → render/export | P3 |
| `monkEvents.js` | SSE event bus | P2 |
| `packCertification.js` | Golden + drift gate | P2 |

---

## Connector strategy (for “just add connectors” claim)

| Connector | Phase | Monk Mode support |
|-----------|-------|-------------------|
| **PostgreSQL** | Now | Full (SportEdge proof) |
| **Snowflake** | P2 | Live read + profiling |
| **Databricks** | P2 | Live read + profiling |
| **Salesforce** | P3 | CRM enrich packs |
| **BigQuery** | P3 | Enterprise retail/finance |
| **Spreadsheet** | P1 | Starter / SMB onboarding |

**Rule:** Marketing says “add connectors” only for connectors with **live read + profiling + pack match** — not metadata-only sync.

---

## KPI & dashboard catalog — Ecommerce v1 (reference)

| KPI ID | Label | CEO question | Source |
|--------|-------|--------------|--------|
| `revenue_by_brand` | Revenue by brand | Puma revenue? | orders × brands |
| `order_count` | Orders | How many orders? | orders |
| `aov` | Average order value | Average basket size? | orders.order_total |
| `top_skus` | Top products | Best sellers? | order_items × products |
| `repeat_customers` | Repeat rate | Repeat customers? | orders × customers |

| Dashboard | Audience | Widgets |
|-----------|----------|---------|
| `ceo-revenue` | CEO | Revenue by brand, trend, top 5 |
| `ops-orders` | Ops | Order status, fulfillment |
| `analyst-quality` | Engineer | DQ failures, orphan rates |

---

## US Healthcare pack — constraints (Phase 4)

- **HIPAA:** no PHI in LLM; scrub rules mandatory; BAA with customer
- **Ontology:** Patient, Member, Claim, Provider, Payer, CPT, DRG, Denial
- **KPIs:** Denial rate, cost PMPM, days in AR, auth turnaround
- **Monk Mode:** longer approve gates; no auto-promote on join <95%

---

## Finance / Audit pack — constraints (Phase 2–4)

- **Ontology:** Ledger, GL account, Entity, Bank feed, Reconciliation
- **KPIs:** Unmatched %, variance $, tie-out status
- **Audit:** immutable Monk Mode log; export for SOX evidence
- **No auto-apply** fixes on production ledger without explicit publish

---

## Go-to-market — claim ladder

| Phase | Safe headline |
|-------|---------------|
| **Now** | “Schema intelligence + governed live chat for CEOs and engineers.” |
| **Phase 1** | “Find and fix data quality issues 10× faster.” |
| **Phase 2** | “Connect Postgres. Pick Ecommerce. Que Monk Mode sets up your workspace.” |
| **Phase 3** | “One data steward. Que replaces the work of a small data team.” |
| **Phase 4** | “10× fastest path from connectors to certified KPIs and dashboards.” |

---

## Success metrics

| Metric | Target (12 mo) |
|--------|----------------|
| Time to first CEO answer (connect → revenue KPI) | < 15 min |
| Monk Mode completion rate | > 70% |
| Join auto-promote accuracy | > 85% |
| Golden eval pass on certify | 100% required |
| Steward fixes approved vs proposed | > 50% |
| Design partners (mid-market) | 5–10 |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Over-promising “full clean” | Approval gates + staging + certify |
| Wrong industry match | Show score; user confirms pack |
| LLM hallucinated SQL | Allowlist + live schema + heuristics |
| Healthcare compliance | Separate pack; legal review |
| Monk Mode hangs | Resumable state machine + timeouts |
| Competitor “me too” chat | Moat = closed loop + HITL graph + certify |

---

## Immediate next sprint (2 weeks)

1. **Stabilize PUMA revenue** on production (SportEdge Neon + sync).
2. **Spec `packs/ecommerce-v1.yaml`** from SportEdge + golden pairs.
3. **Spike `templateMatcher.js`** — score SportEdge tables vs pack.
4. **Design `MonkModePage.tsx`** — stepper + event feed mock.
5. **Profiling MVP** — null %, distinct count on sync for top 20 columns.
6. **Steward inbox schema** — `steward_issues` table + API stub.

---

## Summary

Que becomes the **10× data steward platform** when:

1. **Connectors** land schema + live data in the graph.  
2. **Monk Mode** runs the industry playbook with visible AI progress.  
3. **Humans approve** joins, fixes, and publish — not removed from loop.  
4. **Pages autofill** from capability map — jobs, KPIs, dashboards, chat.  
5. **Certification** proves golden KPIs before marketing “fully automated setup.”

**Vision sentence + positioning sentence = north star.**  
**Phase 0 → 4 roadmap = execution plan.**  
**Ecommerce (SportEdge) = first proof; Finance, Audit, Healthcare = follow.**

---

*Document owner: Product / Engineering*  
*Next review: After Phase 1 sprint 1*
