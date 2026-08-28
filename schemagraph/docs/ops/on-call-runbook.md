# Que on-call runbook (S11.4)

**Owner:** Platform / SRE  
**Status page:** `/status` (public) · **Enterprise:** `GET /enterprise/status`

---

## Escalation

| Severity | Definition | Channel | Target response |
|----------|------------|---------|-----------------|
| **P1** | API down, auth broken, data loss risk | `#que-incidents` | 15 min |
| **P2** | Degraded sync, billing webhook failures, private runner mass timeout | `#que-ops` | 60 min |
| **P3** | Single-tenant issue, doc gap, non-blocking UI | `ops@que.dev` | 8 h |

---

## Playbook: API unreachable

1. Confirm `/health` and `/status` from outside VPC
2. Check Postgres connectivity (`SELECT 1` latency in status JSON)
3. Review recent deploy + rollback if error rate spiked
4. Post incident update on status page message field (manual until Statuspage.io)
5. Page secondary if DB failover in progress

## Playbook: DB latency > 500ms

1. Check connection pool saturation (`que_db_latency_ms` metric)
2. Identify long queries on `job_runs`, `relationships`, audit tables
3. Scale read replica or pause non-critical cron (golden eval loop)
4. Communicate degraded performance on `/status`

## Playbook: Private runner callback failures

1. Filter audit for `job.private_runner_callback` failures
2. Ask customer to verify runner `/health` and HMAC secret rotation
3. Check `QUE_PRIVATE_RUNNER_TIMEOUT_MS` vs customer job duration
4. Offer temporary fallback: set execution target to `que` for dry-run only
5. Document in SOC 2 change log if enterprise pilot

## Playbook: Stripe / billing webhook failures

1. Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
2. Replay events from Stripe CLI or dashboard
3. Confirm `seat_count` on workspace matches subscription quantity
4. For INR enterprise: cross-check Razorpay invoice against `billing/metering` preview

---

## SOC 2 evidence

- Store incident timestamps + resolution notes in ticket system
- Link status page snapshots (`ops_heartbeats` table) for observation period
- Weekly load test CI (`npm run test:load`) must stay green

---

## Contacts

- **Primary on-call:** rotation in PagerDuty (`que-platform`)
- **Founder escalation:** after 30 min P1 unresolved
- **Customer comms:** status@que.dev template for design partners
