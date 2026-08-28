# Sprint 5 — Connector depth (India-first)

**Theme:** Narrow connector wins — depth beats checkbox count.

| ID | Deliverable | Status |
|----|-------------|--------|
| S5.1 | Salesforce incremental sync + field mapping doc | ✅ Shipped |
| S5.2 | BigQuery liveExec + query-history join assist | ✅ Shipped |
| S5.3 | Connector matrix page (honest vs Fivetran/Hevo) | ✅ Shipped |

---

## S5.1 — Salesforce incremental

**Config keys:**

| Key | Purpose |
|-----|---------|
| `incrementalSync` | Default `true` — SystemModstamp cursor per object |
| `fieldMap` | Per-object field allowlist |
| `objects` | sObject allowlist |
| `sfSyncState` | Auto-persisted cursor (do not set manually) |

**Doc:** [Salesforce-Field-Mapping.md](./Salesforce-Field-Mapping.md)

**Code:** `connectors/salesforce.js` → `runSalesforceIncrementalSamples`, `applySalesforceFieldMap`

---

## S5.2 — BigQuery depth

| Feature | Path |
|---------|------|
| `liveExec` | `connectors/bigquery.js` → `runReadonlyQuery`; wired in `liveExec.js` |
| Query-history joins | `connectors/bigqueryQueryJoins.js` |
| Sync hook | `syncConnection.js` when `bigqueryQueryJoinAssist !== false` |
| Validate | `POST .../connections/:id/validate-live` |

**Sample validate:** runs INFORMATION_SCHEMA probe + 1-row live SELECT.

---

## S5.3 — Connector matrix

**Public page:** `/connectors`  
**API:** `GET /connectors/matrix`

Linked from Sales page. Positions Que vs Fivetran vs Hevo with India notes.

---

## Exit criteria

- [ ] SF sandbox: sync with fieldMap → incremental second sync updates samples
- [ ] BQ: validate-live passes; optional join suggestions from job history
- [ ] Sales uses `/connectors` in deck — no over-promise on 700 connectors

**Next:** Sprint 6 — +6 marketplace packs, proof datasets, Genie RS-2.
