# Salesforce field mapping — Sprint 5

Que syncs **schema + capped samples** (not full replication). Use `fieldMap` to control which fields appear in the graph and incremental SOQL.

## Connection config (`config_json`)

```json
{
  "mode": "live",
  "instanceUrl": "https://yourorg.my.salesforce.com",
  "token": "<oauth access token>",
  "incrementalSync": true,
  "objects": ["Account", "Contact", "Opportunity", "Lead"],
  "fieldMap": {
    "Account": ["Id", "Name", "Industry", "AnnualRevenue", "SystemModstamp"],
    "Contact": ["Id", "Name", "Email", "AccountId", "SystemModstamp"],
    "Opportunity": ["Id", "Name", "Amount", "StageName", "CloseDate", "AccountId"]
  },
  "sampleLimit": 5
}
```

## Incremental behavior

- First sync: latest rows by `SystemModstamp` (up to `sampleLimit`).
- Subsequent syncs: `WHERE SystemModstamp > :cursor` per object.
- Cursor stored in `sfSyncState.objects[ObjectName].lastModstamp` on the connection (encrypted config).

## India GTM pattern

1. Customer keeps **Hevo/Fivetran** for Salesforce → warehouse load.
2. Que connects **read-only** to Salesforce (or reads BQ mirror) for **join inference + Monk packs**.
3. Steward maps CRM objects to **ecommerce-v1** / **finance-v1** entity templates.

## Limits (honest)

| Que | Fivetran |
|-----|----------|
| Describe + 5–10 sample rows/object | Full object replication |
| Join infer + HITL promote | None |
| Monk cert KPI loop | None |

For full CRM replication, keep Fivetran/Hevo — Que adds the steward layer on top.

## API

- `POST /workspaces/:id/connections/:id/sync` — runs incremental when `incrementalSync !== false`
- `POST /workspaces/:id/connections/:id/validate-live` — smoke test describe + samples
