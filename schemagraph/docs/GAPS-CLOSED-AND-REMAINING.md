# Gaps closed vs remaining (honest)

## Closed in product (P0 + P1 + P2)

| Gap | Surface |
|-----|---------|
| Org Rules (Cursor-like) | `/rules` + learn-from-Promote + injected into AI |
| Approve/diff queue | `/proposals` (unified + side-by-side diff) |
| Transform NL → SQL HITL | `/transforms` |
| Semantic metrics → BI | `/metrics` + lineage-to-metric graph |
| Eval harness dashboard | `/eval` + scheduled golden eval |
| Industry packs marketplace | `/marketplace` (10 packs + install history) |
| Join comments + threads | Join Review discussion (reply threads) |
| Multiplayer presence | HTTP heartbeat chips in chrome |
| Public status / sales | `/status`, `/sales` |
| Offer A warehouse digests | `/compliance` + chat Offer A strip |
| Connector retries / SLA | `syncWithRetries` + `/connector-reliability` |
| SaaS backup + DR drills | `/compliance` ops checklist |
| BI embed viewer | `/embed/:token` |

## Cannot be closed by code alone

| Item | Why |
|------|-----|
| SOC 2 Type II certificate | Independent auditor + observation period |
| Pen test report | External security firm |
| Full Databricks runtime parity | Integrate, don’t replace |
| “Automate 100% of DE/DA with zero humans” | Contradicts HITL trust model |
| Hard multi-region SaaS DR | Evidence scaffolding ≠ full platform HA |
| Live cursors / CRDT collab | Presence is heartbeat-based; full realtime is later |

## Production stance

Que is **pilot-ready** for the Cursor-for-data control plane.  
P2 adds marketplace density, semantic lineage, and lightweight multiplayer — not blockers for client pilots.
