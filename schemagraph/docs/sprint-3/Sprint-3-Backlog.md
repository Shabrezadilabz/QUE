# Sprint 3 — Certified KPI + BI loop

**Theme:** End-to-end certified KPIs + BI, not just load (Hevo gap).

| ID | Deliverable | Status |
|----|-------------|--------|
| S3.1 | Cert → metric def → golden eval wired at Monk completion | ✅ Shipped |
| S3.2 | Ship-to-BI happy path (Looker + Metabase + embed) | ✅ Shipped |
| S3.3 | Semantic layer export (metrics YAML + dbt semantic stub) | ✅ Shipped |
| S3.4 | Steward cert checklist UI + gate re-certify / ship | ✅ Shipped |
| S3.5 | Report Studio RS-1 — auto-scaffold certified charts from pack | ✅ Shipped |

---

## S3.1 — Certified KPI completion loop

After pack cert **passes**, `runCertifiedKpiCompletion` runs:

1. Certify pack KPI metrics (`monk-mode` / `pack` tags)
2. Certify brand-revenue mart (managed dataset)
3. Seed Report Studio charts from pack templates (`certify: true`)
4. Schedule SportEdge golden eval
5. Export semantic layer bundle
6. Run post-cert deliverables (dbt, replication, BI platform export)

**Wiring:** `monkAutopilot.js` → `certCompletionLoop.js` on cert pass.

---

## S3.2 — Ship-to-BI happy path

**API:** `POST /workspaces/:id/ship-to-bi/certified-pack`

```json
{ "packId": "ecommerce-v1", "reportId": "ceo-revenue" }
```

Returns Looker pack, Metabase dashboard JSON, approved ship event with embed token.

**Gate:** `canShipToBi` — checklist all green + cert status `passed`.

**UI:** Monk Mode → Steward cert checklist → **Ship to BI (Looker + Metabase)**.

---

## S3.3 — Semantic layer export

**API:** `GET /workspaces/:id/semantic-layer/export?packId=ecommerce-v1`

- `metrics.yaml` — Que semantic v1
- `dbt_semantic.json` — dbt semantic layer stub

Add `?format=yaml` for raw YAML download.

---

## S3.4 — Steward cert checklist

**API:** `GET /workspaces/:id/cert-checklist?packId=...`  
Also included on `GET .../monk/certification`.

| Gate | OK when |
|------|---------|
| Joins reviewed | 0 pending AI-inferred suggestions |
| Transforms approved | 0 pending transform drafts |
| Golden eval pass | Cert passed or recall ≥ pack min |
| KPI metrics certified | ≥1 pack metric certified |
| Report Studio charts | ≥3 certified charts (or none seeded yet) |

- Re-run certify **blocked** in UI until checklist green
- Ship-to-BI blocked until `canShipToBi`

---

## S3.5 — Report Studio RS-1

**Fix:** `dashboardTemplates.js` — `reportId` scoping bug (was set before loop).

**Enhancement:** `seedDashboardsFromPack(..., { certify: true })` marks charts certified when mart is certified.

**API:** `POST .../dashboards/seed-from-pack` accepts `{ certify: true }`.

---

## Exit criteria (demo)

- [ ] SportEdge: revenue KPI certified → golden eval pass → BI artifact exported
- [ ] Certified mart → Report Studio (≥3 charts) → Metabase or Looker export
- [ ] Sales demo under 15 minutes for cert + CEO question

---

## Key files

| Area | Path |
|------|------|
| Completion loop | `api/src/certCompletionLoop.js` |
| Checklist | `api/src/certChecklist.js` |
| Semantic export | `api/src/semanticLayerExport.js` |
| Ship happy path | `api/src/shipToBi.js` → `shipCertifiedPackToBi` |
| Dashboard seed fix | `api/src/dashboardTemplates.js` |
| UI | `src/components/monk/CertChecklistPanel.tsx`, `MonkModePage.tsx` |
