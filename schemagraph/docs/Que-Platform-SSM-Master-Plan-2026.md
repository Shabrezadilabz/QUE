# Que Platform Master Plan — Dual SSM + Warehouse-Native Stack (2026)

**Version:** 1.0  
**Date:** August 2026  
**Status:** Phase 3 north star (post S1–S12 competitive sprint exit)  
**Owner:** Product / Engineering  
**Repo:** `adc/schemagraph`

---

## Executive summary

Que becomes a **workspace-scoped data platform** under one login with **six modules** (Load · Model · Studio · Catalog · Pipes · Observe) — not one crowded page.

Two systems both named **SSM** power intelligence:

| SSM | Meaning | Role |
|-----|---------|------|
| **SSM-A** | **Schema Context Service** | Builds the **perfect structured context pack** for every LLM call (tables, 5–10 samples, join graph, paths, intent). |
| **SSM-B** | **State-Space Model** | Sequence processor over workspace events (sync → Monk → job → cert → query) with **linear memory** — routes intent, ranks tables/joins, compresses long workspace history for the LLM. |

**Execution rule (non-negotiable):** LLM **plans**; **Que Warehouse executes**. Row payloads never enter LLM or SSM-B hidden state as raw text dumps.

**Data rule:** Default for production workspaces = **full raw replicate** into Que Warehouse per connector sync. Sandbox/dev may use samples-only.

**BI rule:** **Full Looker + Power BI class authoring** in **Que BI Studio** — not export-only. Export remains for coexistence.

**Orchestration rule:** Jobs run on **Que Warehouse Worker instances** (per workspace pool), with Airflow/Kestra export optional.

**Phase map:** This program uses **Phase 1–5** (implementation checklist) aligned to **P3.1–P3.6** (release trains). See [Full architecture](#full-system-architecture) and [Phase 1–5 implementation plan](#phase-15--implementation-plan-dont-miss-anything).

---

## Vision (one sentence)

**Login → workspace → connectors load into your warehouse → Monk certifies → dual-SSM powers Chat/Genie → every answer and chart runs on warehouse SQL — Load, Model, and Studio in one platform.**

---

## Platform modules (one login, separate apps)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Que Platform Shell — SSO · workspace switcher · billing · audit · settings │
├─────────┬─────────┬──────────┬───────────┬─────────┬──────────┬───────────┤
│ Que Load│Que Model│Que Studio│Que Catalog│Que Pipes│Que Observe│ Que Core │
│  /load  │ /model  │ /studio  │ /catalog  │ /pipes  │ /observe  │/workspace│
└─────────┴─────────┴──────────┴───────────┴─────────┴──────────┴───────────┘
                              │
                    Que Warehouse (per workspace)
                    raw · staging · marts · job outputs
```

| Module | Route prefix | Competes with | Primary outcome |
|--------|--------------|---------------|-----------------|
| **Que Load** | `/load` | Fivetran, Hevo, Airbyte, Stitch | Connectors, **full raw replicate**, sync runs, SLA |
| **Que Model** | `/model` | dbt Labs | SQL models, tests, lineage, semantic metrics |
| **Que BI Studio** | `/studio` | Looker, Power BI, Sigma | Full authoring, explores, dashboards, embed |
| **Que Catalog** | `/catalog` | Atlan, Collibra | Assets, glossary, policies, contracts |
| **Que Pipes** | `/pipes` | Weld | NL → pipeline with HITL |
| **Que Observe** | `/observe` | Monte Carlo | Monitors, drift, golden eval, incidents |
| **Que Core** | `/workspace`, `/joins`, `/monk` | — | Graph, joins, Monk, cert loop (moat) |

---

## Full system architecture

### Layer diagram (how the whole platform looks)

```
                         ┌─────────────────────────────────────────┐
                         │           USER BROWSER (Vercel)          │
                         │  Platform Shell + 6 Module Apps + Core   │
                         └────────────────────┬────────────────────┘
                                              │ HTTPS / SSE
                         ┌────────────────────▼────────────────────┐
                         │              QUE API (Render)              │
                         │  auth · workspaces · routes · audit       │
                         ├─────────────────────────────────────────┤
                         │  SSM-A Schema Context Service            │
                         │  SSM-B State-Space Router (lite → ML)    │
                         │  LLM Gateway (plan only — no row ingest) │
                         │  SQL Validator · Job Scheduler             │
                         └───────┬─────────────────────┬─────────────┘
                                 │                     │
              ┌──────────────────▼──────┐    ┌─────────▼──────────────┐
              │   METADATA DB (Neon)     │    │  WAREHOUSE WORKER POOL │
              │   graph · joins · jobs   │    │  que-worker Docker     │
              │   metrics · boards · ACL   │    │  sync · SQL · refresh  │
              │   schema_migrations      │    └─────────┬──────────────┘
              └──────────────────────────┘              │
                                 ┌──────────────────────▼──────────────────────┐
                                 │     QUE WAREHOUSE (per workspace)          │
                                 │     wh_{workspace_id}                      │
                                 │  raw.* · staging.* · mart.* · job_*        │
                                 └──────────────────────┬──────────────────────┘
                                                        │
              ┌─────────────────────────────────────────▼─────────────────────┐
              │  EXTERNAL SOURCES (connectors)                               │
              │  Postgres · Shopify · Salesforce · Razorpay · Mongo · …      │
              └─────────────────────────────────────────────────────────────┘
```

### Module → layer mapping

| Layer | Modules | Storage |
|-------|---------|---------|
| **Ingest** | Que Load | `raw.*` in Que Warehouse |
| **Transform** | Que Model, Que Core (jobs) | `staging.*`, `mart.*` |
| **Intelligence** | Que Core (Monk), Que Pipes, SSM-A/B | Metadata DB |
| **Presentation** | Que BI Studio | Board specs in Metadata; **data from Warehouse** |
| **Governance** | Que Catalog, Que Observe | Metadata DB + `_meta.table_stats` |
| **Execution** | Worker pool | Que Warehouse only |

### Data flow (sync → Monk → AI → BI)

```
┌──────────┐    full replicate     ┌─────────────────┐
│ Connector│ ────────────────────▶ │ raw.{conn}.{tbl}│
└──────────┘                       └────────┬────────┘
                                            │
                     redirect /workspace    │
                                            ▼
                                   ┌────────────────┐
                                   │ Monk Modal     │
                                   │ infer joins    │
                                   │ propose jobs   │
                                   └────────┬───────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              ▼                             ▼                             ▼
       ┌─────────────┐               ┌─────────────┐               ┌─────────────┐
       │ Metadata DB│               │ staging.*   │               │ Studio board│
       │ graph/joins│               │ mart.*      │               │ (SQL specs) │
       └──────┬──────┘               └──────┬──────┘               └──────┬──────┘
              │                             │                             │
              └──────────────┬──────────────┴──────────────┬──────────────┘
                             ▼                             ▼
                    ┌─────────────────┐           ┌─────────────────┐
                    │ SSM-B (intent)  │           │ Worker executes │
                    │ SSM-A (context) │           │ SQL on WH       │
                    └────────┬────────┘           └────────┬────────┘
                             ▼                             │
                    ┌─────────────────┐                    │
                    │ LLM → SQL/spec  │────────────────────┘
                    │ (no row data)   │                    │
                    └────────┬────────┘                    ▼
                             │                    ┌─────────────────┐
                             └───────────────────▶│ UI: grid/chart  │
                                                  │ metric value    │
                                                  └─────────────────┘
```

### AI request flow (dual SSM — detailed)

```
User question / Genie job / Studio "AI build"
        │
        ▼
┌───────────────────┐
│ SSM-B             │  Read workspace event log (last N events)
│ State-Space Model │  Output: intent, focusTables[], joinPathRank[]
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ SSM-A             │  Build pack for focusTables only:
│ Schema Context    │  • tables + columns + types
│ Service           │  • 5–10 scrubbed samples EACH table (mandatory)
└─────────┬─────────┘  • joinGraph JSON + Mermaid
          │            • joinPaths for multi-table
          │            • warehouseMap (physical vs metadata)
          ▼
┌───────────────────┐
│ LLM               │  System: "ONLY use contextPack"
│ (plan mode)       │  Output: sql | job_spec | board_spec | metric_def
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Validator         │  Allow-list tables/columns from pack
│ chatSqlGuard      │  Block WRITE unless job/materialize path
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ [▶ Run in WH]     │  Worker → Que Warehouse
│ liveExec / worker │  Results → UI ONLY (never back to LLM)
└───────────────────┘
```

### Deployment topology

```
┌──────────────── Vercel (UI) ─────────────────┐
│ schemagraph/ · VITE_STITCH_API_URL           │
│ Routes: /load /model /studio /catalog …     │
└────────────────────┬─────────────────────────┘
                     │
┌────────────────────▼─────────────────────────┐
│ Render — Que API                               │
│ schemagraph/api · Docker                       │
│ DATABASE_URL → Metadata Neon                   │
│ QUE_WAREHOUSE_URL → Warehouse Neon (or same)   │
└────────────┬───────────────────┬─────────────────┘
             │                   │
    ┌────────▼────────┐   ┌──────▼──────────────────┐
    │ Neon — Metadata │   │ Neon / dedicated — WH     │
    │ pgvector · ACL  │   │ wh_{workspace_id} schemas │
    └─────────────────┘   └───────────┬─────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │ que-worker pool   │
                              │ (Render / K8s)    │
                              └───────────────────┘
```

### UI shell (one login — separate module pages)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ QUE  [Workspace ▼]  Load │ Model │ Studio │ Catalog │ Pipes │ Observe │ ⚙ │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─ Active module renders full-page (NOT tabs inside /workspace) ─────┐  │
│   │                                                                     │  │
│   │  /load      → connector list · sync runs · replicate toggle        │  │
│   │  /model     → SQL IDE · tests · lineage · dbt export               │  │
│   │  /studio    → explores · dashboards · grid · embed                 │  │
│   │  /workspace → schema graph (Core) · Monk entry                     │  │
│   │  /joins     → Review │ Discussion │ Duplicates                     │  │
│   │  /chat      → CEO/engineer chat · Run in WH                        │  │
│   │                                                                             │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│   Post-sync modal (overlay on /workspace):                                 │
│   ┌──────────────────────────────────────────────┐                         │
│   │  New connector synced! Run Monk Mode?        │                         │
│   │  [Run Monk]  [Later]                         │                         │
│   └──────────────────────────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1–5 — implementation plan (don't miss anything)

**Total horizon:** ~24–32 weeks sequential; **10–12 weeks** to first demo with parallel tracks.  
**Maps to release trains:** Phase 1 ≈ P3.1 · Phase 2 ≈ P3.1–P3.2 · Phase 3 ≈ P3.2 · Phase 4 ≈ P3.4–P3.5 · Phase 5 ≈ P3.3 + P3.5

---

### Phase 1 — Warehouse-first workspace (4–6 weeks)

**Theme:** Foundation for everything — isolated row store per workspace.

| # | Work | Delivers | Code / route |
|---|------|----------|--------------|
| **1.1** | `que_warehouse` schema per workspace (Neon schema or dedicated DB) | Isolated row store | `api/src/queWarehouse.js`, migration `048_que_warehouse.sql` |
| **1.2** | Connector sync → `raw.{connector}.{table}` in warehouse | Full pull option (default ON prod) | Extend `connections.js` sync + `connectionReplication.js` |
| **1.3** | Post-sync redirect → `/workspace?synced={connectionId}` | Your flow step 1 | UI `SourcesPage` / Load module + router |
| **1.4** | Per-connector Monk modal (persist `monk_prompt_dismissed` per connection) | Jobs / metrics / BI prompt | `MonkPromptModal.tsx`, `workspace_settings` or `connections` JSON |
| **1.5** | Warehouse connection object in workspace settings | Session to WH for exec | `settings.warehouseConnection`, `liveExec.js` target resolver |

**Phase 1 exit criteria:**

- [ ] New workspace auto-provisions `wh_{id}` schema
- [ ] Sync lands ≥1 table in `raw.*`
- [ ] User redirected to graph after sync
- [ ] Monk modal shows once per new connector
- [ ] API can execute read SQL against workspace warehouse

**Release train:** **P3.1** (weeks 1–6)

---

### Phase 2 — SSM + unified AI context (4–5 weeks)

**Theme:** Chat + Genie + jobs use the same brain (SSM-A + SSM-B lite).

| # | Work | Delivers | Code / route |
|---|------|----------|--------------|
| **2.1** | `buildUnifiedContextPack(workspaceId, intent)` | One pack for all AI surfaces | `api/src/ssm/schemaContextService.js` |
| **2.2** | Mandatory 5–10 samples per table (scrubbed) | Compulsory rule | Extend `pinnedSamples.js` + sync samples; fail pack if &lt;5 |
| **2.3** | Graph JSON for joins (Mermaid + structured edges) | Multi-table questions | Extend `chatGraphContext.js` → export `joinGraph` + `mermaid` |
| **2.4** | Wire Genie job create/edit to same pack | No separate Genie context | `queAgentRuntime.js`, `monkAgent.js`, `chatEngine.js` |
| **2.5** | Strict LLM system prompt + table allow-list validation | No invented tables | `chatSqlGuard.js` + shared `validateAgainstContextPack()` |

**SSM-B lite (same phase):**

| # | Work | Delivers |
|---|------|----------|
| **2.6** | `ssmRouter.js` — intent + focus table selection from event log | SSM-B v0 heuristic |
| **2.7** | `workspace_event_log` table + emit on sync/Monk/job/cert | Event stream for SSM-B |

**Phase 2 exit criteria:**

- [ ] Chat, Genie, and job draft all call `buildUnifiedContextPack`
- [ ] Every table in pack has ≥5 scrubbed samples
- [ ] Multi-table question includes `joinPaths[]` + Mermaid
- [ ] LLM cannot reference tables not in pack (validator blocks)

**Release train:** **P3.1 end → P3.2 start** (weeks 5–10)

---

### Phase 3 — Execution UX (3–4 weeks)

**Theme:** “Run in warehouse” everywhere — no LLM data mixup.

| # | Work | Delivers | Code / route |
|---|------|----------|--------------|
| **3.1** | **▶ Run in Que Warehouse** on chat SQL, jobs, transforms | Your icon | `RunInWarehouseButton.tsx`, API `POST /warehouse/execute` |
| **3.2** | Job results only from executor logs | No LLM mixup | `jobRunner.js` → worker logs; UI reads log endpoint only |
| **3.3** | Materialize job output → warehouse table → graph updates | Closed loop | `materialize.js` + register in `schema_objects` |
| **3.4** | Export still available (dbt, Airflow) | No lock-in | Existing `dbtBundle.js`, `orchestratorRecipes.js` |

**Phase 3 exit criteria:**

- [ ] Every AI-generated SQL has Run button before user trusts result
- [ ] Job run never passes row payloads through LLM
- [ ] Materialized tables appear on workspace graph

**Release train:** **P3.2** (weeks 7–11)

---

### Phase 4 — BI + metrics on warehouse (6–10 weeks)

**Theme:** Full Looker / Power BI class path — real charts from warehouse SQL.

| # | Work | Delivers | Code / route |
|---|------|----------|--------------|
| **4.1** | Every Report Studio widget = stored SQL + warehouse run | Real charts | `studio/` module, widget model + `executeWidgetSql()` |
| **4.2** | Metric hover/click → live value animation | Your UX idea | `MetricLiveValue.tsx`, `POST /metrics/:id/preview` |
| **4.3** | Session cache for metric/chart queries (30–120s) | Performance | Redis or in-memory session keyed by workspace+widget |
| **4.4** | RS v3: filters, drill, layouts (toward Looker/Sigma) | BI depth | `/studio/boards/:id` canvas v2 |
| **4.5** | Power BI / Looker export from live boards | Incumbent coexistence | Extend `biPlatformExport.js` from live widget SQL |

**Phase 4 exit criteria:**

- [ ] Studio board renders from warehouse — zero mock data
- [ ] Metric card animates value on hover
- [ ] 5-chart exec board from certified mart in &lt;30 min
- [ ] Export LookML + PBI template from same board

**Release train:** **P3.4 → P3.5** (weeks 10–20)

---

### Phase 5 — Load + quality + orchestrator (6–8 weeks)

**Theme:** ETL completeness — Fivetran-class UX + warehouse workers.

| # | Work | Delivers | Code / route |
|---|------|----------|--------------|
| **5.1** | Que Load app: pipelines, runs, SLA | Fivetran/Hevo UX | `/load`, `/load/pipelines`, `/load/runs` |
| **5.2** | Duplicates tab on `/joins` | Your overview | `duplicateProfile.js`, `/joins?tab=duplicates` |
| **5.3** | Que job orchestrator on warehouse worker | Scheduled ETL | `que-worker` Docker, `warehouseWorker.js`, queue |
| **5.4** | Connector growth roadmap (20 → 50 → partner 500+) | Honest scale | `connectorLongTail.js` + partner doc |

**Phase 5 exit criteria:**

- [ ] `/load` shows pipeline list + run history + SLA badges
- [ ] Duplicates tab shows dup % per table
- [ ] Scheduled jobs run on worker against WH
- [ ] Connector matrix updated with growth milestones

**Release train:** **P3.3 + P3.5 overlap** (weeks 8–18)

---

## Phase 1–5 ↔ P3 release train (master timeline)

```
Week:  1    4    6    8   10   12   14   16   18   20   24
       │────│────│────│────│────│────│────│────│────│────│
Phase1 ████████                                      Warehouse + modal
Phase2       ██████████                              Dual SSM + unified pack
Phase3             ████████                          Run in WH + materialize
Phase4                   ████████████████████        BI Studio + metrics UX
Phase5             ████████████████                  Load app + worker + dups
       │──── P3.1 ────│── P3.2 ──│── P3.3 ──│── P3.4 ──│── P3.5 ──│ P3.6 │
```

| Release train | Phases included | Weeks | Ship tag |
|---------------|-----------------|-------|----------|
| **P3.1** | Phase 1 + Phase 2 start | 1–6 | `warehouse-native-v1` |
| **P3.2** | Phase 2 complete + Phase 3 | 5–11 | `dual-ssm-v1` |
| **P3.3** | Phase 5 (Load + worker) | 8–14 | `que-load-v1` |
| **P3.4** | Phase 4 start (Studio core) | 10–16 | `studio-v1` |
| **P3.5** | Phase 4 complete + Phase 5 polish | 14–20 | `studio-v2` |
| **P3.6** | SSM-B ML + BI v3 + access groups | 18–24 | `platform-v1` |

---

## Canonical user journey

### 1. Workspace + warehouse provisioning

```
POST /workspaces → creates:
  - workspace_id
  - que_warehouse schema (or dedicated DB)  → wh_{workspace_id}
  - warehouse_connection credentials (internal)
  - metadata graph (empty)
```

### 2. Add connector + full pull

```
/load/connectors/new → OAuth / credentials
  → User enables: "Replicate all tables to Que Warehouse" (DEFAULT ON for prod tier)
  → Sync: Extract → Load → raw.{connector_slug}.{table}
  → On success: redirect → /workspace?synced={connectionId}
```

### 3. Monk modal (per new connector)

```
Modal (once per connection until dismissed):
  "Run Monk Mode to generate jobs, metrics, BI boards, and pack templates?"
  [Run Monk] [Later]

Run Monk → infer joins → propose jobs → seed metrics → scaffold Studio boards
```

### 4. AI surfaces (Chat, Genie, Pipes)

```
User message or job request
  → SSM-B: classify intent + compress workspace event sequence
  → SSM-A: build Context Pack (mandatory samples + join graph + warehouse table map)
  → LLM: structured output (sql | job_spec | board_spec | metric_def)
  → Validator: allow-list tables/columns from pack only
  → Executor: run on Que Warehouse
  → UI: grid / job result / chart / metric value (never back to LLM as rows)
```

### 5. Run in warehouse (everywhere)

```
[▶ Run in Que Warehouse] on:
  - Chat SQL proposals
  - Genie job drafts
  - Model preview
  - Studio widget preview
  - Metric hover/click
```

### 6. Joins — Duplicates tab

```
/joins?tab=duplicates
  → Profile duplicate keys, row dup rate, null rate per synced table
  → Link to Monk fix proposals / steward inbox
```

---

## Dual SSM architecture

### SSM-A — Schema Context Service

**Purpose:** Give the LLM **perfect, bounded, workspace-truth** context every turn.

**API:** `buildSchemaContextServicePack(workspaceId, opts)`

| Pack section | Content | Mandatory |
|--------------|---------|-----------|
| `tables[]` | name, connection, columns[], types, keys | ✅ |
| `samples[]` | **5–10 scrubbed rows per table** (pinned + sync sample) | ✅ |
| `joinGraph` | nodes (tables), edges (Monk + promoted joins), confidence | ✅ |
| `joinPaths[]` | BFS paths for multi-table questions | ✅ when ≥2 tables |
| `warehouseMap` | which tables exist as physical raw/mart in WH | ✅ |
| `certScope` | certified tables/metrics only (CEO mode) | policy |
| `intent` | question \| create_job \| edit_job \| create_table \| studio_board \| metric | ✅ |
| `mermaid` | optional diagram string for LLM readability | ✅ |
| `rules` | workspace org rules pack | if enabled |

**Consumers:** Chat, Genie, Que Pipes, Studio “AI build”, Model “AI draft”, metric wizard.

**Existing code to extend:** `schemaContext.js`, `chatGraphContext.js`, `pinnedSamples.js`, `workspaceRules.js`.

**System prompt anchor:**

> You may ONLY use tables, columns, and joins in `contextPack`. Do not invent objects. Output executable SQL or JSON specs. Never fabricate row values.

---

### SSM-B — State-Space Model (sequence processor)

**Purpose:** Process **workspace event sequences** with fixed hidden state — linear scaling vs stuffing full history into transformer context.

**Event stream (append-only per workspace):**

```
connector_added → sync_completed → monk_started → join_inferred → join_promoted
→ job_created → job_run_completed → dataset_certified → chat_query → board_published
```

**SSM-B responsibilities:**

| Function | Description |
|----------|-------------|
| **Intent routing** | Chat vs job vs BI vs metric vs duplicate fix |
| **Focus table selection** | Which tables to include in SSM-A pack (top-k from graph) |
| **Join path ranking** | Which Monk paths matter for this question |
| **History compression** | Hidden state summarizes last N events → fed to LLM as `workspaceStateSummary` (no raw rows) |
| **Drift awareness** | Boost recent schema change events in state |

**Implementation phases:**

| Phase | Approach |
|-------|----------|
| **P3.1** | Rule + graph heuristic “SSM-B lite” (`ssmRouter.js`) — ship fast |
| **P3.2** | Train/distill small SSM (Mamba/Hyena-class or API fine-tune) on synthetic workspace traces |
| **P3.3** | On-device or hosted SSM endpoint for intent + table focus |

**Existing code to extend:** `monkEventsStream.js`, `planeActivity.js`, `agentSessions.js`, `chatEngine.js`.

**Boundary:** SSM-B never receives row payloads — only event types, table names, job ids, metric ids.

---

## Que Warehouse (per workspace)

### Layout

```sql
-- schema: wh_{workspace_id}
raw.{connector_slug}.{table}     -- full replicate (default)
staging.{name}                   -- Monk/model staging
mart.{name}                      -- certified marts
job_{job_id}_{run_id}            -- materialized job outputs
_meta.sync_watermarks            -- CDC cursors
_meta.table_stats                -- row counts, dup profiles
```

### Full raw replicate (default)

| Tier | Replicate | Use case |
|------|-----------|----------|
| **Production** | **ALL tables** user selects (default all) | Live AI + BI + jobs |
| **Sandbox** | Samples-only or capped rows | Demo / eval |
| **Enterprise** | ALL + retention policy + CMK | Paid |

**Infra:** Start Neon Postgres per tenant schema; scale to dedicated warehouse (ClickHouse/DuckDB/Postgres) per workspace pool.

**Existing code:** `managedDataPlane.js`, `connectionReplication.js`, `replicationV2.js` → unify under `queWarehouse.js`.

---

## Que BI Studio — full Looker / Power BI scope

**Goal:** User thinks “I don’t need Looker/Power BI” for **authoring** — export remains for legacy stacks.

### Feature parity checklist (program, not single sprint)

#### Looker-class

| Feature | Priority | Phase |
|---------|----------|-------|
| Semantic layer / explores | P0 | P3.4 |
| LookML-like dimension/measure YAML (QueML) | P0 | P3.4 |
| Dashboard builder (drag-drop) | P0 | P3.3 |
| Filters + cross-filters | P0 | P3.4 |
| Drill to row / drill to SQL | P0 | P3.4 |
| Parameters | P1 | P3.5 |
| Scheduled refresh | P1 | P3.5 |
| Embed SDK + white-label | P1 | exists → extend |
| Access groups / field-level | P1 | P3.6 |
| LookML export + merge kit | P1 | exists |

#### Power BI-class

| Feature | Priority | Phase |
|---------|----------|-------|
| Report canvas (pages, visuals) | P0 | P3.4 |
| DAX-like calc column/measures (QueExpr) | P1 | P3.5 |
| PBIX template export | P1 | exists partial |
| Power BI embed path | P1 | P3.5 |
| Mobile layout | P2 | P3.7 |

#### Sigma-class (spreadsheet on warehouse)

| Feature | Priority | Phase |
|---------|----------|-------|
| Grid explore on live SQL | P0 | P3.5 |
| Formula bar → warehouse SQL | P0 | P3.5 |

#### Universal BI rules

- Every visual = **stored SQL** + **warehouse execution**
- LLM builds **structure + SQL**; Studio renders after run
- Metric cards: **hover/click → animate value** from warehouse (session cache 30–120s)
- Cert badge hides board if golden eval fails

**Existing code:** `BiChartsPage.tsx`, `certifiedBi.js`, `biPlatformExport.js`, `reportStudioEmbed.js`, `dashboardTemplates.js`.

---

## Orchestrator on warehouse instances

### Architecture

```
┌─────────────────┐     ┌──────────────────────────────┐
│ Que API         │────▶│ Warehouse Worker Pool        │
│ job schedules   │     │ (per region / per workspace) │
│ monk triggers   │     │ - run SQL jobs               │
└─────────────────┘     │ - sync replicate           │
                        │ - Studio refresh           │
                        │ - metric precompute        │
                        └──────────────────────────────┘
                                      │
                        ┌─────────────▼──────────────┐
                        │ Que Warehouse (workspace)  │
                        └────────────────────────────┘
```

| Component | Description |
|-----------|-------------|
| **que-worker** | Docker image: SQL executor, sync agent, resource limits |
| **Scheduler** | `scheduledJobs.js` → dispatches to worker queue |
| **Isolation** | One workspace cannot read another’s WH credentials |
| **Scale** | Free: shared worker; Paid: dedicated worker instance |
| **Export** | Airflow/Kestra DAG generation optional (`orchestratorRecipes.js`) |

**Existing code:** `privateRunner.js`, `jobRunner.js`, `scheduledJobs.js`, `orchestratorRecipes.js`.

---

## Duplicates tab (`/joins`)

| View | Metrics |
|------|---------|
| Per table | duplicate row %, duplicate key %, null % |
| Cross-table | join key overlap, orphan FK rate |
| Actions | link to Monk fix · create dedupe job · steward task |

**Existing code:** `columnProfiling.js`, `joinReviews.js` → new `duplicateProfile.js`.

---

## Implementation roadmap (parallel tracks)

**Horizon:** 18–24 months for full BI parity; **first demoable slice in 10–12 weeks** (Phase 1 + 2 + 3.1).

> **Canonical checklist:** [Phase 1–5](#phase-15--implementation-plan-dont-miss-anything) above.  
> Below tracks are the **same work** organized for parallel engineering squads.

### Track A — Foundation (weeks 1–6)

| ID | Deliverable | Module |
|----|-------------|--------|
| A1 | `queWarehouse.js` — provision schema per workspace | Core |
| A2 | Full replicate sync → `raw.*` tables | Load |
| A3 | Post-sync redirect + Monk modal | Core |
| A4 | SSM-A unified pack API | Core |
| A5 | SSM-B lite router (heuristic) | Core |
| A6 | Wire Chat + Genie to SSM-A + SSM-B | Pipes |
| A7 | [▶ Run in Warehouse] button component | Core |
| A8 | Platform shell nav (6 modules) | Shell |

### Track B — Execution + Model (weeks 5–10)

| ID | Deliverable | Module |
|----|-------------|--------|
| B1 | Job executor on warehouse worker v1 | Load/Model |
| B2 | Que Model IDE `/model` | Model |
| B3 | Model runs + lineage graph | Model |
| B4 | dbt export sync from Model | Model |
| B5 | Duplicates tab | Core |

### Track C — BI Studio (weeks 8–20, parallel)

| ID | Deliverable | Module |
|----|-------------|--------|
| C1 | Studio shell `/studio` separate from workspace | Studio |
| C2 | Dashboard canvas v1 (widgets + SQL binding) | Studio |
| C3 | Explore builder (semantic picks) | Studio |
| C4 | Widget SQL → warehouse → chart render | Studio |
| C5 | Metric hover live values | Studio |
| C6 | QueML semantic YAML layer | Studio |
| C7 | Sigma grid mode | Studio |
| C8 | Power BI + Looker export from live boards | Studio |
| C9 | Embed + scheduled refresh | Studio |

### Track D — Load + orchestrator (weeks 6–14)

| ID | Deliverable | Module |
|----|-------------|--------|
| D1 | Que Load app `/load` — pipelines + runs UI | Load |
| D2 | Warehouse worker Docker + queue | Core |
| D3 | Per-workspace worker routing | Core |
| D4 | Connector growth: 20 → 35 live | Load |
| D5 | Airbyte webhook / partner long tail doc | Load |

### Track E — SSM-B ML (weeks 12–24)

| ID | Deliverable | Module |
|----|-------------|--------|
| E1 | Event log schema for workspace sequences | Core |
| E2 | Synthetic trace generator for training | Core |
| E3 | SSM-B v1 model deployment (intent + focus) | Core |
| E4 | A/B: heuristic vs SSM-B routing quality | Core |

---

## Sprint-style phases (summary)

| Phase | Weeks | Theme | Maps to | Exit criteria |
|-------|-------|-------|---------|---------------|
| **Phase 1** | 1–6 | Warehouse-first workspace | P3.1 | Raw replicate, redirect, Monk modal |
| **Phase 2** | 5–10 | SSM-A + SSM-B + unified pack | P3.1–P3.2 | All AI surfaces same context |
| **Phase 3** | 7–11 | Execution UX | P3.2 | Run in WH everywhere |
| **Phase 4** | 10–20 | BI + metrics on warehouse | P3.4–P3.5 | Full Studio, metric hover |
| **Phase 5** | 8–18 | Load + orchestrator + dups | P3.3 | `/load`, worker pool, duplicates tab |
| **P3.6** | 18–24 | SSM-B ML + BI v3 | post Phase 5 | Access groups; SSM-B production |

---

## What exists today (S1–S12 baseline)

| Capability | Location |
|------------|----------|
| Schema context pack | `schemaContext.js` |
| Graph context for chat | `chatGraphContext.js` |
| Live SQL, rows not in LLM | `chatLiveQuery.js`, `liveExec.js` |
| Managed plane (job outputs) | `managedDataPlane.js` |
| Postgres replicate v1 | `connectionReplication.js` |
| Monk + packs | `monkAgent.js`, `packs/` |
| Report Studio + export | `BiChartsPage`, `biPlatformExport.js` |
| Post-sync hook | `postSyncAutomation.js` |
| Private runner / worker doc | `privateRunner.js` |
| Orchestrator recipes | `orchestratorRecipes.js` |

**Gap:** Unified warehouse, mandatory samples in all AI paths, SSM-B, full Studio app, worker pool, duplicates UI.

---

## Success metrics

| Metric | Target |
|--------|--------|
| Time to first certified mart after connector | < 4 hours |
| Chat SQL valid against schema (no invented tables) | > 95% |
| BI widget SQL runs on warehouse without manual fix | > 90% |
| Monk modal → Run conversion | > 60% |
| Design partner: “replace three tools” statement | 3 accounts |
| Studio: 5-chart exec board without SQL | < 30 min |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Full replicate cost | Workspace quotas; compression; tiered retention |
| BI scope creep | Parallel Studio track; C1–C9 checklist; weekly cut lines |
| SSM-B training data | Synthetic traces from SportEdge + golden eval |
| Connector count | Load module honest matrix + Airbyte partner |
| Worker isolation bugs | Workspace-scoped creds; security review per P3.2 |

---

## Competitive position after this program

| vs | Que wins |
|----|----------|
| Fivetran + dbt + Looker stack | One login, one warehouse, one cert loop, dual-SSM AI |
| Hevo | Full pull + Monk + BI authoring, not load-only |
| Weld | Governed pipes + warehouse execution + Studio |
| Atlan | Catalog + **execution** on same warehouse |

---

## Related docs

- [Que-Competitive-Sprint-Plan-2026.md](./Que-Competitive-Sprint-Plan-2026.md) — S1–S12 (complete)
- [Phase-2-Complete-2026.md](./Phase-2-Complete-2026.md) — exit status
- [Que-Master-Plan-10x-Monk-Mode.md](./product/Que-Master-Plan-10x-Monk-Mode.md) — Monk north star
- [DEPLOY-FREE.md](./DEPLOY-FREE.md) — pilot deploy

---

## Immediate next step (engineering)

**Start P3.1 Track A:** `queWarehouse.js` + post-sync Monk modal + SSM-A unified pack + platform shell nav.

Say **start P3.1** to begin implementation.

*Last updated: 2026-08-28 · v1.1 — Phase 1–5 checklist + full architecture*
