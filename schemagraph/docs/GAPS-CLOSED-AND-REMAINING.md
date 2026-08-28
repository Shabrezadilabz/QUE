# Gaps closed vs remaining (honest)

**Updated:** Phase 2 complete (Sprints S1–S12 implemented locally)

## Closed in product (P0 + P1 + P2 + Phase 2)

| Gap | Surface |
|-----|---------|
| Org Rules (Cursor-like) | `/rules` + learn-from-Promote + injected into AI |
| Approve/diff queue | `/proposals` (unified + side-by-side diff) |
| Transform NL → SQL HITL | `/transforms` |
| Semantic metrics → BI | `/metrics` + lineage-to-metric graph |
| Eval harness dashboard | `/eval` + scheduled golden eval + **`/eval/public`** |
| Industry packs marketplace | `/marketplace` (10+ packs + install history) |
| Join comments + threads | Join Review discussion (reply threads) |
| Multiplayer presence | **`PresenceBar`** + join review co-edit lock (S11) |
| Public status / sales | `/status`, `/sales`, **`/gtm/global`** case studies |
| Offer A warehouse digests | `/compliance` + chat Offer A strip |
| Connector retries / SLA | `syncWithRetries` + `/connector-reliability` |
| SaaS backup + DR drills | `/compliance` ops checklist |
| BI embed viewer | `/embed/:token` + **embed SDK (S12)** |
| Multi-source Monk | S8 — Postgres + Salesforce cert path |
| Replication v2 scope | S8/S9 — Snowflake + Databricks plans |
| India commerce connectors | S9 — Shopify, Razorpay, Zoho fixtures |
| Report Studio RS-3–RS-8 | S9–S12 — boards, 4-way export, merge kit, marketplace |
| Orchestration + reverse ETL | S10 — Kestra/n8n, Fivetran hook, reverse ETL MVP |
| Billing metering (INR) | S11 — `/billing/metering` |
| Load test CI | S11 — `npm run test:load` (50 workspaces) |
| On-call runbook | S11 — `docs/ops/on-call-runbook.md` |
| Private runner hardening | S11 — health probe + install guide |
| Connector long-tail honesty | S12 — 25+ types on `/connectors/matrix` |
| Pack Studio fork/diff/merge | S12 — pack-studio API + UI |
| SOC2 observation tracking | S12 — `POST .../soc2-kickoff/complete` |

## Cannot be closed by code alone

| Item | Why |
|------|-----|
| SOC 2 Type II **certificate letter** | Independent auditor + 6–12 mo observation (kickoff tracked in product) |
| Pen test report | External security firm |
| RS-8 **demo video recording** | Manual GTM asset (`docs/gtm/rs8-demo-script.md` ready) |
| Full Fivetran 500+ connector ingest | Stack playbook; Que wins post-sync |
| Long-tail connectors marked roadmap | Honest matrix — live count 11+, types listed 25+ |
| Full multi-region SaaS DR | Evidence scaffolding ≠ full platform HA |
| Live cursors / CRDT collab | S11 shipped heartbeat + soft lock; full realtime is later |
| Razorpay live invoice links | Metering preview shipped; live payment rail optional |

## Production stance

Que is **pilot-ready** and **Phase 2 feature-complete** per [Que-Competitive-Sprint-Plan-2026.md](./Que-Competitive-Sprint-Plan-2026.md).

**Next ops steps (not code):**

1. **Git push** — S1–S12 local implementation to `main`
2. **Weekly CI** — confirm `test:sprint8`–`test:sprint12`, `test:load`, `test:monk-prod` green on prod URL
3. **Record RS-8 demo** — 20-min Monk → Report Studio → Looker export
4. **3 paying design partners** — India GTM cadence from sprint plan
