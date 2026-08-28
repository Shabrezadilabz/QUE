# After-sync demo script (5 minutes)

**Audience:** Prospect already using Hevo or Fivetran  
**Goal:** Show Que value **post-ingest** in one meeting.

---

## Setup (before call)

1. Prospect warehouse has sample tables (or use SportEdge read-only Postgres).
2. Que workspace with **Hevo/Fivetran battlecard** open.
3. Optional: `postSyncWebhookUrl` → webhook.site for live payload demo.

---

## Minute 0–1 — Stack story

> "You keep Hevo/Fivetran for ingest. Que connects **read-only** to the same warehouse. We don't replace your EL bill — we replace the 200 hours of join hunting and mart SQL."

**Action:** Sources → Add connection (Postgres/BQ read-only) → **Sync**.

---

## Minute 1–2 — Post-sync intelligence

**Action:** Point to **Post-sync intelligence** banner (top 5 joins).

> "Fivetran stops at load. Que inferred these joins automatically. Your steward promotes or rejects — nothing silent."

**Action:** Click **Review joins** → show one green/yellow join with evidence.

---

## Minute 2–4 — Monk + cert (if time)

**Action:** Monk Mode → Ecommerce pack → run (or show completed sandbox).

> "One steward certifies the revenue KPI with golden eval — not black-box AI SQL."

---

## Minute 4–5 — CEO + close

**Action:** Chat → CEO mode → ask revenue question **after** cert.

> "CEO sees English answers on **certified** data only. Before cert, Que refuses — that's the trust gap Weld doesn't have."

**CTA:** `/login?sandbox=1` · Growth ₹50k–80k · ROI `/roi`

---

## Objection one-liners

| Objection | Response |
|-----------|----------|
| "We have dbt" | "Que is **upstream** — graph + HITL joins before models. Export dbt when ready." |
| "We have Looker" | "Keep Looker. Que certifies the mart and exports LookML." |
| "Too many tools" | "Que replaces catalog + glue + DQ setup — not Hevo." |
