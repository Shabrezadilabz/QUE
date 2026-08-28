# Sprint 4 — dbt + orchestration exit

**Theme:** Discovery → joins → draft jobs → export dbt (no lock-in).

| ID | Deliverable | Status |
|----|-------------|--------|
| S4.1 | dbt bundle v2 — workspace export + graph sources + CI | ✅ Shipped |
| S4.2 | Airflow operator — install docs + poll/wait | ✅ Shipped |
| S4.3 | Manifest assist v2 — column refs + lineage UI | ✅ Shipped |
| S4.4 | No lock-in kit — graph, jobs, metrics, audit | ✅ Shipped |

---

## S4.1 — dbt bundle v2

**API:** `POST /workspaces/:id/export/dbt-bundle-v2`

```json
{ "jobIds": [], "includeDrafts": true }
```

**Adds over v1 per-job export:**

- `dbt_project.yml`
- `profiles.yml.example`
- `models/sources_graph.yml` from synced connections
- Merged models/tests from all stitch jobs
- `.github/workflows/que-dbt-v2.yml`
- `que_bundle_manifest.json`

**Tests:** `npm run test:dbt-bundle` (structure validation, no dbt CLI)

**UI:** Compliance → **dbt bundle v2** download

---

## S4.2 — Airflow operator

**Path:** `api/exporters/airflow/`

| File | Purpose |
|------|---------|
| `que_job_run_operator.py` | Operator with `wait=True` poll |
| `example_dag.py` | Daily post-ingest mart DAG |
| `README.md` | Install + connection setup |

**API:** `GET /workspaces/:id/airflow/operator` — raw operator source for copy/paste

**Install:**

```bash
pip install ./schemagraph/api/exporters/airflow
# or copy que_job_run_operator.py → airflow/plugins/
```

**Connection:** `que_api` — login=workspace UUID, password=API key

---

## S4.3 — Manifest assist v2

**API:**

- `POST /workspaces/:id/dbt-manifest` — upload manifest JSON
- `GET /workspaces/:id/dbt-manifest/status` — latest ingest summary

**Enhancements:**

- Column refs from manifest nodes
- Column lineage overlay in `columnLineage.js`
- Lineage page → **dbt Manifest** tab — upload UI

---

## S4.4 — No lock-in kit

**API:** `POST /workspaces/:id/export/no-lock-in`

ZIP-equivalent JSON archive:

| Path | Contents |
|------|----------|
| `graph/` | Tables, columns, relationships |
| `jobs/` | Contracts + SQL |
| `metrics/` | Metric definitions |
| `bi/` | Report Studio charts |
| `audit/` | Audit trail (500 events default) |
| `manifest.json` | Counts + attestation |

**UI:** Compliance → **No lock-in kit** download

Document in procurement / SOC2 diligence alongside Monk evidence.

---

## Exit criteria

- [ ] dbt-native team runs `dbt parse` on exported bundle with wired profile
- [ ] Airflow example DAG triggers Que job on schedule
- [ ] Upload dbt manifest → column trace shows dbt overlay

**Next:** Sprint 5 — Salesforce + BigQuery connector depth, India connector matrix.
