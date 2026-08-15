# CEO smoke + free-pilot ops checklist

Schema-first HITL. No lake custody claims.

## Local smoke (5–10 min)

1. **API + UI** — `api` on `:8787`, app on `:5174`; migrate includes `038_ceo_outcome_ship.sql`.
2. **Outcome** — `/outcome` → Build plan → **Infer joins (HITL)** → **Run next step**.
3. **Agent** — Settings → enable Stitch Agent → new Outcome → **Approve agent plan & run** → Promote on `/joins` if Yellow/Red → **Advance agent**.
4. **Ship** — `/ship` draft → Approve → link `jobId`/`materializationId` → Rollback (optional DROP).
5. **Slack (optional)**  
   - Webhook-only: Settings webhook URL → URL Approve/Reject.  
   - Interactive: `SLACK_BOT_TOKEN` + Settings channel + Interactivity URL  
     `{QUE_PUBLIC_API_URL}/webhooks/slack/interactions` + `SLACK_SIGNING_SECRET`.

## Free deploy ops (you do in dashboards)

| Step | Where | Notes |
|------|--------|--------|
| Postgres + pgvector | Neon free | Create DB; copy `DATABASE_URL` |
| API | Render free | `render.yaml` or Docker; set secrets below; expect sleep |
| FE | Vercel Hobby | Root `schemagraph/`; `VITE_STITCH_API_URL` = Render URL |
| Migrate | Render shell / one-off | `cd api && npm run migrate` |
| CORS | Render env | `QUE_CORS_ORIGINS` = Vercel URL |

### Required env (API)

```text
DATABASE_URL=
QUE_SECRETS_KEY=
QUE_ATTESTATION_HMAC_SECRET=
QUE_CORS_ORIGINS=https://….vercel.app
QUE_APP_URL=https://….vercel.app
QUE_PUBLIC_API_URL=https://….onrender.com
QUE_SEED_DEMO_USERS=true
```

### Optional Slack

```text
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=xoxb-…
SLACK_DEFAULT_CHANNEL=#data-ops   # or set slackNotifyChannel in Settings
```

Slack app Interactivity Request URL:

`https://YOUR_API/webhooks/slack/interactions`

## Pass criteria

- [ ] Login works (demo users or SSO)
- [ ] Outcome plan builds from connected sources
- [ ] Join Promote from UI and (if configured) Slack
- [ ] Ship approve + rollback does not error
- [ ] Agent never auto-Promotes Yellow/Red without policy + eval gate

## Out of scope for free pilot

SOC2 / SCIM, always-on API (Render sleep), Databricks replacement, full lake custody.
