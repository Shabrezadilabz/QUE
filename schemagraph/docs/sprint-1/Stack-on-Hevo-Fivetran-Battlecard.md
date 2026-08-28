# Battlecard — Stack Que on Hevo / Fivetran

**Audience:** India mid-market (50–500 employees, 1 data steward)  
**Message:** Don't rip out ingest. **Certify upstream** with Que.

---

## One-liner

> *"Hevo/Fivetran moves data. Que makes it **trustworthy** — joins, certified KPIs, CEO-ready BI — in one steward session."*

---

## When to use

| Prospect says | You say |
|---------------|---------|
| "We already have Hevo" | Perfect — connect Que **read-only** to your warehouse. We infer joins and cert KPIs **after sync**. |
| "We pay for Fivetran" | Keep Fivetran. Que is the **semantic + HITL layer** Fivetran doesn't ship. |
| "We need fewer tools" | Replace **4 tools** (catalog + dbt glue + DQ + BI setup), not Hevo. |
| "AI will write our pipelines" | AI proposes; **your steward approves**. Golden eval before CEO sees a number. |

---

## Que vs ingest-only (Hevo / Fivetran / Airbyte)

| Capability | Hevo / Fivetran | Que |
|------------|-----------------|-----|
| Connector breadth | ✅ Strong | ⚠️ Growing (depth > count) |
| Load to warehouse | ✅ | Optional (Postgres replica) |
| Schema graph + join infer | ❌ | ✅ Core |
| HITL join promote | ❌ | ✅ |
| Industry Monk packs | ❌ | ✅ |
| Certified KPI + golden eval | ❌ | ✅ |
| CEO chat (cert-only) | ❌ | ✅ |
| Report Studio + BI export | ❌ | ✅ |
| dbt export (no lock-in) | Partial | ✅ |

---

## Demo script (5 min — "after sync")

1. Show warehouse already loaded by Hevo/Fivetran (read-only connection).
2. Que: first sync → **top-5 join banner** (S2).
3. Promote 1–2 joins → **Monk** ecommerce/finance pack.
4. Cert badge → **CEO question** on revenue/GMV.
5. **Export** LookML or Metabase JSON — "keep your BI."

---

## Pricing anchor (India)

| Tier | INR/mo | Includes |
|------|--------|----------|
| **Growth** | ₹50,000–80,000 | 1–2 stewards, core connectors, 1 pack |
| **Enterprise** | ₹2,00,000+ | SSO/SCIM, private runner, compliance pack |
| **Pack add-on** | ₹20,000/pack/mo | Vertical Monk templates |

Public page: `/pricing` · ROI: `/roi`

---

## Objection handling

**"Why pay twice?"**  
Que replaces the **200 hours/quarter** your steward spends on join hunting, mart SQL, and board prep — not the $/row ingest bill.

**"We'll wait for Fivetran + dbt."**  
They own transform **downstream**. Que owns **discovery + HITL joins + cert** upstream — complementary, or export dbt when ready.

**"SOC 2?"**  
Evidence scaffolding today; Type II observation starts S8. Honest line: *controls in product, audit on roadmap*.

---

## Hindi hook (optional slide)

> *"Aapka data pehle se warehouse mein hai — Que usko **certified KPI** banata hai, bina naye ingest tool ke."*

---

## CTA

- **Sandbox:** `/login?sandbox=1` — SportEdge Monk in 30 min  
- **Design partner:** 90-day pilot, case study co-marketing  
- **Doc:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md)
