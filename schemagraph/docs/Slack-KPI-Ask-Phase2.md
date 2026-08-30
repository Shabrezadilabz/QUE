# Slack KPI Ask (Phase 2)

Execs ask **certified KPIs** from Slack — same engine as Que **Ask** (viewer / CEO cert guard). Builders keep Engineer chat + Genie in the app.

## What you get

| Surface | Path |
|---------|------|
| Slash `/que what was revenue?` | `POST /webhooks/slack/commands` |
| `@Que …` mention / DM | `POST /webhooks/slack/events` |
| Join Approve/Reject (existing) | `POST /webhooks/slack/interactions` |

Reply includes the cert answer plus buttons: **Open Ask in Que** and **BI / chart**.

## Render / API env

```bash
SLACK_SIGNING_SECRET=…
SLACK_BOT_TOKEN=xoxb-…
QUE_APP_URL=https://your-app.vercel.app
QUE_PUBLIC_API_URL=https://your-api.onrender.com

# Option A — single team
QUE_SLACK_TEAM_ID=T0123ABCD
QUE_SLACK_DEFAULT_WORKSPACE_ID=22222222-2222-2222-2222-222222222222

# Option B — map (overrides / multi-team)
# QUE_SLACK_TEAM_WORKSPACE_MAP=T0123:uuid,T0456:uuid
```

Or in **Settings → Automation / Slack**: set **Slack Team ID** on the workspace (and optional channel allowlist).

## Slack app setup

1. Create/open a Slack app → **OAuth & Permissions**  
   Bot scopes: `commands`, `chat:write`, `app_mentions:read`, `im:history` (for DMs).  
2. **Slash Commands** → Create `/que`  
   Request URL: `{QUE_PUBLIC_API_URL}/webhooks/slack/commands`  
3. **Event Subscriptions** → On  
   Request URL: `{QUE_PUBLIC_API_URL}/webhooks/slack/events`  
   Subscribe: `app_mention`, `message.im`  
4. **Interactivity** (existing joins):  
   `{QUE_PUBLIC_API_URL}/webhooks/slack/interactions`  
5. Install app to workspace; copy **Signing Secret** + **Bot Token**.

## Smoke test

1. Deploy API with env above; set Team ID in Settings.  
2. In Slack: `/que help`  
3. `/que show me certified revenue` (expects Monk cert or glossary reply — same as Ask).  
4. `@Que what are our KPIs?` in a channel.

## Security notes

- Answers always use `audience: 'ceo'` (cert-only).  
- Channel allowlist optional.  
- No Slack user → Que login yet; treat channel membership as the trust boundary for v1.  
- Phase 3 (later): MCP tools for Cursor/Claude.
