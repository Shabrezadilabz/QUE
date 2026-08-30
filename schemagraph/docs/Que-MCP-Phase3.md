# Que MCP — Phase 3 (certified catalog + KPI Ask)

Expose **certified** Que surfaces to Cursor, Claude Desktop, and other MCP clients so agents answer from the same cert wall as Ask / Slack `/que`.

## What ships

| Tool | Purpose |
|------|---------|
| `list_certified_metrics` | Metrics in the cert scope |
| `list_certified_charts` | Charts in the cert scope |
| `list_certified_datasets` | Datasets in the cert scope |
| `get_cert_scope` | Full CEO/cert pack snapshot |
| `ask_kpi` | Natural-language KPI Ask (`audience: ceo`) |

Engineer / Genie / live SQL tools are **not** exposed on MCP.

## Auth

Create a workspace API key with **`read`** (or `admin`) scope in Settings → API keys.

```http
Authorization: Bearer que_…
```

Keys are scoped to one workspace. Prefer `read` for MCP so agents stay viewer-grade.

## HTTP (hosted API)

Base: your Que API (e.g. `https://que-k31z.onrender.com`).

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/mcp` | Discovery |
| `GET` | `/mcp/tools` | Full tool schemas |
| `POST` | `/mcp` | JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`) |
| `POST` | `/mcp/tools/:name` | Direct tool call (body = arguments) |

Example:

```bash
curl -s -X POST "https://YOUR_API/mcp/tools/ask_kpi" \
  -H "Authorization: Bearer que_…" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What is MRR?\"}"
```

## Stdio bridge (Cursor / Claude Desktop)

From `schemagraph/api`:

```bash
export QUE_API_URL=https://que-k31z.onrender.com
export QUE_API_KEY=que_…
npm run mcp
```

Or in Cursor MCP config (`~/.cursor/mcp.json` / project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "que-cert": {
      "command": "node",
      "args": ["D:/ADC/prosols/adc/schemagraph/api/scripts/que-mcp-server.js"],
      "env": {
        "QUE_API_URL": "https://que-k31z.onrender.com",
        "QUE_API_KEY": "que_…"
      }
    }
  }
}
```

The bridge speaks MCP over **stdio** and forwards JSON-RPC to `POST {QUE_API_URL}/mcp`.

## Env

| Variable | Required | Description |
|----------|----------|-------------|
| `QUE_API_URL` | For stdio | Que API base URL |
| `QUE_API_KEY` | For stdio | Workspace API key `que_…` |
| `QUE_SLACK_DEFAULT_WORKSPACE_ID` | Optional | Fallback workspace when using session auth / local |

## Security notes

- MCP uses the same **CEO cert** path as Ask and Slack — not Engineer.
- Do not put `admin` keys in shared agent configs unless necessary.
- Rotate keys if a laptop or CI config leaks.

## Teams (later)

Microsoft Teams can reuse the same `ask_kpi` / CEO engine; not part of this phase.
