# Que — IdeaProof Validation Report (Full Analysis)

**Source:** IdeaProof Validation Report v2 Pro (saved dashboard HTML)  
**Idea ID:** `712f8f8e-a51c-4b8e-bf23-c374ba65e1da`  
**Account:** shabrezadilabz · 30 credits · Step 1/6 complete (Idea Validation unlocked)  
**Product version referenced:** v1 `ed8b4f9` live  
**Report date:** August 2026  
**IdeaProof dashboard (private):** https://ideaproof.io/dashboard?ideaId=712f8f8e-a51c-4b8e-bf23-c374ba65e1da  
**Public share link status:** Expired / not found — use saved HTML or re-export from dashboard  

---

## Table of contents

1. [Executive summary](#1-executive-summary)  
2. [Verdict & score breakdown](#2-verdict--score-breakdown)  
3. [Competitive landscape — who they are, what they built, links](#3-competitive-landscape)  
4. [How Que is better (and where it is not)](#4-how-que-is-better)  
5. [Similar successes — allies or enemies?](#5-similar-successes)  
6. [Market trends & pivot examples (Fivetran + dbt)](#6-market-trends--pivot-examples)  
7. [Failed companies — why they died & how Que avoids it](#7-failed-companies)  
8. [Business model, revenue mix & recommended pricing](#8-business-model-revenue--pricing)  
9. [Unit economics & financial projections](#9-unit-economics)  
10. [IdeaProof action plan → Que adaptation status](#10-action-plan--adaptation-status)  
11. [Quick wins — IdeaProof vs Que today](#11-quick-wins)  
12. [Discovery & investor questions — full Q&A](#12-discovery--investor-qa)  
13. [Journey board hypotheses (5/6)](#13-journey-hypotheses)  
14. [Roadmap, team, risks & exit](#14-roadmap-team-risks-exit)  
15. [Product improvement backlog from IdeaProof](#15-product-improvement-backlog)  
16. [Reference links index](#16-reference-links-index)  

---

# 1. Executive summary

**Idea:** Que connects data sources, applies industry packs to map schema, joins, jobs, KPIs, and dashboards — with human-in-the-loop (HITL) trust gates.

| Metric | Value |
|--------|-------|
| **Overall verdict** | **STRONG (79/100)** — “Strong Potential” |
| Launch readiness | **83%** to launch |
| Viability label | Promising with Caveats |
| Problem validation | 85/100 |
| Solution validation | 80/100 |
| Market validation | 72/100 |
| Competition level | **58/100** (crowded — biggest drag on score) |

**One-line thesis (IdeaProof):** AI data pipeline automation with HITL trust gates solves acute **mid-market data engineering bottlenecks** — the gap between raw ingestion (Fivetran/Airbyte) and certified executive KPI dashboards.

**Your edge (IdeaProof):** Proprietary industry packs + HITL trust gates → **75–85% pipeline automation** with **golden join recall ≥ 0.90**.

**Market gap:** Organizations with **50–500 employees** and **one data steward** cannot bridge ingestion tools → semantic layer → CEO-ready BI without hiring a full data team.

**Next move (IdeaProof):** *Lock in defensibility before competitors notice.*

---

# 2. Verdict & score breakdown

## 2.1 Weighted score math

| Criterion | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Problem–solution fit | 17% | 82 | +13.9 |
| Value proposition | 15% | 80 | +12.0 |
| Market timing | 12% | 84 | +10.1 |
| MVP viability | 10% | 83 | +8.3 |
| Competition level | 14% | 58 | +8.1 |
| Target market clarity | 10% | 78 | +7.8 |
| Market entry barriers | 7% | 68 | +4.8 |
| Initial feasibility | 5% | 81 | +4.1 |
| Resource requirements | 2% | 72 | +1.4 |

**Adjustments:** −6 (2 red flags) · +5 (2 green lights) · +3 (excellent timing) → **Final 79/100**

## 2.2 Go signals ✅

- **3 design partners** converted pilot → paid  
- **Time-to-first-KPI under 4 hours**  
- **75–85% automation** of schema discovery, join inference, KPI generation  
- HITL gates + golden recall ≥ 0.90 (anti-hallucination architecture)  
- Addresses **77% enterprise data skills shortage** (IdeaProof citation)  
- Poor data quality costs **~$12.9M/year** per organization ([TAMI.ai source](https://tami.ai/data-integration-tools/))

## 2.3 Stop signals ⚠️

- SOC 2 **scaffolding only** — need Type II for enterprise procurement  
- Open-source commoditization (Airflow, n8n, Kestra, Airbyte)  
- Crowded modern data stack (ELT + transform + BI as separate SKUs)  
- Compliance scale: SOC 2 Type II, **EU Data Act**, **HIPAA** for vertical packs  

## 2.4 Red flags 🚩

1. Enterprise security hurdles — rapid SOC 2 Type II progression required  
2. Commoditization if orchestration tools add native join-inference agents  

## 2.5 Green lights 💡

1. Proven design-partner traction + sub-4-hour KPI path  
2. Automation directly targets documented skills shortage  

---

# 3. Competitive landscape

## 3.1 Market size (IdeaProof estimates)

| Layer | Estimate | Methodology |
|-------|----------|-------------|
| **TAM** | **$20.5B by 2028** | Cloud data pipeline automation |
| **SAM** | **$4.2B by 2028** | Mid-market data integration software |
| **SOM** | **$210M by 2028** | Vertical industry-pack data automation |
| **CAGR** | **15.0%** | Growing market stage |

Bottom-up assumption: ~14,000 mid-market enterprises × **$15k–$30k/year** for data automation platforms.

**Geography:** North America (primary — Snowflake/Databricks density), Europe (secondary — EU Data Act governance demand).

---

## 3.2 Direct competitors (IdeaProof mapped — 4 detailed + 11 locked)

### Tier A — Ingestion / ELT (Que complements; does not replace)

| Company | What they built | Strengths | Weaknesses vs Que | Public pricing (IdeaProof) | Links |
|---------|-----------------|-----------|-------------------|--------------------------|-------|
| **Fivetran** | Managed ELT, 500+ connectors, dbt Cloud acquisition path | Reliable connectors; fast start; enterprise brand | No vertical industry packs; no join inference; no CEO chat; no Monk autopilot; unpredictable pricing at scale | Enterprise / MAR-based | [fivetran.com](https://www.fivetran.com) · [Trustpilot reviews](https://www.trustpilot.com/review/fivetran.com) |
| **Airbyte** | Open-source + cloud ELT, 600+ connectors | Massive connector library; developer ecosystem | No KPI seeding; no BI layer; heavy engineering to operationalize | Cloud Standard from **~$10/mo** (entry) | [airbyte.com](https://airbyte.com) · [GitHub](https://github.com/airbytehq/airbyte) |
| **Hevo Data** | No-code pipeline + 150+ connectors | Automated schema mapping on ingest | Pure ELT — no semantic metric registry; no CEO conversational BI | From **~$239/mo** | [hevodata.com](https://hevodata.com) |
| **Stitch Data** (Talend) | Developer-focused ingestion (Qlik/Talend) | Reliable ingestion; enterprise backing | No AI agent; row-based pricing scales badly; no automation layer | From **~$100/mo** | [stitchdata.com](https://www.stitchdata.com) |

**Will they block Que?** Not directly — they **stop at the warehouse door**. Que starts where they end: **schema graph → joins → jobs → certify → BI**. Risk: **Fivetran + dbt** pivot (see §6) closes part of the gap.

---

### Tier B — Transform / semantic layer (partial overlap)

| Company | What they built | Strengths | Weaknesses vs Que | Public pricing | Links |
|---------|-----------------|-----------|-------------------|----------------|-------|
| **Weld** | All-in-one ELT + reverse ETL + AI SQL UX | Clean transform UX; unified stack | No vertical industry packs; limited trust-gated governance | From **~$99/mo** | [weld.app](https://weld.app) |
| **dbt Labs** | Analytics engineering, tests, docs | Industry standard for transforms | No discovery/joins upstream; no CEO BI; requires engineers | Team / Enterprise tiers | [getdbt.com](https://www.getdbt.com) |

**Que positioning:** Export **to** dbt (lock-in antidote) — don’t fight dbt, **feed** it certified models.

---

### Tier C — Catalog / governance (workflow overlap, not execution)

| Company | What they built | Que difference |
|---------|-----------------|----------------|
| **Atlan** | Data catalog, governance workflows | Que **does** the pipeline work, not just documents it |
| **Collibra** | Enterprise governance | Same — Que is execution + HITL, not GRC-only |

---

### Tier D — BI (downstream; Que scaffolds then hands off)

| Company | Role | Que relationship |
|---------|------|------------------|
| **Looker** / **Metabase** / **Tableau** | Dashboard consumption | Que **Ship to BI** + Looker export — partner, not enemy |

---

### Tier E — Open-source “Fivetran replacements” (biggest commoditization threat)

| Project | Stars (IdeaProof) | License | Threat | Links |
|---------|-------------------|---------|--------|-------|
| **Kestra** | ~28k★ | Apache-2.0 | Positioned as free Fivetran replacement | [kestra.io](https://kestra.io) |
| **Airbyte** | ~22k★ | ELv2 / OSS | Commodity extraction | [github.com/airbytehq/airbyte](https://github.com/airbytehq/airbyte) |
| **Prefect** | ~24k★ | Apache-2.0 | Orchestration | [prefect.io](https://www.prefect.io) |
| **Dagster** | ~16k★ | Apache-2.0 | Orchestration + assets | [dagster.io](https://dagster.io) |
| **Apache Airflow** | ~46k★ | Apache-2.0 | Orchestration standard | [airflow.apache.org](https://airflow.apache.org) |
| **n8n** | ~201k★ | Sustainable license | Workflow automation leader | [n8n.io](https://n8n.io) |

**Open-source saturation index:** **67/100 crowded** — 37 Automation implementations, 17 maintained.

**IdeaProof warning:** *“Competing on features alone means fighting free software with a payroll.”*  
**Que wedge:** Compliance audit trails, industry packs, HITL certification, support SLA, private runner — things OSS teams rarely productize together.

---

## 3.3 Competitor review sentiment (live signals)

**Fivetran (Trustpilot — mixed):**
- Praise: reliable connectors, easy start  
- Gripes: complex advanced setup, unpredictable pricing  

**Reddit demand (r/dataengineering — verified thread):**
> *“Each new client means reinventing the wheel for schema, KPIs, and dashboard prep… engineers burning out.”*

**Search trends:** “data integration automation” interest **78/100**, rising; “ai data pipeline automation” **+180%**.

---

# 4. How Que is better

## 4.1 Capability matrix (Que vs typical stack)

| Capability | Fivetran/Airbyte | Weld/dbt | Atlan | Que |
|------------|------------------|----------|-------|-----|
| Connector breadth (500+) | ✅ Strong | ⚠️ Limited | ❌ | ⚠️ 8 types (growing) |
| Schema graph + join infer | ❌ | ❌ | ⚠️ Metadata | ✅ **Core moat** |
| HITL join Promote/Reject | ❌ | ❌ | ⚠️ Workflow | ✅ **Green/Yellow/Red** |
| Industry pack autopilot (Monk) | ❌ | ❌ | ❌ | ✅ **4 vertical packs** |
| NL → job + materialize (Genie) | ❌ | ⚠️ Partial | ❌ | ✅ |
| CEO chat (no SQL exposed) | ❌ | ❌ | ❌ | ✅ |
| Contract freeze + drift gates | ❌ | ⚠️ dbt tests | ❌ | ✅ |
| Golden eval recall gate | ❌ | ❌ | ❌ | ✅ ≥0.90 target |
| dbt/GitHub export (anti lock-in) | ⚠️ Native dbt | ✅ | ❌ | ✅ |
| SOC 2 evidence scaffolding | ✅ Mature | ⚠️ | ✅ | ⚠️ Scaffolding only |

## 4.2 IdeaProof “Your opportunity” per competitor

| Competitor | Que opportunity |
|------------|-----------------|
| **Weld** | Pre-packaged **industry KPI ontologies** + automated join inference vs generic SQL |
| **Hevo** | End-to-end **warehouse → certified BI dashboard** in one session |
| **Airbyte** | **Semantic transformation + join discovery** — not commodity extraction |
| **Stitch** | **Monk Mode** replaces manual pipeline config + contract validation |

## 4.3 Honest gaps (don’t oversell)

- Connector count vs Fivetran/Airbyte  
- SOC 2 Type II certificate (not yet)  
- Replication v2 (Postgres only today)  
- BigQuery live validate not shipped  
- Multi-source Monk (Postgres + Salesforce) not proven E2E  

---

# 5. Similar successes

IdeaProof lists these as **positive precedents** — companies that won in adjacent layers:

| Company | What they did well | Are they Que competitors? | Will they “come between”? |
|---------|-------------------|---------------------------|---------------------------|
| **[Weld.app](https://weld.app)** | Unified ELT + reverse ETL + clean UX; reached meaningful ARR in mid-market | **Partial** — transform/ELT overlap | Unlikely to add Monk-style vertical packs + HITL join graph quickly |
| **[Hevo Data](https://hevodata.com)** | Fast no-code ingest + schema mapping; strong APAC/global mid-market | **Partial** — ingestion layer | Could add “semantic layer” — watch closely |
| **[Airbyte](https://airbyte.com)** | OSS community + connector moat; enterprise cloud | **Adjacent** — extraction not semantics | Could partner (Que as semantic layer on Airbyte sync) OR compete if they move upstack |

**Interpretation:** These are **not identical competitors** — they prove **mid-market willingness to pay** for pipeline automation. Que wins by owning the **certified semantic + BI outcome** layer they don’t serve.

**Strategic options:**
1. **Partner narrative:** “Connect with Airbyte/Fivetran → Que Monk certifies and ships BI”  
2. **Compete narrative:** “Replace 4-tool stack with one steward + Que”  

---

# 6. Market trends & pivot examples

## 6.1 Trends IdeaProof flagged

| Trend | Meaning for Que | Que alignment |
|-------|-----------------|---------------|
| **HITL validation replacing black-box autonomous AI** | Buyers fear hallucinated joins/metrics | ✅ Join Review, transform approve, Monk cert gates |
| **Semantic layer centralization in warehouse** | Metrics live in Snowflake/Databricks/BQ | ✅ Jobs materialize to customer warehouse; metric registry |
| **Rising “ai data pipeline automation” search (+180%)** | Category tailwind | ✅ Que Agent + Genie positioning |

## 6.2 Pivot example: Fivetran → managed dbt

**What happened:** Fivetran expanded from **sync-only** toward **managed dbt transformations** ([Fivetran + dbt](https://www.fivetran.com/dbt)).

**Threat level:** **Medium-high** — closes “ELT + transform” gap Que also addresses.

**Que counter-moves:**
1. **dbt export first-class** — export clean models; pass enterprise security reviews (Journey hypothesis #1)  
2. **Upstream moat** — join inference + industry packs + golden eval **before** dbt  
3. **CEO BI + Genie** — Fivetran/dbt don’t serve non-technical exec query layer  
4. **Vertical packs** — ecommerce/finance/healthcare ontologies Fivetran won’t build  

---

# 7. Failed companies

## 7.1 AI / data platform failures (IdeaProof failure corpus)

| Company | Raised / scale | Root cause (IdeaProof) | Lesson for Que | How Que overcomes |
|---------|----------------|------------------------|--------------|-------------------|
| **[C3.ai](https://c3.ai)** | $300M+ pre-IPO; $10B peak valuation | Enterprise AI promises **outpaced adoption**; slow growth; customer concentration; stock −85% | Don’t sell “AI platform” to enterprises without provable ROI | **Design partners + <4hr KPI** proof; mid-market first, not Fortune 500-only |
| **[DataRobot](https://www.datarobot.com)** | **$1B+** raised; $6.3B peak | **Commoditization** — cloud AutoML from AWS/GCP; failed enterprise pivot | Feature-only AI gets absorbed by platforms | **Sticky contracts:** frozen jobs, drift gates, dbt export, private runner — not generic AutoML |
| **[Inflection AI](https://inflection.ai)** | **$1.5B** raised | **Acqui-hire** — personal AI chatbot vs ChatGPT | Horizontal chatbots without workflow lock-in die | Que is **workflow-embedded** (warehouse + joins + jobs), not generic chat |

## 7.2 Other cautionary tales (IdeaProof board)

| Company | Failure mode | Relevance to Que |
|---------|--------------|------------------|
| **Proterra** ($1B+) | Cash burn, long gov sales cycles | Avoid enterprise-only GTM before product-market fit |
| **23andMe** ($1.4B) | One-time revenue, no recurrence; trust breach | **Subscription + recurring certified datasets**; audit trail for trust |
| **Hopin** ($1.02B) | Pandemic tailwind evaporated | Don’t confuse **temporary AI hype** with durable steward pain |

## 7.3 Que risk map (from IdeaProof) + mitigations

| Risk | P×I | Mitigation in Que |
|------|-----|-------------------|
| Hallucinated joins corrupt KPIs | P3·I5 | HITL promote, risk tiers, golden recall gate |
| Warehouse query cost spikes | P3·I3 | Dry-run LIMIT 100; validate caps |
| DataRobot-style commoditization | P3·I5 | dbt export, frozen contracts, vertical packs |
| Long enterprise sales / burn | P5·I3 | Mid-market outbound; 10–12 mo CAC payback discipline |

---

# 8. Business model, revenue & pricing

## 8.1 IdeaProof recommended model

**Type:** B2B SaaS — tiered by **connected sources**, **industry packs**, **steward seats**.

| Stream | % of revenue | IdeaProof tier | Price | Target buyer |
|--------|--------------|----------------|-------|--------------|
| Subscription | **65%** | **Mid-Market Growth** | **$999/mo** (annual) | 1–2 stewards, growth-stage mid-market |
| Subscription | **30%** | **Enterprise Governance** | **$2,500/mo** (annual) | SCIM/ABAC, private runner, compliance logs |
| Usage add-on | **5%** | **Industry pack marketplace** | **$250/pack/mo** | Healthcare, FinTech, Audit verticals |

**Expansion levers:**
- More warehouse nodes / connectors  
- More seats (analysts + CEO Chat users)  

## 8.2 Recommended Que pricing ladder (aligned with IdeaProof + your stack)

| Tier | Monthly (annual bill) | Includes | vs competitors |
|------|----------------------|----------|----------------|
| **Starter / Sandbox** | **$0** (14-day or freemium) | SportEdge demo workspace, Monk preview, read-only CEO chat | 88% of AI tools ship free plan — IdeaProof expects it |
| **Growth** | **$999/mo** | 3 sources, 1 industry pack, 2 steward seats, Monk cert, Genie, dbt export | Above Weld ($99) — full KPI automation |
| **Team** | **$1,499/mo** | 8 sources, 2 packs, 5 seats, scheduled jobs, orchestrator webhook | Between Growth and Enterprise |
| **Enterprise** | **$2,500–$4,000/mo** | SSO/SCIM, ABAC, CMK, SIEM, private runner, SOC2 evidence pack | vs Hevo enterprise ~$239+ scaled |
| **Pack add-ons** | **$250/pack/mo** each | Finance, Healthcare, Audit templates + golden eval | Marketplace density play |

**Seat overage:** $79–$129/seat/mo (align with `billing.js` Stripe seat price when configured).

**Implementation note:** Que today has Stripe seat billing hooks (`STRIPE_PRICE_SEAT`) but **no public pricing page** — IdeaProof first step: *“Publish pricing page and onboarding tier in app console.”*

## 8.3 What NOT to do

- Race Airbyte to **$10/mo** — you sell **labor replacement** ($150k+ data engineer FTE), not connector volume  
- Price below **$19.99/mo AI agent median** without a wedge story  
- Enterprise discount before SOC 2 Type II unless paid pilot with large ACV  

---

# 9. Unit economics

| Metric | IdeaProof base case | Conservative | Aggressive |
|--------|---------------------|--------------|------------|
| **CAC** | $12,000 | $19,200 (+60%) | $9,000 (−25%) |
| **LTV** | $54,000 | $35,100 (−35%) | $67,500 (+25%) |
| **LTV:CAC** | **4.5:1** ✅ | 1.8:1 ⚠️ | 7.5:1 |
| **Break-even** | 14–18 months | — | — |
| **Startup costs** | $75k–$120k | Infra + LLM + compliance scaffolding | — |
| **Y3 revenue target** | $2.4M | — | — |
| **Y5 trajectory** | Up to ~$10M in model | — | — |

**CAC payback discipline:** Target **10–12 months** on mid-market outbound.

**Persona willingness to pay (IdeaProof ICP):** **$1,000–$3,000/mo** — your $999 Growth tier sits at the **floor** of that band (good for land; expand via packs + seats).

---

# 10. Action plan — adaptation status in Que

| IdeaProof action | Horizon | Que status | Evidence / next step |
|------------------|---------|------------|----------------------|
| Publish 3 design partner case studies (<4hr KPI) | This week | 🔶 **Partial** | Metrics exist; **no published PDF case studies** — create `/customers` or Notion pack |
| Start SOC 2 Type II audit window | This month | 🔶 **Scaffolding** | `soc2Evidence.js`, `/compliance`, `/settings/enterprise` — **no auditor engaged** |
| Self-serve sandbox (Neon + ecommerce) | This month | ✅ **Mostly built** | `bootstrap:sportedge-all`, demo workspace, SportEdge fixtures — add **public signup sandbox** |
| Instrument telemetry on 3 paid partners | This week | 🔶 **Partial** | Audit log, ops metrics exist — **dedicated join recall / latency dashboard** for partners |
| SOC 2 readiness docs for procurement | 30 days | ✅ **Docs exist** | `COMPLIANCE-PROCESS.md`, evidence export — publish customer-facing pack |
| Expand Healthcare + Finance packs | 60–90 days | ✅ **Templates exist** | `healthcare-v1`, `finance-v1` packs — need **golden proof datasets** like SportEdge |
| Airflow/Dagster integration templates | Quick win | ✅ **Shipped recently** | Webhook + `api/exporters/airflow/que_job_run_operator.py` |
| Live prod E2E (Monk → CEO → Genie) | Credibility | ✅ **Shipped** | `npm run test:monk-prod` |
| SSE Monk + transform HITL in Clean | Credibility | ✅ **Shipped** | Async Monk, `/events/stream`, approve-before-apply |

**Legend:** ✅ Built · 🔶 Partial · ❌ Not started

---

# 11. Quick wins

| Quick win (IdeaProof) | Effort | Expected outcome | Que adapting? |
|----------------------|--------|------------------|---------------|
| Publish 3 design partner benchmark summaries | Low | +15–20% outbound response | ❌ **Not yet** — highest GTM priority |
| Airflow/Dagster integration templates | Medium | −50% POC time | ✅ **Yes** — webhook + Python operator template |

---

# 12. Discovery & investor Q&A

## 12.1 IdeaProof “Key Interview Questions” — suggested answers for Que

**Q1: How many hours per week do you spend maintaining broken table joins and fixing pipeline schema drift?**

**A (for your ICP):** Mid-market stewards report **10–20+ hours/week** on ad-hoc joins and drift firefighting. Que reduces this via: automated join inference (Join Review inbox), **drift agent** alerts, and **contract-frozen jobs** with attestation on export. Target: **≥50% reduction** after Monk cert (measure via partner telemetry).

---

**Q2: What is your current process for certifying that a new business metric is mathematically accurate?**

**A:** Today most teams use **manual SQL review + spreadsheet sign-off**. Que provides: metric registry from industry packs, **golden set eval** (recall/promoted-recall on `/eval`), **pack certification gate** in Monk, steward inbox for quality issues, and **HITL transform approve → apply** before jobs go live.

---

**Q3: How do non-technical leaders currently access ad-hoc warehouse insights?**

**A:** Usually **Slack ping to analyst** or static dashboards that lag weeks. Que **CEO Chat mode** answers in plain English with **live warehouse reads** (rows not sent to LLM on main path); **Genie** on every page for contextual actions; pre-built **CEO Revenue Dashboard** from ecommerce pack.

---

## 12.2 IdeaProof “Unknowns to close” — investor/customer questions

**Q4: How quickly can the team deliver full SOC 2 Type II compliance?**

**A:** **Controls scaffolding exists today** (SSO, SCIM, ABAC, audit log, CMK, SIEM export, evidence pack generator). **Type II requires 6–12 month observation period** with an accredited auditor — cannot be “shipped” as a feature. Honest timeline: **start audit window this quarter → report in 9–12 months** if resourced. Until then: sell **design partners + evidence pack**; don’t claim certified.

---

**Q5: What is the ongoing LLM token cost per customer workspace relative to subscription revenue?**

**A:** Que uses LLM ** selectively** — transform drafts, optional agent plans, mapping assist. Core Monk/join inference is **heuristic + rules**; CEO chat uses guarded SQL path. Model: **~$500–$1,500/mo total inference** at IdeaProof scale (4-person team), **<<$50–$150/workspace/mo** at tens of workspaces if prompts capped. Target: **LLM COGS <10% of ARR** on Growth tier — enforce via workspace settings, scrub samples, and dry-run limits.

---

**Q6: Can join inference maintain ≥0.90 golden recall on customized ERP schemas?**

**A:** **Proven on SportEdge** (16 golden pairs, ecommerce pack). Custom ERP schemas vary — IdeaProof marks this as **critical hypothesis**. Que gates auto-promote on policy; **human promote** fills gaps. Journey target: **≥85% promote rate** on first 500 suggestions; golden recall **≥0.90 on certified packs**. Expand golden pairs per vertical (finance/healthcare) — **P2 gap**.

---

**Q7: How easily can stewards export to dbt without lock-in?**

**A:** **Built-in:** dbt bundle export, manifest assist, GitHub PR exporter, attestation on artifacts. Journey hypothesis #1: *“Exporting clean models to dbt prevents vendor lock-in objections.”* — status **To Validate** in IdeaProof board. **Demo this in every enterprise technical review.**

---

**Q8 (Show 1 more — from locked section):** Will open-source (Airbyte/n8n) make Que redundant?

**A:** OSS wins **commodity extraction and orchestration**. Que wins **vertical certification + HITL semantic layer + CEO outcomes** — workflows OSS doesn’t productize. Partner with Airflow/Dagster via webhook; export to dbt; **don’t compete on connector count alone**.

---

# 13. Journey hypotheses (5 of 6 resolved in IdeaProof board)

| Hypothesis | Status | Target | Que action |
|------------|--------|--------|------------|
| dbt/GitHub export prevents lock-in objections | **To Validate** | 100% security review clearance | Lead enterprise demos with export + attestation |
| Stewards approve ≥85% of AI-suggested joins | **Confirmed** | ≥85% promote rate | Track in `/joins` analytics; golden eval dashboard |
| Mid-market pays **$999/mo** for pack automation | **Critical — testing** | ≥4 LOIs/contracts | Outbound to 15 data leaders (IdeaProof script) |
| Outbound to single-steward teams >10% demo rate | **High** | ≥10 demos / 100 outbounds | Case studies + sandbox link in outreach |
| CEOs query Chat weekly | **Confirmed** | ≥3 CEO queries/week/account | Monitor `/chat` CEO mode WAU per workspace |
| Avoid DataRobot-style commoditization | **False** (risk remains) | NRR ≥110% | Double down on frozen contracts + packs, not generic chat |

---

# 14. Roadmap, team, risks & exit

## 14.1 Execution roadmap (IdeaProof)

| Milestone | Timing | Cost est. | Risk |
|-----------|--------|-----------|------|
| Convert 3 design partners → multi-year contracts | Month 1–2 | $10k | Medium |
| SOC 2 Type II certification complete | Month 3–5 | $25k | Medium |
| Marketplace for third-party ontology packs | Month 6–8 | $40k | Low |

**Critical path (IdeaProof):**
- Harden private runner HMAC  
- Automated drift agent in production  
- SOC 2 Type II report  

**Current Que status:** v1 `ed8b4f9` live; private runner + drift exist; SOC 2 scaffolding only.

## 14.2 Team (IdeaProof recommendation: 4 people)

- Founding data infrastructure engineer  
- Founding AI/LLM systems engineer  
- Full-stack frontend (React/canvas)  
- Founding GTM / customer success  

## 14.3 Strategic partners & channels

| Partner | Type | Link |
|---------|------|------|
| Neon | Warehouse hosting | [neon.tech](https://neon.tech) |
| Snowflake | Warehouse | [snowflake.com](https://www.snowflake.com) |
| Databricks | Warehouse | [databricks.com](https://www.databricks.com) |
| Airflow / Dagster | Orchestration distribution | [airflow.apache.org](https://airflow.apache.org) · [dagster.io](https://dagster.io) |
| dbt Slack / Locally Optimistic | Community GTM | Community channels |

## 14.4 Exit (IdeaProof model)

| Field | Estimate |
|-------|----------|
| Exit value | **$50M–$150M** |
| Timeline | 4–6 years |
| Basis | 6–10× ARR |
| Likely acquirers | **Databricks**, **Snowflake**, **Fivetran** |
| Value drivers | Proprietary ontologies, schema graph, NRR, governance + trust gates |

---

# 15. Product improvement backlog (from IdeaProof suggestions)

Priority order for engineering + GTM:

| # | Improvement | Maps to IdeaProof | Effort |
|---|-------------|-------------------|--------|
| 1 | **Published case studies** (3 design partners, <4hr KPI) | Action plan #1, Quick win | GTM — 1 week |
| 2 | **Public pricing page + in-app tier gates** | Financials first step | Product — 1–2 weeks |
| 3 | **Self-serve signup sandbox** (Neon SportEdge, no sales call) | Action plan #3 | Eng — 2–3 weeks |
| 4 | **SOC 2 Type II auditor engaged** | Red flag #1 | Legal/Ops — 1 month to start |
| 5 | **Partner telemetry dashboard** (recall, latency per workspace) | Execution horizon | Eng — 2 weeks |
| 6 | **Unlock 11 more competitor teardowns internally** | Market step 2 (100 credits) | Buy IdeaProof credits OR manual research |
| 7 | **Healthcare/finance golden datasets** | 60–90 day pack expansion | Eng — 4–6 weeks |
| 8 | **BigQuery live validate + Salesforce depth** | Competition parity | Eng — P1 roadmap |
| 9 | **Product Hunt + AlternativeTo launch** | Distribution tier 1 | GTM — 1 week |
| 10 | **Monthly NRR / churn dashboard** | DataRobot failure guard | Ops — ongoing |

---

# 16. Reference links index

## IdeaProof & report

| Resource | URL |
|----------|-----|
| IdeaProof home | https://ideaproof.io |
| Your dashboard (login required) | https://ideaproof.io/dashboard?ideaId=712f8f8e-a51c-4b8e-bf23-c374ba65e1da |
| Expired share link | https://ideaproof.io/s/y09TsY03ZF5V |

## Que internal docs

| Document | Path |
|----------|------|
| Documentation pack | [Que-Documentation-Pack-2026.md](./Que-Documentation-Pack-2026.md) |
| Compliance process | [COMPLIANCE-PROCESS.md](./COMPLIANCE-PROCESS.md) |
| Gaps honest list | [GAPS-CLOSED-AND-REMAINING.md](./GAPS-CLOSED-AND-REMAINING.md) |
| Manual testing | [MANUAL-TESTING-MASTER-2026.md](./MANUAL-TESTING-MASTER-2026.md) |
| GitHub repo | https://github.com/Shabrezadilabz/QUE.git |

## Competitors (commercial)

| Company | Website |
|---------|---------|
| Fivetran | https://www.fivetran.com |
| Fivetran + dbt | https://www.fivetran.com/dbt |
| Airbyte | https://airbyte.com |
| Hevo Data | https://hevodata.com |
| Stitch (Talend) | https://www.stitchdata.com |
| Weld | https://weld.app |
| dbt Labs | https://www.getdbt.com |
| Atlan | https://atlan.com |
| Collibra | https://www.collibra.com |
| Monte Carlo | https://www.montecarlodata.com |
| Looker | https://cloud.google.com/looker |

## Open source / orchestration

| Project | Website |
|---------|---------|
| Kestra | https://kestra.io |
| Prefect | https://www.prefect.io |
| Dagster | https://dagster.io |
| Apache Airflow | https://airflow.apache.org |
| n8n | https://n8n.io |
| Benthos (Redpanda Connect) | https://www.redpanda.com/redpanda-connect |

## Failed / cautionary (IdeaProof corpus)

| Company | Website | Note |
|---------|---------|------|
| C3.ai | https://c3.ai | Slow enterprise AI adoption |
| DataRobot | https://www.datarobot.com | AutoML commoditization |
| Inflection AI | https://inflection.ai | Acqui-hire vs ChatGPT |
| 23andMe | https://www.23andme.com | One-time revenue + trust loss |
| Hopin | https://hopin.com | Pandemic tailwind gone |

## Data / research sources (IdeaProof citations)

| Source | URL |
|--------|-----|
| TAMI.ai (data quality cost) | https://tami.ai/data-integration-tools/ |
| StackScored (pricing intel) | Referenced via IdeaProof for Hevo/Stitch/Airbyte |
| The GTM Directory (Weld pricing) | Referenced via IdeaProof |
| Crunchbase News (CAC benchmarks) | Referenced for $12k CAC |
| EU Data Act | https://eur-lex.europa.eu (regulatory context) |

## Launch directories (IdeaProof Tier 1)

| Directory | URL |
|-----------|-----|
| Product Hunt | https://www.producthunt.com |
| AlternativeTo | https://alternativeto.net |
| There's An AI For That | https://theresanaiforthat.com |
| Turbo0 | https://turbo0.com |

---

## Appendix A — IdeaProof step unlock path

| Step | Name | Credits | Status |
|------|------|---------|--------|
| 1 | Idea Validation | Done | ✅ STRONG 79/100 |
| 2 | Market Analysis | 100 cr | 🔒 Locked — 15+ competitor profiles, full TAM/SAM/SOM |
| 3 | Business Plan | — | Pending |
| 4 | Brand Strategy | — | Pending |
| 5 | Visual Identity | — | Pending |
| 6 | Ad Campaign | — | Pending |

**Recommendation:** Purchase **100 credits** for Step 2 if you want IdeaProof’s full 15-competitor teardown — or use this document + manual research for the same gaps.

---

## Appendix B — One-page pitch (derived from IdeaProof)

**Problem:** Mid-market teams burn **10–20 hrs/week** reinventing schema, joins, and KPIs for every new data source — while executives wait weeks for trustworthy answers.

**Solution:** Que — connect sources → **Monk Mode** industry pack → HITL certify joins & transforms → **CEO Chat + BI** in **<4 hours**.

**Traction:** 3 design partners paid; **75–85% automation**; golden recall **≥0.90** target.

**Market:** $4.2B SAM · 15% CAGR · $999–$2,500/mo ACV.

**Ask:** Close SOC 2 Type II window · publish case studies · scale sandbox PLG.

---

*Generated from IdeaProof saved dashboard export, cross-walked with Que codebase and [Que-Documentation-Pack-2026.md](./Que-Documentation-Pack-2026.md). Update when Step 2 Market Analysis is unlocked or pricing ships publicly.*
