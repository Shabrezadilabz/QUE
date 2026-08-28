# Sprint 10 Backlog — Report Studio v2 + orchestration mesh

**Theme:** Orchestration recipes + reverse ETL + RS-5 layouts  
**Status:** Implemented locally  
**Plan ref:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md) § Sprint 10

---

## Deliverables

| ID | Deliverable | Status | Key files |
|----|-------------|--------|-----------|
| S10.1 | Kestra + n8n recipe docs + webhook templates | ✅ | `orchestratorRecipes.js`, `GET .../orchestrator/recipes`, `docs/orchestration/kestra-n8n-recipes.md` |
| S10.2 | Airbyte / Fivetran native hook | ✅ | `partnerIngestHook.js`, `POST .../integrations/ingest-hook`, `docs/orchestration/airbyte-fivetran-hook.md` |
| S10.3 | Reverse ETL MVP — cert mart → Salesforce/HubSpot | ✅ | `reverseEtl.js`, `GET/POST .../reverse-etl/*` |
| S10.4 | RS-5 — layouts, parameters, refresh webhook | ✅ | `reportStudioRefresh.js`, board config routes, job-run hook, `BiChartsPage.tsx` |
| S10.5 | Looker merge kit RS-6 | ✅ | `lookerMergeKit.js`, `GET .../export/looker/merge-kit`, `docs/looker-merge-kit/` |

---

## API routes added

- `GET /workspaces/:workspaceId/orchestrator/recipes`
- `POST /workspaces/:workspaceId/integrations/ingest-hook`
- `GET /workspaces/:workspaceId/reverse-etl/plan`
- `POST /workspaces/:workspaceId/reverse-etl/push`
- `GET/PATCH /workspaces/:workspaceId/bi/boards/:reportId/config`
- `POST /workspaces/:workspaceId/bi/boards/:reportId/refresh`
- `GET /workspaces/:workspaceId/export/looker/merge-kit`

## Enhanced

- `orchestratorTrigger.js` — kinds: kestra, n8n, airbyte, fivetran
- Job run success → `onJobRunCompleteRefreshBoards`

---

## Test

```bash
cd api && npm run test:sprint10
```

---

## Exit criteria (from plan)

- [x] Kestra + n8n YAML/JSON recipes for Monk start
- [x] Airbyte/Fivetran ingest hook → post-sync automation
- [x] Reverse ETL plan + simulated push to Salesforce
- [x] Board parameters + layout presets + refresh webhook
- [x] Looker merge kit docs + sample view
- [ ] Customer runs Monk from Kestra in prod (manual)
- [ ] Live reverse ETL OAuth (post-S10)

---

## Demo script (orchestration)

1. `GET .../orchestrator/recipes` — download Kestra YAML
2. `POST .../integrations/ingest-hook` with Fivetran body → Monk queued
3. Run cert job → board refresh webhook fires

## Demo script (reverse ETL)

1. Certify SportEdge mart
2. `GET .../reverse-etl/plan?destination=salesforce`
3. `POST .../reverse-etl/push` — audit event + simulated segment

## Demo script (Looker merge)

1. `GET .../export/looker/merge-kit?reportId=sportedge-exec`
2. Copy views into sample Looker repo layout (`docs/looker-merge-kit/`)
