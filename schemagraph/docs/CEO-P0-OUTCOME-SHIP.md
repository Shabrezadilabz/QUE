# CEO capability — Outcome / risk / Ship / Slack / packs / hardening

Schema-first HITL loop. No lake custody.

## Surfaces

| Route | Purpose |
|-------|---------|
| `/outcome` | NL → plan; **Run next step** / Infer joins; optional `/agent` link |
| `/ship` | Draft → Approve → embed / Rollback (+ optional warehouse DROP) |
| `/joins` | Green / Yellow / Red + Promote |
| `/eval` | Green eligibility scoreboard |
| `/marketplace` | CEO packs seed Rules + Outcome |
| `/rules` | Promote + marketplace memory |
| `/sources` | CEO heal copy |
| Settings → Slack/Teams | Approve/Reject stitch from chat |

## Hardening

- Slack interactions: `POST /webhooks/slack/interactions` verifies `SLACK_SIGNING_SECRET` (raw body)
- Join Approve links: HMAC tokens via `QUE_JOIN_ACTION_HMAC_SECRET` (or attestation/secrets key)
- Warehouse rollback: link `jobId` / `materializationId` on Ship → Rollback issues `DROP VIEW/TABLE IF EXISTS`
- Outcome run-step: `POST .../outcomes/:id/run-step` (metrics / joins / ship draft tools)

## Env (production)

```text
QUE_APP_URL=https://your-app.vercel.app
QUE_PUBLIC_API_URL=https://your-api.onrender.com
QUE_JOIN_ACTION_HMAC_SECRET=…
SLACK_SIGNING_SECRET=…          # when using Slack interactive endpoint
QUE_CORS_ORIGINS=https://your-app.vercel.app
VITE_STITCH_API_URL=https://your-api.onrender.com
```

## Migrate

```bash
cd api && npm run migrate
```

Migration: `db/038_ceo_outcome_ship.sql`
