# Que — Manual Testing Master Guide (2026)

> **Manual testing is the primary sign-off path** for design partners, paid POCs, and production go-live.  
> Automated tests (`npm run test:diligence`, phase tests) are a **pre-flight gate** — they catch regressions fast, but they do not replace clicking through the product with real connectors and a human steward.

**Use this doc:** print or split-screen; mark **PASS / FAIL / N/A**; attach screenshots, job IDs, and report URLs.

**Related (shorter / older):**
- `MANUAL_TEST_PLAN.md` — original paid-POC checklist (auth, jobs, export)
- `SMOKE-CEO.md` — 5–10 min CEO demo path
- `TESTING_CLARITY.md` — self-serve account + invite smoke
- `Que-Documentation-Pack-2026.md` — management + technical + competitive overview

---

## How manual vs automated testing fits

| Layer | Purpose | When to run |
|-------|---------|-------------|
| **Manual (this doc)** | Prove the product works for **your customer scenario** | Before every pilot, release, prod deploy |
| **Automated diligence** | Privacy, security, join golden set, unit helpers | CI + before manual (pre-flight §0) |
| **Phase tests (3–6)** | Monk, Pack Studio, agent intent modules | After code changes to those areas |
| **Live smoke (`test:smoke`)** | API happy path against running server | Staging/prod URL weekly |
| **Playwright E2E** | Browser flows (optional) | Before major UI releases |

**Rule of thumb:** If automated tests pass but manual §A–§M fail → **not ready for client**.

---

## Test session header

| Field | Value |
|-------|-------|
| **Environment** | Local / Staging / Production |
| **UI URL** | |
| **API URL** | |
| **Build / commit** | |
| **Tester** | |
| **Date** | |
| **Workspace name** | |
| **Primary connector(s)** | Postgres / Snowflake / Databricks / Excel / … |

---

## §0 — Pre-flight (automated gate — run before manual)

Run from `adc/schemagraph/api`:

```bash
npm run test:diligence    # joins + privacy + functional + unit
npm run test:que-agent    # Que Agent intent smoke
npm run build             # from schemagraph/ root — UI compiles
```

Optional if Monk/Pack Studio touched:

```bash
npm run test:phase5 && npm run test:phase6 && npm run test:e2e-check
```

| # | Step | Expected | Result |
|---|------|----------|--------|
| 0.1 | Migrations applied through `047` (Monk, Pack Studio, replication) | `npm run migrate` clean | |
| 0.2 | Prod secrets set (`QUE_SECRETS_KEY`, `QUE_ATTESTATION_HMAC_SECRET`, `QUE_CORS_ORIGINS`) | API boots | |
| 0.3 | `STITCH_AUTH_DISABLED` **not** set in prod-like env | Login required | |
| 0.4 | `test:diligence` all PASS | Exit 0 | |
| 0.5 | Login page — no prefilled prod passwords | Blank form | |

---

## §A — Account, workspace & roles (15 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| A.1 | Create account (email + password ≥8) | Owner workspace created | |
| A.2 | Sign out / sign in | Session restored | |
| A.3 | Create second workspace from nav dropdown | Empty workspace | |
| A.4 | Settings → Invite member (member role) | Pending invite shown | |
| A.5 | Register/login as invited email | Joins with correct role | |
| A.6 | Change member role (admin+) | Updates; last owner protected | |
| A.7 | Viewer tries create connection | 403 / blocked | |

---

## §B — Sources & sync (20 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| B.1 | Add Postgres connection (or SportEdge fixture) | Saves; password masked | |
| B.2 | Sync | Tables appear on Workspace canvas | |
| B.3 | Add Excel/CSV upload source | Tables synced | |
| B.4 | (Optional) Snowflake or Databricks fixture sync | Tables on canvas | |
| B.5 | DB check: `connections.config_json` uses `__enc` | No plaintext secrets | |
| B.6 | Edit connection — leave password blank | Sync still works | |
| B.7 | Delete connection | Removed cleanly | |

---

## §C — Joins & HITL (20 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| C.1 | After sync, suggested joins visible | Suggested edges on graph / Join Review | |
| C.2 | Open `/joins` — review risk tier (Green/Yellow/Red) | Tiers shown | |
| C.3 | **Promote** a join | Accepted; usable in jobs | |
| C.4 | **Reject** a join | Rejected; not in export | |
| C.5 | Drag column→column join on Workspace | Edge created / suggested | |
| C.6 | Reload page — layout persisted | Positions restored | |
| C.7 | (Optional) Golden eval on `/eval` | Recall/precision displayed | |

---

## §D — Chat & Que Agent / Genie (30 min) — **primary AI path**

| # | Step | Expected | Result |
|---|------|----------|--------|
| D.1 | `/chat` — CEO mode: “What tables do we have?” | Plain answer, no SQL dump | |
| D.2 | CEO mode: business metric question (e.g. revenue) | Live results grid OR clear “need join/cert” message | |
| D.3 | Switch to **Engineer** mode — same question | SQL / citations visible | |
| D.4 | `/help`, `/list`, `/describe orders` (or your table) | Skill responses | |
| D.5 | **Create job from chat:** “Create a job joining [table A] and [table B]” | Que Agent runs; job ID in reply / plan card | |
| D.6 | Open drafted job → notebook has SQL | Job opens at `/jobs/:id/notebook` | |
| D.7 | **Genie (✨ bottom-right)** on Jobs page: “Edit this job to add [column]” | Uses page job context | |
| D.8 | **Build BI from chat:** “Build a blue bar dashboard by [dimension]” | Report scaffold OR clear certified-dataset message | |
| D.9 | **Materialize (if enabled):** “Materialize this job as a table” | Table in customer warehouse OR gate message | |
| D.10 | Agent checkpoint: if join Promote required → approve in card → continue | Plan completes or waits at Promote | |
| D.11 | Settings → **Enable Que Agent** off → retry agent ask | Disabled message | |
| D.12 | Confirm chat never shows full warehouse dump in prompt area | Schema + capped live grid only | |

---

## §E — Jobs, validate, export (25 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| E.1 | Create job manually or from agent | Notebook opens | |
| E.2 | **Run Test** (dry-run) | Output/logs; no warehouse write | |
| E.3 | **Validate** (live, ≤20 rows) | Capped preview | |
| E.4 | Mark **Ready** | Status ready | |
| E.5 | Export JSON | `attestation.signature` present | |
| E.6 | Verify attestation (`/verify` or API) | `{ ok: true }` | |
| E.7 | Export dbt-pr (with GitHub configured) | PR or clear block reason | |
| E.8 | With open drift — export blocked when policy on | 409 / UI message | |
| E.9 | Schedule job (hourly/daily) in notebook/settings | Schedule saved | |
| E.10 | **Materialize** panel — confirm CTAS/VIEW | Audit row; object in warehouse | |

---

## §F — Monk Mode autopilot (45 min) — **primary onboarding path**

| # | Step | Expected | Result |
|---|------|----------|--------|
| F.1 | `/monk` — select industry pack (e.g. Ecommerce) | Pack selected | |
| F.2 | Run **Discover** | Sources inventoried | |
| F.3 | Run **Map** | Entity↔table mappings | |
| F.4 | Run **Clean** | Profiling issues listed | |
| F.5 | Run **Build** | Jobs + KPIs seeded | |
| F.6 | Run **Certify** (autopilot) | Golden eval; promote gate if needed | |
| F.7 | Certification passes | Green / certified state | |
| F.8 | Post-cert deliverables link (dbt, BI, replication seed) | Links or exports available | |
| F.9 | `/metrics` — Monk-seeded KPIs visible | KPIs listed | |
| F.10 | `/steward` — inbox items | Quality / cert queue | |
| F.11 | Export Monk evidence from `/compliance` | Markdown / pack downloads | |

---

## §G — Pack Studio (25 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| G.1 | `/pack-studio` — view custom / blended packs | UI loads | |
| G.2 | Blend suggestion (e.g. 60% ecommerce + 40% finance) | Blend preview | |
| G.3 | Save blended pack | Persists | |
| G.4 | Column mapping (entity column map) | Map saved | |
| G.5 | Replication pipeline — Postgres → `que_replica` | Pipeline created / run | |
| G.6 | Export Looker / Metabase snippet | Download or copy | |
| G.7 | Learn golden pairs from promoted joins | Pairs listed | |

---

## §H — BI, metrics & ship (25 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| H.1 | `/metrics` — create or view certified metric | Metric saved | |
| H.2 | `/bi` — Report Studio canvas | Charts render | |
| H.3 | Run preview on chart | Data from certified managed dataset | |
| H.4 | Scaffold full report (button or chat) | Multi-visual layout | |
| H.5 | Certify chart / report | Certified badge | |
| H.6 | Generate embed token | `/embed/:token` works | |
| H.7 | `/ship` — draft → approve → rollback | Ship flow completes | |
| H.8 | `/outcome` in chat — CEO plan → ship step | Outcome card in thread | |

---

## §I — Governance, drift & compliance (20 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| I.1 | `/rules` — add workspace rule | Rule injected in chat context | |
| I.2 | `/proposals` — transform draft approve/apply | Job created from draft | |
| I.3 | `/drift-agent` — propose fix | Suggestion listed | |
| I.4 | `/validation` — validation suite on job | Checks listed | |
| I.5 | `/compliance` — evidence pack sections | Controls + export | |
| I.6 | Settings → drift alerts webhook | Saves | |
| I.7 | Audit log — recent actions | Rows for export/agent/materialize | |

---

## §J — Orchestration & automation (15 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| J.1 | Settings → Automation → Orchestrator webhook URL | Saves | |
| J.2 | Run job → webhook fires (check receiver logs) | Payload with jobId/runId | |
| J.3 | (Optional) Private runner URL + HMAC | Job queues externally | |
| J.4 | Scheduled job tick (hourly) — wait or trigger | Run logged | |

---

## §K — Marketplace & templates (10 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| K.1 | `/marketplace` — install ecommerce pack | Install history | |
| K.2 | `/templates` — create job from template | Job created | |
| K.3 | `/lineage` — path from job to tables | Lineage visible | |

---

## §L — Security & negative cases (15 min)

| # | Step | Expected | Result |
|---|------|----------|--------|
| L.1 | Chat/agent: attempt destructive SQL phrasing | Blocked or transform draft only | |
| L.2 | Viewer: export / materialize / settings save | 403 | |
| L.3 | Cross-workspace ID in API | 403 | |
| L.4 | CORS from wrong origin | Blocked | |
| L.5 | Export with unreviewed joins (policy on) | Blocked | |
| L.6 | SSO callback — token in hash not query | No token in URL after login | |

---

## §M — Production deploy smoke (staging/prod only)

| # | Step | Expected | Result |
|---|------|----------|--------|
| M.1 | `GET {API}/health` | ok | |
| M.2 | Login on Vercel URL | Works | |
| M.3 | Sync real customer Postgres (read-only creds) | Schema on canvas | |
| M.4 | Monk cert on prod workspace | Completes or clear blocker | |
| M.5 | CEO chat one certified KPI | Answer + live grid | |
| M.6 | Genie create job from `/jobs` page | Job created | |
| M.7 | `npm run test:smoke` with `QUE_API_BASE=prod` | PASS | |

---

## Happy paths (pick one per session)

### Path 1 — CEO demo (20 min)
1. Login → Chat CEO question → Outcome or BI ask  
2. Join Review → Promote one join  
3. Ship or BI embed  

### Path 2 — Steward onboarding (60 min)
1. Connect Postgres → Sync  
2. Monk Mode full run → Certify  
3. Pack Studio export  
4. Chat/Genie refine one job  

### Path 3 — Engineer pipeline (45 min)
1. Sources → Promote joins  
2. Job → Validate → Materialize  
3. dbt export → Orchestrator webhook  

---

## Sign-off

| Role | Name | Sign | Date |
|------|------|------|------|
| Manual tester | | | |
| Eng lead | | | |
| Ready for paid POC? | **Y / N** | | |
| Ready for production? | **Y / N** | | |

**Blockers found:**

1.  
2.  
3.  

**Evidence attached (links / IDs):**

- Job IDs:  
- Report IDs:  
- Monk run ID:  
- Screenshots:  

---

## Appendix — SportEdge demo data

```bash
cd adc/schemagraph/api
npm run bootstrap:sportedge-pg    # Postgres fixture
npm run seed:demo                 # Demo workspace + Que Agent on
```

Use SportEdge for Monk ecommerce pack and CEO “Puma revenue” style questions.

---

*Primary manual testing doc — August 2026. Update when major features ship (Que Agent, Monk, Pack Studio).*
