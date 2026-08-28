# Case study template — Finance / FinTech

**Status:** Draft — use after S6 finance proof dataset.

---

## Headline

How [Company] went from messy ERP + CRM to certified **ARR / cash KPIs** without hiring a data team.

---

## Snapshot

| | |
|---|---|
| **Industry** | FinTech / B2B SaaS / NBFC |
| **Team size** | 100–400 employees |
| **Data team** | 1 steward |
| **Stack before** | Fivetran + spreadsheets + ad-hoc SQL |
| **Stack after** | Fivetran + **Que** (graph, cert, semantic export) |
| **Pack used** | Finance v1 |
| **Time to certified KPI** | ___ hours |

---

## Problem

- Salesforce + Postgres + finance uploads didn't share a join graph.
- Metrics defined differently in Excel vs warehouse.
- Compliance asked for lineage and change control on KPI definitions.

---

## Solution (Que)

1. Connected Salesforce + Postgres; Que inferred customer/account joins.
2. **Finance pack** Monk → transform HITL on clean phase.
3. **Metric registry** + semantic YAML export for dbt/Looker.
4. **Scheduled golden eval** on certified marts (S7 — note if pilot).

---

## Results

- Single certified **ARR / revenue** definition.
- dbt bundle exported — no lock-in fear.
- Steward DQ dashboard (when S7 live): golden pass rate visible.

---

## Quote (placeholder)

> "___"  
> — **Name**, CFO / Head of Data, Company
