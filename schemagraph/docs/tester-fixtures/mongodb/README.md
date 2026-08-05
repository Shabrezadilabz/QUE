# Que tester fixtures — MongoDB `customer_demo`

Shareable pack for manual testers. Used by **Step 3** in `Que-Manual-Tester-Guide.pdf`.

## What this is

| Item | Detail |
|------|--------|
| Purpose | **Customer source** Mongo DB that Que syncs (collections → tables) |
| Database name | `customer_demo` (same name as Postgres source — different engine) |
| Join keys with Postgres | `email`, `pg_customer_id` (1…2500 matches PG `customers.id`) |
| Engine | Docker `stitch-mongo` on `localhost:27017` (no auth for local) |

## “Account” / credentials (local Docker)

Local Mongo from `docker run` has **no username/password** by default.

| Setting | Value | Where it comes from |
|---------|--------|---------------------|
| Container | `stitch-mongo` | `docker ps --filter name=stitch-mongo` |
| Image | `mongo:7` | First-time `docker run` |
| Host | `localhost` | Port publish `27017:27017` |
| Port | `27017` | Same |
| URI | `mongodb://localhost:27017` | No auth |
| Database | `customer_demo` | Seed script |

## Collections seeded

| Collection | Docs | Notes |
|------------|------|--------|
| `profiles` | 2,500 | `email`, `pg_customer_id`, `full_name`, nested `prefs` |
| `events` | 8,000 | `email`, `pg_customer_id`, `event_type`, nested `meta` / `payload` |
| `sessions` | 3,000 | `email`, `pg_customer_id`, `session_token`, nested `device` |
| **Total** | **13,500** | |

Emails include `ada@example.com`, `grace@example.com`, `alan@example.com`, `user{N}@example.com` (same as Postgres / Excel).

## Files in this folder

| Path | Role |
|------|------|
| `README.md` | This file |
| `seed_rebuild.mjs` | **Preferred share** — regenerates all docs (copy of API script) |
| `json/*.json` | `mongoexport --jsonArray` dumps (~4 MB total) |
| `bson_dump/` | `mongodump` binary dump (restore with `mongorestore`) |

## Commands — full recreate (PowerShell)

```powershell
# 1) Ensure Mongo is up
docker start stitch-mongo
# First time:
# docker run -d --name stitch-mongo -p 27017:27017 mongo:7

# Wait
docker exec stitch-mongo mongosh --quiet --eval "db.runCommand({ ping: 1 }).ok"

# 2) Bulk seed (from api/)
cd D:\ADC\prosols\adc\schemagraph\api
node scripts/applyCustomerDemoMongoBulk.js

# Or from this folder:
# node seed_rebuild.mjs

# 3) Verify
docker exec stitch-mongo mongosh --quiet customer_demo --eval "
  print('profiles', db.profiles.countDocuments());
  print('events', db.events.countDocuments());
  print('sessions', db.sessions.countDocuments());
"
```

## Restore from dumps

```powershell
# BSON (fast)
docker cp D:\ADC\prosols\adc\schemagraph\docs\tester-fixtures\mongodb\bson_dump stitch-mongo:/tmp/customer_demo_restore
docker exec stitch-mongo mongorestore --drop --db=customer_demo /tmp/customer_demo_restore

# JSON (slower)
# mongoimport --uri=mongodb://localhost:27017 --db=customer_demo --collection=profiles --file=json/profiles.json --jsonArray
```

## Que UI connector fields

Sources → MongoDB:

| Field | Value |
|-------|--------|
| URI | `mongodb://localhost:27017` |
| Database | `customer_demo` |

Then **Sync** → Workspace should show collections as tables (`events`, `sessions`, `profiles`).
