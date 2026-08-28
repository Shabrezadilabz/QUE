# Case study template — SportEdge (E-commerce)

**Status:** Draft — fill with design partner quote when available.

---

## Headline

How [Company] certified revenue KPIs in under 4 hours with one data steward — using Que Monk Mode on SportEdge.

---

## Snapshot

| | |
|---|---|
| **Industry** | E-commerce / sports retail |
| **Team size** | 50–200 employees |
| **Data team** | 1 steward (+ part-time analyst) |
| **Stack before** | Hevo → BigQuery → manual Looker |
| **Stack after** | Hevo (ingest) + **Que** (joins, cert, BI export) |
| **Time to first certified KPI** | ___ hours |
| **Golden join recall** | ___ % |

---

## Problem

- Ingest landed raw tables; joins and KPI definitions lived in one engineer's head.
- CEO asked "what is revenue by brand?" — answers took days and weren't auditable.
- No HITL on AI-suggested joins; risk of wrong mart numbers.

---

## Solution (Que)

1. Connected SportEdge Postgres (or read-only warehouse mirror).
2. **Monk Mode** — Ecommerce pack → infer joins → HITL promote → cert mart.
3. **Golden eval** gate on revenue KPI.
4. **CEO chat** on certified mart only; **Report Studio** → Looker/Metabase export.

---

## Results

- Certified revenue KPI in **< 4 hours** (Monk event timestamps).
- ___ joins promoted with evidence (not black-box SQL).
- CEO self-serve English queries without exposing raw SQL.
- Evidence pack exported for auditor / board diligence.

---

## Quote (placeholder)

> "___"  
> — **Name**, Title, Company

---

## Proof artifacts

- [ ] Monk completion screenshot (cert badge)
- [ ] Golden eval pass log
- [ ] CEO chat screenshot (redacted)
- [ ] Optional: Looker export merge PR link

---

## For sales deck (3 bullets)

1. **Post-ingest intelligence** — Que starts where Hevo stops.
2. **HITL trust** — every join promoted with evidence.
3. **Board-ready KPIs** — cert + golden eval, not hallucinated SQL.
