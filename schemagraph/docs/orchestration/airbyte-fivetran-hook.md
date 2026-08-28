# Airbyte / Fivetran → Que post-sync hook

**Strategy:** Stack Que on Airbyte/Fivetran — do not rip-replace ingest.

## Webhook

```
POST /workspaces/{workspaceId}/integrations/ingest-hook
Authorization: Bearer <que-api-key>
Content-Type: application/json

{
  "source": "fivetran",
  "connectionId": "<uuid-of-que-connection>",
  "status": "sync_end",
  "tablesSynced": 42,
  "queueMonk": true,
  "packId": "ecommerce-v1",
  "inferJoins": true
}
```

## Fivetran

1. Create Fivetran webhook on sync end
2. Point to Que ingest-hook URL
3. Map connector name → Que `connectionId` (same warehouse you loaded)

## Airbyte

1. Airbyte connection succeeds → HTTP operator
2. Body `source: "airbyte"` + Que connection UUID
3. Que runs `runPostSyncAutomation` — top joins banner + optional Monk queue

## Hevo (India)

Same pattern with `"source": "hevo"`.

## Response

```json
{
  "ok": true,
  "partner": "fivetran",
  "postSync": {
    "inferJoins": true,
    "monkQueued": true,
    "monkRunId": "...",
    "topJoins": [...]
  }
}
```
