# CEO capability — Outcome / risk / Ship / Slack / packs

Schema-first HITL loop. No lake custody.

## Surfaces

| Route | Purpose |
|-------|---------|
| `/outcome` | NL → plan (sources → joins → metrics → Ship) |
| `/ship` | Draft → Approve → embed / Rollback + attestation |
| `/joins` | Green / Yellow / Red + Promote |
| `/eval` | Green eligibility scoreboard |
| `/marketplace` | CEO packs seed Rules + Outcome |
| `/rules` | Promote + marketplace memory |
| `/sources` | CEO heal copy (“Fix without a DE”) |
| Settings → Slack/Teams | Approve/Reject stitch from chat |

## API highlights

- Outcomes + ship-events (`038_ceo_outcome_ship.sql`)
- Risk tiers on join reviews; golden recall gates Green auto-Promote
- `GET/POST /webhooks/join-action` — signed Approve/Reject (no session)
- `POST /webhooks/slack/interactions` — Slack interactive fallback
- Marketplace apply seeds `workspace_rules` + `workspace_outcomes`

## Env (production)

```text
QUE_APP_URL=https://your-app.vercel.app
QUE_PUBLIC_API_URL=https://your-api.onrender.com
QUE_JOIN_ACTION_HMAC_SECRET=…   # optional; falls back to attestation/secrets key
```

## Migrate

```bash
cd api && npm run migrate
```
