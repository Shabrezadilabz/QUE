# Sprint 7 Backlog — DQ, lineage, drift

**Theme:** DQ inside join/job/cert loop (Monte Carlo / Atlan lite)  
**Status:** Implemented locally  
**Plan ref:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md) § Sprint 7

---

## Deliverables

| ID | Deliverable | Status | Key files |
|----|-------------|--------|-----------|
| S7.1 | Scheduled golden eval fail → steward ticket + Slack/webhook | ✅ | `scheduledGoldenEval.js`, `goldenEvalAlerts.js`, `stewardInbox.js` (`createStewardInboxIssue`) |
| S7.2 | Steward DQ dashboard widgets | ✅ | `stewardDqDashboard.js`, `GET .../steward/dq-dashboard`, `StewardPage.tsx` |
| S7.3 | Lineage export bundle (BI + dbt + column impact) | ✅ | `lineageExport.js`, `GET .../lineage/export`, `LineagePage.tsx` Export bundle |
| S7.4 | Drift → proposed fix job/draft (HITL) | ✅ | `driftAgent.js` (`createDriftFixDraft`), `POST .../drift-fixes/:id/create-draft`, Steward drift panel |

---

## API routes added

- `GET /workspaces/:workspaceId/steward/dq-dashboard`
- `GET /workspaces/:workspaceId/lineage/export` (`?format=markdown` optional)
- `POST /workspaces/:workspaceId/drift-fixes/:suggestionId/create-draft`

## Enhanced routes

- `POST .../golden-eval/run` — returns `passed`, `failure` (steward ticket + notify)
- Scheduled tick (`startGoldenEvalLoop`) — auto-alerts on recall below threshold

---

## DQ dashboard widgets

| Widget | Source |
|--------|--------|
| Golden eval recall | `golden_eval_schedules` + workspace settings |
| Joins pending promote | `relationships` suggested count |
| Open drift events | `workspace_drift_events` |
| Steward inbox open | `steward_inbox_issues` |
| Drift fix proposals | `drift_fix_suggestions` |
| Certified marts | `managed_datasets` |

---

## Test

```bash
cd api && npm run test:sprint7
```

---

## Exit criteria (from plan)

- [ ] Certified mart fails golden eval → Slack → steward fixes → re-cert demo recorded
- [x] Golden eval fail creates steward inbox issue (`issue_kind: golden_eval`)
- [x] Golden eval fail emits `golden_eval.fail` audit event (SIEM-exportable)
- [x] `/steward` DQ summary widgets
- [x] Lineage export includes column graph + dbt assist + BI + column-impact drift
- [x] Drift alert → draft transform/job link from Steward

---

## Demo script (golden eval fail loop)

1. Configure golden pairs on **Eval** (or seed proof dataset schedule)
2. Enable drift alert webhook in Settings (Slack incoming webhook)
3. Run golden eval with unpromoted joins → recall fails
4. Check **Steward** — DQ widget red + golden_eval inbox issue
5. Promote joins → re-run eval → recall passes

## Demo script (drift fix)

1. Trigger schema drift (sync with column rename)
2. **Steward** → Scan drift → Draft transform → Approve on Proposals
3. Accept drift fix → acknowledge drift event
