# Sprint 11 Backlog — Enterprise ops + collab

**Theme:** Private runner hardening, billing metering, load tests, status/runbook, realtime collab  
**Status:** Implemented locally  
**Plan ref:** [Que-Competitive-Sprint-Plan-2026.md](../Que-Competitive-Sprint-Plan-2026.md) § Sprint 11

---

## Deliverables

| ID | Deliverable | Status | Key files |
|----|-------------|--------|-----------|
| S11.1 | Private runner hardening — health, install doc, job isolation | ✅ | `privateRunner.js`, `GET .../private-runner/health`, `docs/private-runner/install-guide.md` |
| S11.2 | Billing + metering — seats, connectors, pack add-ons (INR) | ✅ | `billingMetering.js`, `GET .../billing/metering` |
| S11.3 | Load test suite — 50 concurrent workspaces smoke | ✅ | `loadTestSuite.js`, `GET /ops/load-test`, `eval/runLoadTestSuite.js` |
| S11.4 | Status page + on-call runbook | ✅ | `statusPage.js`, `/status`, `/enterprise/status`, `docs/ops/on-call-runbook.md` |
| S11.5 | Realtime collab — presence bar + join review co-edit lock | ✅ | `joinReviewCollab.js`, `PresenceBar.tsx`, `JoinReviewPage.tsx` |

---

## API routes added

- `GET /workspaces/:workspaceId/private-runner/health`
- `GET /workspaces/:workspaceId/private-runner/install-guide`
- `GET /workspaces/:workspaceId/billing/metering` (`?format=markdown`)
- `GET /enterprise/status` (`?format=runbook`)
- `GET /ops/load-test` · `GET /ops/load-test/defaults`
- `GET/POST/DELETE .../join-reviews/:relationshipId/collab/*`

## Enhanced

- `GET /status` — component breakdown (api, db, jobs, vector) + runbook ref
- `PrivateRunnerPanel` — health probe + install guide link
- `BillingPanel` — INR metering preview aligned with S1 pricing
- `JoinReviewPage` — presence bar + edit lock for co-steward review

---

## Test

```bash
cd api && npm run test:sprint11
cd api && npm run test:load
```

---

## Exit criteria (from plan)

- [x] Private runner install guide + health probe + isolation policy
- [x] Metering invoice matches S1 Growth/Enterprise + pack/connector add-ons
- [x] 50-workspace simulated load test with CI p95 threshold
- [x] Public status + on-call runbook for SOC 2 evidence
- [x] Presence bar on join review + soft co-edit lock
- [ ] Enterprise VPC pilot on customer runner (manual)
- [ ] Razorpay live invoice link (post-S11)

---

## Demo script (enterprise ops)

1. **Settings → Private runner** — Test health, download install guide
2. **Settings → Billing** — Metering preview shows ₹ line items + GST
3. **`GET /ops/load-test?concurrency=50`** — CI green report
4. **`/status`** — component health + link to runbook
5. **Join Review** — two stewards see presence avatars; edit claims lock

## Demo script (collab)

1. Steward A opens Join Review on suggested join
2. Steward B sees A in presence bar on same page
3. A clicks Edit columns — lock claimed
4. B gets friendly lock message until A saves or releases
