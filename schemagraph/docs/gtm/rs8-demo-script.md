# RS-8 demo script — Monk → Report Studio → Looker export (~20 min)

Record this for sales enablement and design-partner webinars.

---

## Prep (5 min before)

- SportEdge sandbox workspace with Postgres + Mongo synced  
- Hevo/Fivetran stack slide (optional)  
- Looker merge kit sample repo open locally  

---

## Act 1 — Post-sync intelligence (5 min)

1. Show **Sources** — connections synced, join infer banner  
2. Open **Join Review** — presence bar + promote one cross-source join  
3. Narrate: *"Fivetran stopped at the warehouse; Que starts where ingest ends."*

---

## Act 2 — Monk cert loop (7 min)

1. **Monk Mode** — start `ecommerce-v1` pack  
2. Discover → transform HITL approve → certify mart  
3. Show golden eval recall on **Eval** dashboard  
4. Narrate cert SLA: *"Target &lt;4 hours to certified KPI with evidence."*

---

## Act 3 — Report Studio (5 min)

1. Open **BI / Report Studio** — SportEdge exec board  
2. Apply board parameters (brand filter)  
3. Drill-to-SQL on one chart (cert-only fields)  
4. Trigger refresh webhook narrative (job completion hook)

---

## Act 4 — Looker export (3 min)

1. `GET .../export/looker/merge-kit?reportId=sportedge-exec`  
2. Show merge instructions — copy views into existing Looker project  
3. Close: *"Looker-grade outcomes without forcing migration off sunk LookML."*

---

## Recording checklist

- [ ] 1080p screen + mic  
- [ ] Blur secrets / connection strings  
- [ ] End card: pricing + sandbox URL  
- [ ] Upload to sales drive + link from `/sales`
