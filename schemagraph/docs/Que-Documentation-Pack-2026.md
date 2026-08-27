# Que — Documentation Pack (August 2026)

**Product:** Que (SchemaGraph)  
**Repo:** https://github.com/Shabrezadilabz/QUE.git  
**Latest ship:** `ed8b4f9` — Unified Que Agent + Genie  
**Stack:** Vercel (UI) · Render (API) · Neon (Postgres + pgvector)

This pack has four sections for different audiences:

1. [Management — Feature Overview](#1-management--feature-overview)  
2. [Technical — Functionality & Outcomes](#2-technical--functionality--outcomes)  
3. [Testing — How We Verify Quality](#3-testing--how-we-verify-quality)  
4. [Strategy — How to Be Better vs. Alternatives](#4-strategy--how-to-be-better-vs-alternatives)

---

# 1. Management — Feature Overview

## One-line pitch

**Connect sources → pick an industry pack → Que maps schema, joins, jobs, KPIs, and dashboards — with human approval at trust gates.**

## Who it's for

| Persona | What Que gives them |
|---------|---------------------|
| **CEO / business leader** | Plain-English answers from live data; BI ship without waiting on a full analytics team |
| **Data steward / analyst (1 person)** | 10× throughput on discovery, joins, quality, and pipeline setup |
| **Data engineer** | Contract-frozen jobs, drift gates, dbt/GitHub export, orchestrator handoff |
| **Compliance / audit** | Audit trail, evidence packs, certified datasets, attestation on exports |

## Defensible claim (today)

> **75–85% automation** of schema discovery, join inference, job drafting, KPI seeding, and dashboard scaffolding for mid-market teams with **one technical steward** — not zero humans.

Do **not** claim: full Fivetran replacement, zero HITL, SOC 2 Type II certificate (process scaffolding only).

---

## Core product areas (what you can demo)

### A. Connect & understand data

| Feature | What it does | Where |
|---------|--------------|-------|
| **Sources** | Connect Postgres, Excel, CSV, MongoDB, Databricks, Snowflake, BigQuery, Salesforce | `/sources` |
| **Workspace graph** | Visual schema canvas; drag column→column joins; sync & stitch | `/workspace` |
| **Join Review** | AI-suggested joins with Green/Yellow/Red risk; Promote/Reject HITL | `/joins` |
| **Lineage** | Job → table paths; column-level exploration | `/lineage` |
| **Glossary & Catalog** | Business terms; governed assets (catalog gated by flag) | `/glossary`, `/catalog` |

### B. AI assistant (unified — new in `ed8b4f9`)

| Feature | What it does | Where |
|---------|--------------|-------|
| **Chat (CEO mode)** | Business questions; live warehouse reads; no SQL exposed | `/chat` |
| **Chat (Engineer mode)** | SQL, RAG, job drafts, agent plans | `/chat` |
| **Que Agent** | Create jobs, edit jobs, materialize tables, build BI from natural language | Chat + Genie |
| **Que Genie** | Floating ✨ assistant on every page; knows current job/route context | All pages (bottom-right) |
| **Outcome plans** | CEO-style multi-step: sources → joins → metrics → Ship to BI | `/chat` (`/outcome`) |

### C. Pipelines & jobs

| Feature | What it does | Where |
|---------|--------------|-------|
| **Jobs** | Notebook SQL, dry-run/live validate, schedule, export | `/jobs` |
| **Materialize** | CREATE TABLE/VIEW in **customer** warehouse (opt-in, audited) | Jobs → Deploy |
| **Job Templates** | Gallery → one-click job create | `/templates` |
| **Transforms** | NL → SQL drafts with approve/apply HITL | `/proposals`, `/transforms` |
| **Orchestrator webhook** | Trigger Airflow/Dagster/your scheduler after Que runs | Settings → Automation |
| **Private runner** | Execute jobs on customer infra (HMAC work orders) | Settings → Automation |

### D. Monk Mode — industry autopilot

| Feature | What it does | Where |
|---------|--------------|-------|
| **Monk Mode** | Discover → Map → Clean → Build → Certify → Done | `/monk` |
| **Industry packs** | Ecommerce, Finance, Healthcare, Audit templates | `/marketplace`, Monk |
| **Autopilot** | Auto-promote (policy-gated) → golden eval → certify → deliverables | Monk certify phase |
| **Steward inbox** | Column profiling, entity mappings, certification queue | `/steward` |
| **Health scorecard** | 8-dimension workspace readiness | Workspace, autofill banners |

### E. Pack Studio & exports

| Feature | What it does | Where |
|---------|--------------|-------|
| **Pack Studio** | Blend packs (e.g. 60% ecommerce + 40% finance), column maps | `/pack-studio` |
| **Replication (v1)** | Postgres → `que_replica` scheduled pipelines | Pack Studio |
| **dbt / GitHub export** | Additive models layer from frozen contracts | Jobs |
| **Looker / Metabase export** | LookML snippets + dashboard JSON | Pack Studio, API |
| **Golden pair learning** | Learn joins from promoted pairs, job SQL, query history | Pack Studio |

### F. Metrics, BI & ship

| Feature | What it does | Where |
|---------|--------------|-------|
| **Metrics / KPI registry** | Semantic layer; Monk-seeded + manual; certification | `/metrics` |
| **Report Studio (BI)** | Bar, line, pie, KPI, table canvas; embed tokens | `/bi` |
| **Ship to BI** | Draft → approve → embed / rollback (CEO flow) | `/ship`, Chat |
| **Managed datasets (Offer B)** | Que-hosted job outputs; certify for BI (optional) | `/managed` |
| **Public embed** | Revocable chart embed URLs | `/embed/:token` |

### G. Governance & compliance

| Feature | What it does | Where |
|---------|--------------|-------|
| **Rules & org memory** | Workspace rules injected into AI; learn from Promote | `/rules` |
| **Proposals inbox** | Join proposals, mappings, transform diffs | `/proposals` |
| **Drift agent** | Propose drift fixes; re-freeze contracts | `/drift-agent` |
| **Validation suite** | Warehouse validation checks on jobs | `/validation` |
| **Compliance** | SOC2-style evidence scaffolding, ops checklist, Monk evidence | `/compliance` |
| **Audit log** | Who did what, when | Settings → Governance |
| **Eval harness** | Golden-set recall/precision; scheduled eval | `/eval` |

### H. Enterprise & settings

| Area | Capabilities |
|------|--------------|
| **Members & roles** | Owner, admin, member, viewer; invite flows |
| **Security** | SSO/OIDC, session management, sealed connection secrets |
| **Enterprise** | SCIM, API keys, CMK hooks, SIEM webhook, ABAC, break-glass |
| **AI Policy** | Que Agent toggle, samples policy, auto-promote, BYOK, model selection |
| **Billing** | Seat/plan scaffolding |

---

## Industry packs (Monk / Marketplace)

| Pack | Use case |
|------|----------|
| **Ecommerce v1** | Orders, customers, revenue, product catalog KPIs |
| **Finance v1** | GL, revenue recognition, staging marts (plan-only materialize) |
| **Healthcare v1** | HIPAA-strict policies; higher cert recall gates |
| **Audit v1** | Immutable Monk log; evidence-oriented workflows |

---

## Deployment (production)

| Layer | Provider | Notes |
|-------|----------|-------|
| UI | Vercel | Vite SPA, `VITE_STITCH_API_URL` |
| API | Render | Docker, `/health`, auto-migrate on boot |
| DB | Neon | Postgres + pgvector for RAG |

See `docs/DEPLOY-FREE.md` for env vars and smoke checklist.

---

# 2. Technical — Functionality & Outcomes

## Architecture (four layers)

```
L4 — SURFACE     Chat · Genie · Workspace · Jobs · BI · Monk UI · Steward
L3 — PACKS       Industry ontology · KPIs · jobs · dashboards · policies
L2 — ENGINE      Join infer · contracts · drift · materialize · replication
L1 — CONNECTORS  Postgres · Snowflake · Databricks · Mongo · Excel · SFDC …
```

## Key technical flows & outcomes

### Flow 1: Source → trusted schema graph

```
Connect source → sync schema_objects → infer joins (optional on sync)
→ HITL Promote in Join Review → accepted relationships in graph
```

**Outcome:** Documented, risk-tiered join graph usable by jobs and AI (schema-only context to LLM).

**Modules:** `connections.js`, `inferJoins.js`, `joinReviews.js`, `riskTiers.js`

---

### Flow 2: Job → contract → export / materialize

```
Create job (canvas, template, agent, or manual) → freeze contract + joins snapshot
→ dry-run / live validate → optional materialize (CTAS/VIEW in customer warehouse)
→ dbt/GitHub PR export (drift-gated)
```

**Outcome:** Repeatable, auditable pipeline artifact; writes stay in **customer** warehouse.

**Modules:** `jobs.js`, `jobRunner.js`, `materialize.js`, `contracts/contractFreeze.js`

**Gates:** `blockExportOnDrift`, `blockExportOnUnreviewedJoins`, `enableMaterialize`

---

### Flow 3: Monk Mode autopilot

```
Select pack → Discover (sources) → Map (entity↔table) → Clean (profiling issues)
→ Build (seed jobs + KPIs) → Certify (golden eval + autopilot promote)
→ Deliverables (dbt, BI export, replication seed, golden learn)
```

**Outcome:** Industry-fit workspace in hours vs. weeks; certification gate before "green" status.

**Modules:** `monkMode.js`, `monkAutopilot.js`, `monkDeliverables.js`, `packCertification.js`

**Policies:** `packPolicies.js` (HIPAA, min recall, noAutoMaterialize per pack)

---

### Flow 4: Que Agent (chat + genie)

```
NL message + pageContext → detectQueAgentIntent → tool plan
→ auto-execute: list_sources | infer_joins | draft_job | edit_job
   | materialize_job | scaffold_bi | draft_transform | validation | drift_fixes
→ HITL checkpoint only for join Promote (unless auto-promote policy on)
```

**Outcome:** Jobs, tables, and BI scaffolds from conversation; CEO gets plain summary, Engineer sees full plan.

**Modules:** `queAgentRuntime.js`, `agentSessions.js`, `chatEngine.js`, `certifiedBi.js`

**API:** `POST /workspaces/:id/chat`, `POST /workspaces/:id/que-agent/act`

---

### Flow 5: CEO live query (privacy model)

```
Data question → graph plan → read-only SELECT → execute in warehouse
→ rows returned to UI only (never in LLM prompt)
→ optional pinned scrubbed samples (5–10 rows) in AI context
```

**Outcome:** Grounded answers without shipping raw warehouse data to the model.

**Modules:** `chatLiveQuery.js`, `liveExec.js`, `pinnedSamples.js`

---

### Flow 6: BI scaffold & ship

```
Certified managed dataset → scaffoldBiReport (metrics + 6 chart types)
→ parseBiStyleFromPrompt (colors, chart types, axes from NL)
→ Run preview → Certify → embed token / Ship approve
```

**Outcome:** Report Studio pack without manual chart-by-chart setup.

**Modules:** `certifiedBi.js`, `shipToBi.js`, `managedDataPlane.js`

---

### Flow 7: External orchestration

| Mode | Mechanism | When to use |
|------|-----------|-------------|
| **Que scheduler** | In-process hourly/daily | Simple pilots |
| **Orchestrator webhook** | POST to Airflow/Dagster after job run | Enterprise owns schedule |
| **Private runner** | HMAC work order to customer URL | BYOC execution |

**Modules:** `scheduledJobs.js`, `orchestratorTrigger.js`, `privateRunner.js`

---

### Flow 8: Pack Studio & replication

```
Blend packs → column maps → save custom pack
→ Postgres replication pipeline → que_replica schema
→ export LookML / Metabase JSON
```

**Outcome:** Vertical customization without rewriting core packs.

**Modules:** `customPacks.js`, `packVariantMerger.js`, `connectionReplication.js`, `biPlatformExport.js`

---

## Data & security boundaries

| Rule | Implementation |
|------|----------------|
| Que does not store warehouse result rows | Live query → UI only; materialize metadata only |
| Managed dataset rows denied to AI | Schema-only in prompts |
| SQL guardrails | Single SELECT/WITH; no DDL in chat path |
| Connection secrets sealed | Workspace-scoped encryption |
| Attestation on exports | HMAC-signed schema-only attestations |

---

## Feature flags (admin — Settings → AI Policy)

| Flag | Default | Effect |
|------|---------|--------|
| `enableQueAgent` | **true** | Chat + Genie agent |
| `enableMaterialize` | true | CTAS/VIEW in customer warehouse |
| `enableAutoPromoteLowRisk` | false | Auto-promote Green joins only |
| `enableManagedDataPlane` | false | Offer B hosted datasets |
| `preferLlmChat` | false | Heuristic vs LLM chat |
| `blockExportOnDrift` | true | Block export on open high drift |

Full list: `api/src/workspaceSettings.js`

---

## API surface

- **Entry:** `api/src/index.js` (~6,500 lines)
- **Health:** `GET /health`
- **Workspace-scoped:** `/workspaces/:id/*` (chat, jobs, monk, pack-studio, bi, agent, …)

---

# 3. Testing — How We Verify Quality

> **Manual testing is primary** for client sign-off. See **`docs/MANUAL-TESTING-MASTER-2026.md`** for the full PASS/FAIL checklist (Que Agent, Genie, Monk, Pack Studio, jobs, BI). Automated tests below are the **pre-flight gate** before manual runs.

## Quick reference — run from `adc/schemagraph/api`

```bash
# Offline diligence (no server required)
npm run test:diligence

# Individual suites
npm run test:unit          # crypto, SQL guards, attestation helpers
npm run test:privacy       # schema-only privacy, LIMIT caps, scrub
npm run test:functional    # prod security, auth, CORS, attestation
npm run eval:joins         # join golden set precision/recall
npm run test:que-agent     # Que Agent intent + BI style parsing
npm run test:phase3        # dashboard templates + health scorecard
npm run test:phase4        # 4 vertical packs + policies
npm run test:phase5        # Monk autopilot gates + evidence export
npm run test:phase6        # Pack Studio blend/merge/mapping
npm run test:e2e-check     # Monk module smoke + manual Neon checklist
npm run test:smoke         # LIVE API against localhost:8787 (or QUE_API_BASE)

# Full offline + live
npm run test:all
```

## UI build check (from `adc/schemagraph`)

```bash
npm run build   # tsc + vite production build
```

## Playwright E2E (from repo root `schemagraph/`)

```bash
npm run test:e2e      # requires QUE_UI_BASE, QUE_API_BASE
npm run test:e2e:ui   # interactive mode
```

Config: `playwright.config.ts`, specs in `e2e/`

---

## Test matrix by concern

| Concern | Script(s) | Pass criteria (summary) |
|---------|-----------|-------------------------|
| **Join quality** | `eval:joins` | Precision ≥0.75, recall ≥0.70 on golden set |
| **Privacy / AI isolation** | `test:privacy` | Blocks writes/multi-stmt; LIMIT cap; no raw rows to AI |
| **Production security** | `test:functional` | Auth required in prod; secrets redacted; attestation verify |
| **Unit helpers** | `test:unit` | Crypto round-trip, SQL guards, join SQL extraction |
| **Que Agent** | `test:que-agent` | Intent detection for job/BI/edit/materialize |
| **Monk packs** | `test:phase4`, `test:phase5`, `test:phase6` | Pack policies, autopilot, blend, SportEdge mapping |
| **Templates & health** | `test:phase3` | CEO dashboard templates, 8-dim scorecard |
| **Live API smoke** | `test:smoke` | Health, login, schema, job run, chat, drift, RBAC |
| **Monk E2E checklist** | `test:e2e-check` | Module loads; prints prod manual steps |

---

## Manual test plans (human QA — **primary sign-off**)

> **Manual testing is the main gate** for pilots and production. Automated tests are pre-flight only.

| Doc | Audience | Covers |
|-----|----------|--------|
| **`MANUAL-TESTING-MASTER-2026.md`** | **QA / pilot / prod** | **Full checklist: Agent, Genie, Monk, Pack Studio, jobs, BI, governance** |
| `MANUAL_TEST_PLAN.md` | QA / pilot | Original paid-POC (auth, jobs, export) |
| `SMOKE-CEO.md` | Sales demo | Outcome, agent, ship, Slack |
| `TESTING_CLARITY.md` | Self-serve smoke | Account, invite, chat→jobs |
| `CEO-P0-OUTCOME-SHIP.md` | Engineering | Surface map, migrations, env |
| `CLIENT-ONBOARDING.md` | CS / onboarding | Production walkthrough |

---

## SportEdge / demo fixtures

```bash
npm run bootstrap:sportedge-all   # Postgres + Mongo + Databricks demo data
npm run fixtures:sportedge        # Generate fixture files
npm run seed:demo                 # Demo workspace with agent enabled
```

---

## Pre-production checklist

- [ ] Neon migrations applied (`042`–`047` Monk/Pack Studio)
- [ ] `QUE_SECRETS_KEY`, `QUE_ATTESTATION_HMAC_SECRET`, `QUE_CORS_ORIGINS` set on Render
- [ ] Vercel `VITE_STITCH_API_URL` points to Render API
- [ ] `npm run test:diligence` passes in CI
- [ ] `npm run test:smoke` against deployed API URL
- [ ] Manual: Monk autopilot cert on SportEdge Postgres → CEO chat revenue → Genie create job

---

## What tests do NOT cover yet

| Gap | Mitigation |
|-----|------------|
| Full prod Neon E2E (deployed) | Manual checklist in `runMonkE2ECheck.js` |
| Multi-source Monk (Postgres + Salesforce) | Roadmap |
| Full Fivetran-parity replication | v1 Postgres only |
| SOC 2 / pen test | External audit required |
| Load / scale testing | Not in current suite |

---

# 4. Strategy — How to Be Better vs. Alternatives

## Where Que wins today

| vs. Category | Que advantage | Example proof point |
|--------------|---------------|---------------------|
| **Generic BI (Looker, Metabase, Tableau)** | Schema intelligence + join inference **before** dashboards | Monk cert → BI scaffold in one session |
| **dbt alone** | Discovery + HITL joins + NL agent **upstream** of models | Workspace graph → job → dbt export |
| **Chat-on-SQL tools** | Rows never enter LLM; contract freeze + drift gates | CEO chat + privacy tests |
| **Catalog tools (Atlan, Collibra)** | **Does** the work (jobs, fixes), not just documents | Monk autopilot + steward inbox |
| **Fivetran/Airbyte (ELT)** | Semantic + join + quality layer on **existing** sources | Not replacing EL; complementing |
| **Monte Carlo/Soda (DQ)** | DQ wired into join/job/cert loop, not separate SKU | Golden eval gates auto-promote |

**Moat:** Certified onboarding loop — **connect → Monk → certify → Pack Studio → export to dbt/Looker/Metabase** with audit trail.

---

## Honest comparison matrix

| Capability | Que | Fivetran | dbt | Looker | Atlan | Cursor-style SQL chat |
|------------|-----|----------|-----|--------|-------|----------------------|
| Connector breadth | 8 types | 500+ | N/A | N/A | Metadata | Via user DB |
| Schema graph + join infer | **Strong** | Weak | Weak | Weak | Medium | Weak |
| HITL join Promote | **Yes** | No | No | No | Workflow | No |
| NL → job + materialize | **Yes (Genie)** | No | No | No | No | Partial |
| Industry pack autopilot | **Yes (Monk)** | No | Packages | No | No | No |
| Contract + drift gates | **Yes** | No | Tests | No | Lineage | No |
| BI authoring | Report Studio | No | No | **Strong** | No | No |
| Warehouse execution | Customer + optional runner | Customer | Customer | Customer | N/A | Customer |
| SOC 2 Type II | Scaffolding only | Yes | Yes | Yes | Yes | Varies |

---

## Gaps to close (priority order)

### P0 — Credibility for paid pilots

1. **Live prod E2E script** — SportEdge on Neon: Monk cert → CEO revenue chat → Genie job (automate `runMonkE2ECheck` against `QUE_API_BASE` prod)
2. **SSE Monk events** — Replace polling; pause/resume/skip in Monk UI
3. **Transform approve flow** — Fix copilot + apply transform end-to-end in Clean phase

### P1 — Competitive parity

4. **More connectors** — Salesforce sync depth, BigQuery live validate
5. **Replication v2** — Snowflake/Databricks replica (not just Postgres `que_replica`)
6. **Page autofill everywhere** — Today: Workspace + BI only; extend to Jobs, Joins, Steward
7. **Native Airflow operator** — Today: webhook only; publish `@que` operator or DAG template

### P2 — Category leadership

8. **Multi-source Monk** — Postgres + Salesforce in one cert run
9. **Proof datasets** — Finance/healthcare beyond templates (real anonymized packs)
10. **Realtime collab** — Beyond heartbeat presence (CRDT / live cursors)
11. **Marketplace density** — 10+ packs vs. current 4 core verticals

---

## GTM positioning (use vs. avoid)

### Say

- *"One steward with Que replaces the discovery, join, and pipeline setup work of a small data team."*
- *"Industry Monk Mode: pick Ecommerce or Finance, approve at gates, ship certified KPIs and BI."*
- *"Your warehouse, your orchestrator — Que drafts and certifies; Airflow runs production."*
- *"CEO asks in English; Engineer sees SQL and agent plans — same Que Agent."*

### Avoid until shipped

- *"Zero data engineers"*
- *"Replaces Fivetran / Looker / dbt"*
- *"Fully autonomous with no approval"*
- *"SOC 2 certified"* (say *"SOC 2 evidence scaffolding"*)

---

## Distribution playbook

```
PLG demo → Monk Mode (15 min) → Pack Studio customize → Export to their stack
                ↓
        Design partner per vertical (1 steward customer)
                ↓
        Case study: time-to-first-KPI + cert recall score
```

**Pricing anchor:** Seat + workspace tier; upsell managed plane, enterprise SSO, private runner.

---

## 90-day "be better" scorecard

| Metric | Target | How to measure |
|--------|--------|----------------|
| Time to first certified KPI | < 4 hours | Monk event timestamps |
| Join golden recall | ≥ 0.90 | `/eval` dashboard |
| Pilot → paid conversion | 3 design partners | CRM |
| Prod smoke green | 100% weekly | CI `test:smoke` on prod URL |
| Agent task success rate | ≥ 80% job/BI requests | Agent session `completed` vs `failed` |

---

## Related docs

| Document | Path |
|----------|------|
| Master plan | `docs/product/Que-Master-Plan-10x-Monk-Mode.md` |
| Gaps honest assessment | `docs/GAPS-CLOSED-AND-REMAINING.md` |
| Deploy guide | `docs/DEPLOY-FREE.md` |
| Full product manual (HTML) | `docs/Que-Complete-Product-Manual.html` |
| Testing clarity | `docs/TESTING_CLARITY.md` |

---

*Generated August 2026 — aligns with commit `ed8b4f9` (Que Agent + Genie). Update after major releases.*
