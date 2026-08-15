# CEO capability — Outcome / risk / Ship / Slack / packs / hardening

Schema-first HITL loop. No lake custody.

## Surfaces

| Route | Purpose |
|-------|---------|
| `/outcome` | NL → plan; **Run next step** / Infer joins; optional `/agent` link |
| `/ship` | Draft → Approve → embed / Rollback (+ optional warehouse DROP) |
| `/joins` | Green / Yellow / Red + Promote |
| `/workspace` | **Edit** tool — drag column→column or pull endpoint handles; AI edges need sample match |
| `/eval` | Green eligibility scoreboard |
| `/marketplace` | CEO packs seed Rules + Outcome |
| `/rules` | Promote + marketplace memory |
| `/sources` | CEO heal copy |
| Settings → Slack/Teams | Approve/Reject stitch from chat |

## Hardening

- Slack interactions: `POST /webhooks/slack/interactions` verifies `SLACK_SIGNING_SECRET` (raw body)
- Slack **interactive** Approve/Reject when `SLACK_BOT_TOKEN` + Settings `slackNotifyChannel` (Block Kit `value=` tokens); webhook mode keeps signed URL buttons
- Join Approve links: HMAC tokens via `QUE_JOIN_ACTION_HMAC_SECRET` (or attestation/secrets key)
- Warehouse rollback: link `jobId` / `materializationId` on Ship → Rollback issues `DROP VIEW/TABLE IF EXISTS`
- Outcome run-step: `POST .../outcomes/:id/run-step` (metrics / joins / ship draft tools)
- Outcome agent: `POST .../outcomes/:id/advance-agent` (`approvePlan` HITL → tools; after Promote → continue)
- Smoke / ops: [`SMOKE-CEO.md`](./SMOKE-CEO.md)

## Env (production)

```text
QUE_APP_URL=https://your-app.vercel.app
QUE_PUBLIC_API_URL=https://your-api.onrender.com
QUE_JOIN_ACTION_HMAC_SECRET=…
SLACK_SIGNING_SECRET=…          # interactive webhook
SLACK_BOT_TOKEN=xoxb-…          # optional interactive Block Kit
SLACK_DEFAULT_CHANNEL=#ops      # or Settings → slackNotifyChannel
QUE_CORS_ORIGINS=https://your-app.vercel.app
VITE_STITCH_API_URL=https://your-api.onrender.com
```

## Migrate

```bash
cd api && npm run migrate
```

Migration: `db/038_ceo_outcome_ship.sql`
