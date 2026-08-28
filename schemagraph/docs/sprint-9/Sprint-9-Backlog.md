# Sprint 9 Backlog — Report Studio v1 + India connector trio

**Theme:** Looker-grade outcomes via Report Studio + export — not a Looker clone  
**Status:** Implemented locally  
**Plan ref:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md) § Sprint 9

---

## Deliverables

| ID | Deliverable | Status | Key files |
|----|-------------|--------|-----------|
| S9.1 | Replication v2 E2E — Snowflake + Databricks simulated run | ✅ | `replicationV2.js` (`runReplicationV2`), `POST .../replication/v2/run`, Pack Studio E2E buttons |
| S9.2 | Report Studio RS-3 — multi-chart board, filters, drill-to-SQL, cert-only picker | ✅ | `SPORTEDGE_EXEC_DASHBOARD`, `buildBiChartDrillSql`, `BiChartsPage.tsx` |
| S9.3 | RS-4 — Power BI + Tableau export | ✅ | `biPlatformExport.js`, `GET .../export/powerbi`, `GET .../export/tableau` |
| S9.4 | Shopify + Razorpay + Zoho connectors (fixture) | ✅ | `connectors/shopify.js`, `razorpay.js`, `zoho.js`, fixtures, `syncConnection.js` |
| S9.5 | Mongo + warehouse join path in graph | ✅ | `MULTI_SOURCE_PROFILES` mongodb-postgresql/bigquery in `multiSourceMonk.js` |

---

## API routes added

- `GET /workspaces/:workspaceId/bi/charts/:chartId/drill-sql`
- `POST /workspaces/:workspaceId/replication/v2/run`
- `GET /workspaces/:workspaceId/export/powerbi`
- `GET /workspaces/:workspaceId/export/tableau`

---

## Test

```bash
cd api && npm run test:sprint9
```

---

## Exit criteria (from plan)

- [x] Snowflake + Databricks replication v2 E2E plan + simulated run
- [x] SportEdge 5-chart exec board template
- [x] Drill-to-SQL on certified charts
- [x] One board → Looker + Metabase + Power BI + Tableau export paths
- [x] Shopify / Razorpay / Zoho fixture sync
- [x] MongoDB + Postgres multi-source Monk profile
- [ ] Live JDBC replication (production hardening — post-S9)
- [ ] 3 India sandboxes E2E with join infer demo (manual)

---

## Demo script (Report Studio → 4 exports)

1. Run Monk on SportEdge → seed `sportedge-exec` board
2. Open **Report Studio** (`/bi?report=sportedge-exec`) — 5 visuals
3. Select chart → **Drill-to-SQL** panel in right rail
4. Home ribbon → Export Looker / Metabase / Power BI / Tableau
5. Pack Studio → Run Snowflake + Databricks v2 E2E

## Demo script (India commerce connectors)

1. Add connections: Shopify, Razorpay, Zoho (fixture mode)
2. Sync each → schema graph shows orders + payments + invoices
3. Run join infer → link `orders.customer_id` / payment receipt / invoice contact
