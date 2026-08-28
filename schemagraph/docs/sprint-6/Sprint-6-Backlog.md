# Sprint 6 Backlog — Vertical packs + proof datasets

**Theme:** Vertical packs, join infer, HITL, CEO layer (Weld / generic AI)  
**Status:** Implemented locally  
**Plan ref:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md) § Sprint 6

---

## Deliverables

| ID | Deliverable | Status | Key files |
|----|-------------|--------|-----------|
| S6.1 | +6 Monk vertical packs → **10 total** | ✅ | `api/src/packs/logistics-v1.js`, `saas-metrics-v1.js`, `india-gst-v1.js`, `manufacturing-v1.js`, `edtech-v1.js`, `marketing-attribution-v1.js`, `packs/index.js` |
| S6.1b | Marketplace catalog ≥10 items + Monk links | ✅ | `industryTemplates.js` (`monkPackId`, `india-gst-compliance`, `manufacturing-oee`, `edtech-enrollment`) |
| S6.2 | Finance + healthcare anonymized proof datasets | ✅ | `docs/testing/finance/*`, `docs/testing/healthcare/*`, `api/src/proofDatasets.js` |
| S6.2b | Golden pairs wired to Monk cert | ✅ | `packCertification.js`, `finance-v1` + `healthcare-v1` `goldenPairSource` |
| S6.3 | Pack → Monk one-click (Marketplace → Monk in 3 clicks) | ✅ | `marketplaceMonk.js`, `POST .../marketplace/:packId/start-monk`, `MarketplacePage.tsx` Run Monk |
| S6.4 | Genie RS-2 dashboard draft → Report Studio | ✅ | `genieDashboardDraft.js`, `POST .../bi/genie-dashboard-draft`, `agentSessions.js`, `/dashboard` chat skill |

---

## Dashboard templates (RS-2 pack boards)

| Pack | Report ID | Widgets |
|------|-----------|---------|
| ecommerce-v1 | `ceo-revenue` | 5 |
| finance-v1 | `finance-recon` | 5 |
| logistics-v1 | `logistics-sla` | 5 |
| saas-metrics-v1 | `saas-metrics` | 5 |

---

## API routes added

- `POST /workspaces/:workspaceId/marketplace/:packId/start-monk`
- `GET /proof-datasets`
- `GET /proof-datasets/:datasetId`
- `POST /workspaces/:workspaceId/proof-datasets/:datasetId/seed-golden`
- `POST /workspaces/:workspaceId/bi/genie-dashboard-draft`

---

## Test

```bash
cd api && npm run test:sprint6
```

---

## Exit criteria (from plan)

- [ ] Non-SportEdge vertical demo recorded (finance or e-commerce)
- [ ] Pack attach rate tracked: % new workspaces using a pack in week 1
- [x] 10+ Monk packs listed
- [x] Finance + healthcare golden eval pairs per proof dataset
- [x] Marketplace → Monk deep link (`/monk?pack=…&run=…`)
- [x] Genie/chat scaffold opens Report Studio (`/bi?report=…`)

---

## Demo script (3-click Marketplace → Monk)

1. **Marketplace** → pick **Finance · Ledger Reconciliation** → **Run Monk**
2. Monk opens with `finance-v1` pre-selected; promote joins on **Joins**
3. Complete Monk → cert checklist → **Report Studio** (`finance-recon` board)

## Genie RS-2 demo

1. Chat or Genie: `/dashboard` or “Create a finance reconciliation dashboard draft”
2. Opens **Report Studio** with pack widgets (or generic scaffold if no certified mart)
3. Steward edits visuals → certify → Ship to BI / export
