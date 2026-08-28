# Sprint 2 — Post-ingest intelligence

**Theme:** Better when you need joins, packs, cert KPIs, CEO chat **after sync**.

| ID | Deliverable | Status |
|----|-------------|--------|
| S2.1 | Post-sync automation (infer + webhook + optional Monk queue) | ✅ Shipped |
| S2.2 | CEO/Genie certified-only guardrail | ✅ Shipped |
| S2.3 | After-sync demo script | ✅ Doc below |
| S2.4 | Top-5 join banner on Sources after sync | ✅ Shipped |

---

## S2.1 — Post-sync automation

**Settings** (workspace → Settings → Automation, or API patch):

| Setting | Default | Purpose |
|---------|---------|---------|
| `inferJoinsOnSync` | `true` | Infer joins after sync (existing) |
| `postSyncWebhookUrl` | `''` | POST JSON on sync complete |
| `postSyncQueueMonk` | `false` | Auto-start Monk after sync |
| `postSyncMonkPackId` | `ecommerce-v1` | Pack for queued Monk |

**Per-connection** (`config_json`):

| Key | Values |
|-----|--------|
| `postSyncInferJoins` | `true` / `false` / omit (inherit workspace) |
| `postSyncQueueMonk` | `true` / `false` / omit |
| `postSyncWebhookUrl` | override workspace webhook |

**Webhook payload:**

```json
{
  "event": "que.connection.sync_complete",
  "workspaceId": "...",
  "connectionId": "...",
  "suggestedJoins": 5,
  "topJoins": [{ "id": "...", "label": "orders.customer_id → customers.id" }],
  "monkRunId": null
}
```

**Airflow / n8n:** trigger on this webhook → optional downstream job (S4/S10 expand).

---

## S2.2 — CEO certified guardrail

- CEO audience (`audience: "ceo"`) uses **certified marts + glossary only**.
- Live SQL blocked if tables not in certified scope.
- Uncertified KPI questions → reply: run Monk first.
- Toggle: `ceoChatCertifiedOnly` (default `true`).

Engineer audience unchanged.

---

## S2.3 — After-sync demo script (5 min)

See [After-Sync-Demo-Script.md](./After-Sync-Demo-Script.md).

---

## Exit criteria

- [ ] Hevo/Fivetran warehouse → Que read-only connect → sync → banner → joins → Monk
- [ ] CEO chat blocked before cert; works after SportEdge cert
- [ ] `test:monk-prod` green on staging

**Next:** Sprint 3 — cert → metric → golden eval → Report Studio RS-1.
