# Kestra + Que — Monk after sync

Run Que Monk Mode from Kestra after your warehouse sync completes.

## Prerequisites

- Que API token with `member` role
- Workspace ID and connection already synced in Que

## Recipe

```bash
GET /workspaces/{workspaceId}/orchestrator/recipes
```

Copy the `kestra.yaml` template. Set secrets:

- `QUE_API_TOKEN` — workspace API key
- Webhook trigger key — match your ingest partner

## Flow

```
Fivetran/Airbyte sync → Kestra webhook → POST .../monk/start → Monk discover → cert
```

## Optional: ingest hook instead

If you prefer Que to infer joins automatically:

```
POST /workspaces/{id}/integrations/ingest-hook
{ "source": "airbyte", "connectionId": "...", "queueMonk": true }
```
