# Sprint 8 Backlog — Enterprise scale + multi-source Monk

**Theme:** Global-ready; *"create models from messy multi-source schema"*  
**Status:** Implemented locally  
**Plan ref:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md) § Sprint 8

---

## Deliverables

| ID | Deliverable | Status | Key files |
|----|-------------|--------|-----------|
| S8.1 | Multi-source Monk — Postgres/BQ + Salesforce one cert path | ✅ | `multiSourceMonk.js`, Monk discover integration, `GET .../monk/multi-source` |
| S8.2 | Replication v2 scoping — Snowflake OR Databricks read replica MVP | ✅ | `replicationV2.js`, `GET .../replication/v2/scope`, `docs/replication-v2-*.md` |
| S8.3 | SOC 2 Type II audit kickoff — pen test scheduled, evidence pack frozen | ✅ | `soc2Kickoff.js`, freeze + kickoff routes, `CompliancePage.tsx` |
| S8.4 | SCIM + OIDC hardening — idempotent provision/deprovision test suite | ✅ | `scim.js` helpers, `eval/runScimSmokeTests.js` |
| S8.5 | India enterprise SKU — INR invoice, DPA template, residency FAQ | ✅ | `enterpriseCompliance.js`, `docs/compliance/*`, `GET .../enterprise/india-compliance` |

---

## API routes added

- `GET /workspaces/:workspaceId/monk/multi-source?packId=`
- `GET /workspaces/:workspaceId/replication/v2/scope?warehouse=snowflake|databricks`
- `GET /workspaces/:workspaceId/enterprise/soc2-kickoff`
- `PATCH /workspaces/:workspaceId/enterprise/soc2-kickoff`
- `POST /workspaces/:workspaceId/enterprise/soc2-kickoff/start`
- `POST /workspaces/:workspaceId/enterprise/soc2-evidence/freeze`
- `GET /workspaces/:workspaceId/enterprise/india-compliance` (`?format=md`)

## Enhanced routes

- `GET .../monk/preview` — includes `multiSource` analysis
- `POST .../monk/start` — accepts `multiSource` flag; discover logs multi-source profile
- `GET .../enterprise/soc2-evidence` — includes `typeIIKickoff` block

---

## Test

```bash
cd api && npm run test:sprint8
cd api && npm run test:scim
```

---

## Exit criteria (from plan)

- [x] Multi-source analysis detects Postgres + Salesforce profile
- [x] Monk discover emits multi-source cert path event
- [x] Replication v2 scope plan for Snowflake and Databricks
- [x] SOC2 evidence freeze + observation kickoff API
- [x] SCIM idempotent provision smoke tests (unit, no DB)
- [x] India DPA + residency FAQ in `/compliance`
- [ ] Multi-source cert demo on stage (manual)
- [ ] Enterprise pipeline: 1 deal >₹2L/mo in late stage (GTM)

---

## Demo script (multi-source Monk)

1. Connect **Postgres** (orders/customers) + **Salesforce** (Account/Opportunity)
2. Sync both → infer cross-source joins on email/account id
3. Open **Monk Mode** — preview shows `Postgres + Salesforce` badge
4. Start Monk → discover phase logs multi-source cert path
5. Promote joins → certify → ship to BI

## Demo script (SOC2 kickoff)

1. **Compliance** → Type II kickoff panel → Start observation + schedule pen test
2. **Freeze evidence pack** — hash recorded in workspace settings
3. Download SOC2 markdown — includes `typeIIKickoff` section
