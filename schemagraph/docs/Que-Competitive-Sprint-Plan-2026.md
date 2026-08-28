# Que Competitive Sprint Plan — India + AI Market (2026)

**Goal:** Win the **post-ingest steward automation** category in India while expanding toward parity on every axis where Que already has a wedge — without pretending to beat Fivetran on 700 connectors in one quarter.

**Horizon:** **12 sprints × 2 weeks = 24 weeks** (Phase 1: S1–S8 competitive wedge; Phase 2: S9–S12 “everything else”).

**North-star metric:** Design partner → **certified KPI in &lt;4 hours** with **evidence pack** (IdeaProof validated: 79/100, 83% launch readiness).

---

## Can Que be better at *all* of this?

**Yes — over sequenced sprints.**  
**No — in one sprint.**

| You listed | What “winning” actually means | Que today | Sprint target |
|------------|-------------------------------|-----------|---------------|
| Joins, packs, cert KPIs, CEO chat after sync | Post-sync auto pipeline: sync → infer joins → Monk → cert → CEO on marts only | Strong (SportEdge E2E shipped) | S1–S2: hook + demo script |
| Upstream discovery/joins before models | Beat “Fivetran + dbt blind” with graph-first onboarding | Strong graph + infer | S2: sync-triggered infer |
| Semantic layer + Monk + HITL | AI proposes; human approves; audit trail | Differentiator (Monk + transform HITL shipped) | S3: metric defs + semantic export |
| End-to-end certified KPIs + BI | Hevo stops at load; Que certifies + ships BI | Partial (ship-to-BI exists) | S3: cert → BI one-click path |
| Post-ingest intelligence (Fivetran gap) | Stack *on* Fivetran/Hevo, not replace day 1 | Positioning + product hooks weak | S1: GTM + S2: post-sync automation |
| Vertical packs, join infer, HITL, CEO | Weld-style speed with governance | 4 Monk packs + 11 templates | S5–S6: pack density + India verticals |
| Discovery → joins → draft jobs → export dbt | dbt-compatible exit, not lock-in | dbt bundle + manifest assist | S4: export polish + Airflow publish |
| Execution (jobs, fixes, materialize) | Atlan is catalog; Que runs | Jobs + live exec + steward | S3 + S7: scheduled golden eval loop |
| Mid-market speed, one steward | Collibra needs 6 FTEs; Que needs 1 | Core thesis | S1: case studies + onboarding |
| DQ inside join/job/cert loop | Monte Carlo is observability-only | Golden eval + drift alerts | S7: steward DQ dashboard |
| Models/metrics/dashboards from messy schema | Looker needs clean warehouse | Monk + Genie + packs | S6 + S8: multi-source Monk + dashboard drafts |

**India race rule:** Whoever gets **3 public case studies + self-serve sandbox + ₹50k–80k/mo land motion** first wins mid-market mindshare — not whoever ships connector #50 first.

---

## Master coverage checklist — your list + full product backlog

Use this to verify **nothing is dropped**. Status after **S8 only**; S9–S12 closes the rest.

### A. Your 11 competitive wedges (from positioning)

| # | Capability | In plan? | Sprint | After S8 |
|---|------------|----------|--------|----------|
| 1 | Joins, packs, cert KPIs, CEO chat **after sync** | ✅ | S2, S3 | **Full** — post-sync hook + cert loop |
| 2 | Upstream discovery/joins **before** models | ✅ | S2, S4 | **Full** — infer banner + dbt export |
| 3 | Semantic layer + Monk + HITL | ✅ | S3 (HITL shipped) | **Full** — semantic export + checklist |
| 4 | End-to-end certified KPIs + BI | ✅ | S3, S6, **RS track** | **Full by S12** — Report Studio + multi-platform export |
| 5 | Post-ingest intelligence (Fivetran gap) | ✅ | S1, S2 | **Full** — stack playbook + automation |
| 6 | Vertical packs, join infer, HITL, CEO | ✅ | S6 | **Full** — 10+ packs + proof data |
| 7 | Discovery → joins → draft jobs → export dbt | ✅ | S4 | **Full** — dbt bundle v2 + Airflow |
| 8 | Execution (jobs, fixes, materialize) | ✅ | S3, S7 | **Full** — drift → fix job loop |
| 9 | Mid-market speed, one steward | ✅ | S1 | **Full** — case studies + sandbox |
| 10 | DQ inside join/job/cert loop | ✅ | S7 | **Full** — golden eval + steward DQ |
| 11 | Models/metrics/dashboards from messy schema | ✅ | S6, S8, **RS track** | **Full by S12** — Genie drafts + Report Studio boards |

**Verdict:** All **11 are in the plan**. Looker-grade BI is delivered via **Report Studio + certified export** (see § below) — **not** by cloning Looker LookML Studio.

### Report Studio track (Looker-grade BI without rebuilding Looker)

**Strategy:** Que wins BI by owning **certified marts upstream** + **steward-grade authoring in Report Studio** + **one-click export** to the customer’s BI stack. Looker customers keep Looker; Que makes them **faster to first dashboard** and **safer** (cert + golden eval + attestation).

```
Messy schema → Monk/HITL → Certified mart → Report Studio (author) → Export / Embed
                                                    ↓
                              Looker LookML · Metabase · Power BI · Tableau · Que embed
```

| Looker capability | Que answer (build) | Do NOT build |
|-------------------|-------------------|--------------|
| Semantic layer / explores | Metric registry + cert marts + semantic YAML export | Full LookML IDE |
| Dashboard authoring | **Report Studio** — drag metrics, filters, drill | Pixel-perfect viz catalog clone |
| CEO / self-serve | CEO chat + embed tokens (`shipToBi`) | Looker marketplace |
| Governance | Cert badge, golden eval, attestation HMAC | Looker access groups clone |
| Existing Looker shop | **`exportLookerPack`** → merge LookML views | Force migration off Looker |

**Existing code to extend:** `certifiedBi.js`, `shipToBi.js`, `biPlatformExport.js` (Looker + Metabase today), `dashboardTemplates.js`, pack BI scaffolds from Monk.

| Sprint | Report Studio / BI deliverable |
|--------|--------------------------------|
| **S3** | RS-1: Cert mart → auto-scaffold charts from pack templates; ship-to-BI happy path |
| **S6** | RS-2: Genie “dashboard draft” → Report Studio board (editable, not export-only) |
| **S9** | RS-3: Report Studio v1 — multi-chart board, filters, drill-to-SQL, cert-only fields |
| **S9** | RS-4: Power BI + Tableau export from same chart model as Looker/Metabase |
| **S10** | RS-5: Report Studio v2 — layouts, parameters, scheduled refresh hook |
| **S10** | RS-6: **Looker merge kit** — documented LookML drop-in + explores from `exportLookerPack` |
| **S12** | RS-7: Report Studio v3 — embed SDK, white-label CEO view, template marketplace |
| **S12** | RS-8: BI battlecard — “Looker-grade outcomes, 1 steward, cert loop” demo video |

**Done when (Looker-grade definition for Que):**

- [ ] Steward builds **5-chart executive board** from certified mart in Report Studio (no SQL)
- [ ] Same board exports to **Looker + Metabase + Power BI** without rework
- [ ] CEO embed loads with **attestation + cert badge**; drift fail hides board
- [ ] Sales demo: Monk cert → Report Studio → Looker export in **&lt;20 min**

### B. P0–P2 gap backlog (from docs)

| # | Gap | Shipped? | Sprint if not done |
|---|-----|----------|-------------------|
| P0.1 | Live prod E2E | ✅ Shipped | S1.5 push |
| P0.2 | SSE Monk + pause/resume/skip | ✅ Shipped | S1.5 push |
| P0.3 | Transform approve (Clean HITL) | ✅ Shipped | S1.5 push |
| P1.4 | Salesforce depth + BigQuery liveExec | ❌ | **S5** |
| P1.5 | Replication v2 (Snowflake + Databricks) | ❌ | **S8.2** (one warehouse) → **S9.1** (second) |
| P1.6 | Page autofill everywhere | ✅ Shipped | — |
| P1.7 | Airflow operator | ✅ Template | **S4.2** PyPI/docs |
| P2.8 | Multi-source Monk | ❌ | **S8.1** |
| P2.9 | Finance + healthcare proof datasets | ❌ | **S6.2** |
| P2.10 | Realtime collab (CRDT / live cursors) | ❌ | **S11** — **was missing from S1–S8** |
| P2.11 | Marketplace 10+ packs | In progress | **S6.1** |

### C. Competitor parity not in S1–S8 (added in S9–S12)

| Gap | vs. | Sprint |
|-----|-----|--------|
| **Power BI + Tableau** export path | Looker / India enterprise BI | S9 (**RS-4**) |
| **Report Studio** (authoring, not export-only) | Looker / Metabase | **S3, S6, S9–S10, S12** (RS track) |
| **Looker merge kit** (LookML drop-in) | Looker incumbent accounts | S10 (**RS-6**) |
| **Reverse ETL** (certified mart → SaaS) | Weld / Hightouch | S10 |
| **Kestra / n8n** operator + recipe | OSS commoditization | S10 |
| **Airbyte / Fivetran native trigger** (not manual webhook) | Partner + compete | S10 |
| **Mongo + Databricks + Snowflake** connector depth | Hevo breadth | S9 |
| **Shopify + Razorpay + Zoho** (all three, not pick-one) | India commerce | S9 |
| **Private runner + managed plane** production hardening | Enterprise | S11 |
| **Billing + usage metering** (not pricing page only) | SaaS ops | S11 |
| **Load / scale tests** + status page | SOC 2 + enterprise | S11 |
| **Realtime collab UI** (presence bar mounted) | Figma-era collab | S11 |
| **SOC 2 Type II certificate** (not kickoff only) | Fivetran/Hevo | S12 (+ 6–12 mo audit) |
| **Connector breadth 25+** (long tail) | Fivetran 500+ | S12+ ongoing |
| **Full multi-region DR** | Enterprise RFP | S12 external |

### D. GTM / India (must ship, not optional)

| Item | Sprint |
|------|--------|
| 3 published case studies | S1, refresh S6 |
| Public pricing + INR | S1 |
| Self-serve sandbox | S1 |
| Stack-on-Hevo/Fivetran battlecard (Hindi) | S1, S5 |
| ROI calculator | **S1.6** (added) |
| Weekly `test:monk-prod` on prod URL in CI | **S1.7** (added) |
| Design partner → paid (3 accounts) | S1–S6 |

---

## Sprint map (at a glance)

```
S1–S8   Phase 1 — Win India post-ingest category (16 weeks)
S9–S12  Phase 2 — BI parity, connectors, enterprise, collab (8 weeks)
        SOC 2 Type II letter — parallel from S8, completes ~month 9–15
```

Parallel track (all sprints): **SOC 2 evidence collection** — not cert in 16 weeks, but audit-ready artifacts.

---

## Sprint 1 — Credibility & India GTM (Weeks 1–2)

**Theme:** Make the product *buyable* in India before adding more features.

### Deliverables

| ID | Deliverable | Competitive beat | Done when |
|----|-------------|------------------|-----------|
| S1.1 | **3 design-partner case study templates** (SportEdge + 2 verticals) | Generic AI tools have no KPI proof | PDF/Notion + `/public` quotes (anonymized OK) |
| S1.2 | **Public pricing page** — Growth ₹50k–80k/mo, Enterprise, packs | Hevo/Fivetran opaque enterprise | Live page + in-app link |
| S1.3 | **Self-serve sandbox signup** (Neon tenant or shared demo org) | PLG vs sales-only incumbents | User signs up → SportEdge Monk in &lt;30 min unaided |
| S1.4 | **“Stack on Hevo/Fivetran” battlecard + 1-pager** (Hindi optional) | India already has ingest | Sales deck: ingest them, certify with Que |
| S1.5 | **Push gap-closure commit** — prod E2E, SSE Monk, transform HITL, autofill | Trust for pilots | `main` on GitHub matches local P0 |
| S1.6 | **ROI calculator** — time-to-KPI vs hiring 2 DEs | India CFO objection | Public page: inputs → ₹ savings |
| S1.7 | **Weekly prod CI** — `test:monk-prod` + `test:smoke` on deployed URL | Regression trust | GitHub Action green every Monday |

### Exit criteria

- [ ] 1 paying or committed design partner references SportEdge cert path
- [ ] Sandbox URL shareable on LinkedIn / founder outbound
- [ ] IdeaProof “GTM readiness” items 1–3 ticked

### Do NOT do in S1

- 10 new connectors
- Full SOC 2 audit
- Rebuild BI from scratch

---

## Sprint 2 — Post-ingest intelligence (Weeks 3–4)

**Theme:** *“Better when you need joins, packs, cert KPIs, CEO chat **after sync**.”*

### Deliverables

| ID | Deliverable | Competitive beat | Done when |
|----|-------------|------------------|-----------|
| S2.1 | **Post-sync webhook / job template** — on connection sync complete → infer joins + optional Monk queue | Fivetran stops at warehouse | Documented + default off/on per connection |
| S2.2 | **CEO / Genie guardrail** — chat scoped to `certified` marts + glossary only | Generic RAG hallucinates | API rejects non-cert tables in CEO mode |
| S2.3 | **“After sync” demo script** (5 min video + doc) | Sales velocity | Hevo customer sees Que value in one meeting |
| S2.4 | **Join infer tuning** — surface top-5 joins on first sync UI banner | Upstream discovery before dbt | Steward sees proposed joins without opening graph |

### Exit criteria

- [ ] Demo: Hevo/Fivetran data already in BQ/SF → connect Que read-only → joins + cert in one session
- [ ] `test:monk-prod` green on staging + one customer-like env

---

## Sprint 3 — Certified KPI + BI loop (Weeks 5–6)

**Theme:** *“End-to-end certified KPIs + BI, not just load.”* (Hevo gap)

### Deliverables

| ID | Deliverable | Competitive beat | Done when |
|----|-------------|------------------|-----------|
| S3.1 | **Cert → metric definition → golden eval** wired in Monk completion | Monte Carlo is post-hoc only | Cert job auto-seeds golden pairs for KPI |
| S3.2 | **Ship-to-BI happy path** — Metabase/Looker export from certified mart | Hevo + Looker separate projects | One steward click from cert badge |
| S3.3 | **Semantic layer export** (metrics YAML or dbt semantic layer stub) | Looker semantic layer manual | Export bundle includes metric defs |
| S3.4 | **Steward “cert checklist” UI** — joins approved, transforms approved, golden pass | HITL visibility | Monk completion blocked until checklist green |
| S3.5 | **Report Studio RS-1** — cert mart auto-scaffolds charts from pack/dashboard templates | Looker needs clean warehouse first | Monk cert → ≥3 charts in Report Studio without manual SQL |

### Exit criteria

- [ ] SportEdge: revenue KPI certified → golden eval pass → BI artifact exported
- [ ] SportEdge: certified mart → **Report Studio board** (≥3 charts) → Metabase or Looker export
- [ ] Sales demo under 15 minutes wall-clock for cert + CEO question

---

## Sprint 4 — dbt + orchestration exit (Weeks 7–8)

**Theme:** *“Discovery → joins → draft jobs → export dbt”* (dbt / Fivetran fear)

### Deliverables

| ID | Deliverable | Competitive beat | Done when |
|----|-------------|------------------|-----------|
| S4.1 | **dbt bundle v2** — models + tests + sources from graph | dbt manual modeling | `dbt run` succeeds on exported bundle (CI) |
| S4.2 | **Airflow operator** — publish to PyPI or documented install | Fivetran orchestration | Operator triggers Que job via API key |
| S4.3 | **Manifest assist** — ingest existing dbt manifest for lineage overlay | Atlan dbt integration | Upload manifest → column lineage enriched |
| S4.4 | **“No lock-in” kit** — export graph, jobs, metrics, audit trail | Enterprise procurement | ZIP export documented in compliance pack |

### Exit criteria

- [ ] dbt-native team completes pilot without re-modeling from scratch
- [ ] Airflow template in docs with working example DAG

---

## Sprint 5 — Connector depth, India-first (Weeks 9–10)

**Theme:** Reduce “we already pay Hevo” — **narrow connector wins**, not 700.

### Priority connectors (India mid-market)

| Priority | Connector / depth | Why |
|----------|-------------------|-----|
| P0 | **Salesforce** — live sync depth (not schema-only) | Every India SaaS + services firm |
| P0 | **BigQuery** — `liveExec` validate + sample preview | GCP-heavy India startups |
| P1 | **Postgres replica v1.1** — CDC doc + reliability | Replace fragile glue |
| P1 | **Spreadsheet / CSV** — polish for CFO uploads | Fast land |
| P2 | **Shopify OR Razorpay OR Zoho** (pick ONE based on design partner) | India commerce wedge |

### Deliverables

| ID | Deliverable | Done when |
|----|-------------|-----------|
| S5.1 | Salesforce incremental sync + field mapping doc | Real SF sandbox sync, not introspect-only |
| S5.2 | BigQuery liveExec + join infer from query history (if available) | BQ connection passes health + sample job |
| S5.3 | Connector matrix page (honest vs Fivetran) | Sales stops over-promising |

### Exit criteria

- [ ] 2 of 3 India design partners on SF, BQ, or Postgres path without custom code
- [ ] Connector count unchanged is OK if **depth** on 3 beats Hevo “checkbox” UX

---

## Sprint 6 — Vertical packs + proof datasets (Weeks 11–12)

**Theme:** *“Vertical packs, join infer, HITL, CEO layer”* (Weld / generic AI)

### Deliverables

| ID | Deliverable | Competitive beat | Done when |
|----|-------------|-----------|-----------|
| S6.1 | **+6 marketplace packs** (finance, healthcare, e-commerce, logistics, SaaS metrics, India GST-ready stub) | 10+ packs P2 goal | 10+ total packs listed |
| S6.2 | **2 anonymized proof datasets** (finance + healthcare) | SportEdge-only proof | Golden eval pairs per dataset |
| S6.3 | **Pack → Monk one-click** with industry template pre-selected | Faster than Weld prompts | Marketplace → Monk in 3 clicks |
| S6.4 | **Genie RS-2** — “create dashboard draft” → editable Report Studio board | Looker manual modeling | Genie output opens in Report Studio, steward adjusts before export |

### Exit criteria

- [ ] Non-SportEdge vertical demo recorded (finance or e-commerce)
- [ ] Pack attach rate tracked: % new workspaces using a pack in week 1

---

## Sprint 7 — DQ, lineage, drift (Weeks 13–14)

**Theme:** *“DQ inside join/job/cert loop”* (Monte Carlo / Atlan lite)

### Deliverables

| ID | Deliverable | Competitive beat | Done when |
|----|-------------|-----------|-----------|
| S7.1 | **Scheduled golden eval** on certified marts (cron + Slack alert) | Monte Carlo separate product | Fail → steward ticket + drift alert |
| S7.2 | **Steward DQ dashboard** — golden pass rate, drift open, join pending | Single pane vs 4 tools | `/steward` summary widgets |
| S7.3 | **Lineage export** — BI + dbt + column impact bundle | Atlan catalog-only | Export includes column lineage graph |
| S7.4 | **Drift → proposed fix job** (AI draft, HITL approve) | Observability without execution | Drift alert links to draft transform/job |

### Exit criteria

- [ ] Certified mart fails golden eval → Slack → steward fixes → re-cert in one loop (demo)
- [ ] SIEM/audit export includes DQ events

---

## Sprint 8 — Enterprise scale + multi-source Monk (Weeks 15–16)

**Theme:** Global-ready; *“create models from messy multi-source schema”*

### Deliverables

| ID | Deliverable | Competitive beat | Done when |
|----|-------------|-----------|-----------|
| S8.1 | **Multi-source Monk** — Postgres + Salesforce (or BQ + SF) one cert path | P2 gap #8 | E2E test with two connections |
| S8.2 | **Replication v2 scoping** — Snowflake OR Databricks read replica (MVP) | Fivetran replication | One warehouse replica path documented |
| S8.3 | **SOC 2 Type II audit kickoff** — pen test scheduled, evidence pack frozen | Enterprise India IT | Auditor engaged; 6-month clock starts |
| S8.4 | **SCIM + OIDC hardening** — idempotent provision/deprovision test suite | Collibra complexity | Automated SCIM smoke in CI |
| S8.5 | **India enterprise SKU** — INR invoice, DPA template, data residency FAQ | Local procurement | Legal docs in `/compliance` |

### Exit criteria

- [ ] Multi-source cert demo on stage
- [ ] SOC 2 observation period started (not completed — that’s +6–12 months)
- [ ] Enterprise pipeline: 1 deal &gt;₹2L/mo in late stage

---

## Phase 2 — Sprints 9–12 (Weeks 17–24) — “You wanted ALL”

**Theme:** Close every item in **§ Master coverage checklist C** that S1–S8 leaves partial or missing.

### Sprint 9 — Report Studio v1 + India connector trio (Weeks 17–18)

**Theme:** *Looker-grade outcomes via Report Studio + export — not a Looker clone.*

| ID | Deliverable | Done when |
|----|-------------|-----------|
| S9.1 | **Replication v2** — second warehouse (Snowflake *and* Databricks paths) | Both documented + one E2E each |
| S9.2 | **Report Studio RS-3** — multi-chart board, filters, drill-to-SQL, cert-only field picker | 5-chart exec board from SportEdge mart |
| S9.3 | **Report Studio RS-4** — **Power BI + Tableau** export (same model as Looker/Metabase) | One board → 4 export formats |
| S9.4 | **Shopify + Razorpay + Zoho** connectors (India commerce complete) | 3 sandboxes sync + join infer |
| S9.5 | **Mongo + warehouse** join path in graph | Multi-DB demo without custom glue |

### Sprint 10 — Report Studio v2 + orchestration mesh (Weeks 19–20)

| ID | Deliverable | Done when |
|----|-------------|-----------|
| S10.1 | **Kestra + n8n** recipe docs + webhook templates | Customer runs Monk from either orchestrator |
| S10.2 | **Airbyte / Fivetran native hook** — documented integration pattern | Post-sync → Que API in partner docs |
| S10.3 | **Reverse ETL MVP** — certified mart → Salesforce/HubSpot segment | One destination live |
| S10.4 | **Report Studio RS-5** — layouts, parameters, scheduled refresh webhook | Board refreshes on job completion |
| S10.5 | **Looker merge kit RS-6** — docs + sample repo for `exportLookerPack` LookML drop-in | Existing Looker project merges Que views in &lt;1 hr |

### Sprint 11 — Enterprise ops + collab (Weeks 21–22)

| ID | Deliverable | Done when |
|----|-------------|-----------|
| S11.1 | **Private runner** hardening — install doc, health, job isolation | Enterprise pilot on customer VPC |
| S11.2 | **Billing + metering** — seats, connectors, pack add-ons | Stripe/Razorpay invoice matches S1 pricing |
| S11.3 | **Load test suite** — 50 concurrent workspaces smoke | CI threshold documented |
| S11.4 | **Status page + on-call runbook** | SOC 2 evidence item |
| S11.5 | **Realtime collab** — presence bar UI + steward co-edit on join review | P2.10 closed |

### Sprint 12 — Long-tail connectors + SOC 2 finish line (Weeks 23–24)

| ID | Deliverable | Done when |
|----|-------------|-----------|
| S12.1 | **Connector long-tail** — prioritize top 10 from design-partner requests | 25+ types or honest matrix update |
| S12.2 | **Pack Studio** polish — fork pack, diff, merge variants | Pack variant merger UX complete |
| S12.3 | **Report Studio RS-7** — embed SDK, white-label CEO view, BI template marketplace | Customer embeds cert board in portal |
| S12.4 | **Report Studio RS-8** — “Looker-grade outcomes” sales demo video + battlecard | 20-min Monk → RS → Looker export recording |
| S12.5 | **Eval dashboard public** — golden recall, agent success, cert SLA | `/eval` or embed for sales |
| S12.6 | **SOC 2 Type II** — observation period complete, report letter | External (starts S8.3, finishes ~6–12 mo later) |
| S12.7 | **Global GTM** — USD pricing page, 2 non-India case studies | India + one US/EU reference |

### Phase 2 exit — “all” definition

After **S12**, Que has implemented **every row** in sections A–D above except:
- **Fivetran 500+ connectors** — ongoing, not a 24-week project
- **SOC 2 Type II letter** — clock starts S8, letter often month 9–15
- **Looker as a product replacement** — Que wins **cert loop + Report Studio + export**; customers with sunk Looker cost **keep Looker** via merge kit
- **Fortune 500 Collibra/GRC depth** — intentional non-goal for mid-market wedge

---

## Competitive scorecard — target end of Sprint 8

| Competitor | Today (honest) | After S8 (realistic) | Still lose on |
|------------|----------------|----------------------|---------------|
| **Fivetran** | Connectors, brand | Post-ingest story + stack playbook | Connector count |
| **Hevo** | India brand, price | Cert KPI + BI + CEO in one product | Ingest-only customers who won’t add tool |
| **Airbyte** | OSS, connectors | Monk + HITL + governed AI | Self-host OSS crowd |
| **dbt** | Modeling standard | Export + manifest assist + co-exist | Pure dbt shops with no steward pain |
| **Weld** | Speed, AI | Packs + golden eval + audit trail | Raw “chat to pipe” simplicity |
| **Atlan** | Catalog, lineage | Execution + cert loop | Pure catalog RFPs |
| **Monte Carlo** | DQ observability | Golden eval inside cert | Best-in-class anomaly ML |
| **Looker** | BI maturity | Report Studio + export (S3–S12) | LookML IDE / legacy enterprise features |
| **Collibra** | GRC enterprise | 1 steward vs 6 FTEs | Fortune 500 GRC |

---

## Competitive scorecard — target end of Sprint 12 (Report Studio complete)

| Competitor | After S12 (realistic) | Que BI moat |
|------------|----------------------|-------------|
| **Looker** | Co-exist via LookML export + merge kit | Cert mart → Report Studio → export in one session |
| **Metabase** | Primary OSS export target | Same board exports to Metabase cards JSON |
| **Power BI** | India enterprise embed path | RS-4 export + embed for portals |
| **Tableau** | Export + connector spec | RS-4; not rebuilding Tableau Desktop |

---

| Role | FTE | Sprints most loaded |
|------|-----|---------------------|
| Full-stack (API + UI) | 2 | S2–S4, S7, **S9–S10 (Report Studio)** |
| Connectors / data | 1 | S5 |
| AI / Monk / Genie | 1 | S2, S6, S8 |
| GTM / founder | 0.5 | S1, S6 (case studies) |
| DevOps / compliance | 0.25 | S1, S8 |

If team &lt; 3 engineers: **merge S6+S7** or drop replication v2 to Sprint 9.

---

## India GTM cadence (every sprint)

| Activity | Frequency |
|----------|-----------|
| Founder outbound (LinkedIn, Razorpay/SaaS founders, data leads) | 10 conversations / sprint |
| “Post-ingest” webinar with live SportEdge + Hevo stack demo | S2, S6 |
| Design partner office hours | Weekly |
| Pricing / ROI calculator update | S1, S4 |
| Hindi one-pager refresh | S1, S5 |

**Pricing (hold):** Land **₹50k–80k/mo** Growth; expand with packs + seats; Enterprise **₹2L+/mo** with SOC 2 in progress.

---

## What to ship THIS week (before Sprint 1 kickoff)

1. **Git push** — P0 gap closure (prod E2E, SSE Monk, transform HITL, autofill).
2. **Pick Sprint 1 design partner** — name one account for case study.
3. **Freeze sprint board** — 20 tickets from S1.1–S1.5 in Linear/Jira/GitHub Projects.
4. **Schedule S2 demo** — invite 5 Hevo/Fivetran users for “after sync” webinar.

---

## Related docs

- [Que-IdeaProof-Validation-Report-2026.md](./Que-IdeaProof-Validation-Report-2026.md) — validation, pricing, competitors
- [Que-Documentation-Pack-2026.md](./Que-Documentation-Pack-2026.md) — P0–P2 gap status
- [COMPLIANCE-PROCESS.md](./COMPLIANCE-PROCESS.md) — SOC 2 path

---

*Last updated: 2026-08-27 · Owner: Product / GTM*
