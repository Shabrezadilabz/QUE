# Sprint 12 Backlog — Long-tail connectors + Phase 2 finish line

**Theme:** Connector honesty, Pack Studio polish, RS-7/8, public eval, global GTM  
**Status:** Implemented locally  
**Plan ref:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md) § Sprint 12

---

## Deliverables

| ID | Deliverable | Status | Key files |
|----|-------------|--------|-----------|
| S12.1 | Connector long-tail — 25+ types, top 10 partner priority | ✅ | `connectorLongTail.js`, `/connectors/matrix` |
| S12.2 | Pack Studio fork / diff / merge variants | ✅ | `packStudioFork.js`, pack-studio routes, `PackStudioPage.tsx` |
| S12.3 | RS-7 embed SDK + marketplace + white-label | ✅ | `reportStudioEmbed.js`, `docs/report-studio/embed-sdk.md` |
| S12.4 | RS-8 Looker-grade battlecard + demo script | ✅ | `docs/gtm/looker-grade-battlecard.md`, `rs8-demo-script.md` |
| S12.5 | Public eval dashboard | ✅ | `publicEvalDashboard.js`, `/eval/public`, `PublicEvalPage.tsx` |
| S12.6 | SOC 2 Type II observation complete tracking | ✅ | `markSoc2ObservationComplete` in `soc2Kickoff.js` |
| S12.7 | Global GTM — USD + US/EU case studies | ✅ | `globalGtm.js`, `/gtm/global`, `PricingPage` + `SalesPage` |

---

## API routes added

- `GET /connectors/matrix` — extended 25+ connector honesty matrix
- `GET /gtm/global` (`?format=markdown`)
- `GET /eval/public` · `GET /workspaces/:id/eval/public`
- `GET /workspaces/:id/bi/marketplace`
- `GET /workspaces/:id/bi/embed-sdk`
- `POST .../pack-studio/fork` · `diff` · `merge-fork`

---

## Test

```bash
cd api && npm run test:sprint12
```

---

## Exit criteria (from plan)

- [x] 25+ connector types with honest live vs roadmap labels
- [x] Pack fork/diff/merge in Pack Studio
- [x] Embed SDK docs + marketplace templates
- [x] RS-8 battlecard + 20-min demo script
- [x] Public eval: golden recall, agent success, cert SLA
- [x] SOC2 observation complete API (letter still external)
- [x] USD pricing + 3 case studies (India + US + EU)
- [ ] Record RS-8 demo video (manual GTM)
- [ ] SOC 2 Type II auditor letter (external, month 9–15)

---

## Phase 2 complete

After S12, all rows in sprint plan sections A–D are implemented except ongoing connector breadth and external SOC2 letter.
