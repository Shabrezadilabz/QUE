# Que compliance process (not a certification)

This document describes the **operating process** for auditor diligence.
The product ships an **evidence pack** (`GET /workspaces/:id/enterprise/soc2-evidence`
and UI `/compliance`). That pack is **not** a SOC 2 Type II report.

## What engineering owns

1. Keep controls implemented in product (SSO, SCIM, API keys, CMK option, SIEM, audit, ABAC).
2. Regenerate the evidence pack before each diligence call.
3. Record DR drills, pen-test remediations, and on-call rota outside Que (ticket system / Drive).
4. Never market “SOC 2 certified” until an auditor issues a report.

## Cadence

| Cadence | Action |
|--------|--------|
| Weekly | Confirm `/health` + `/metrics` green; SIEM export if enabled |
| Monthly | Download evidence pack; spot-check audit sample |
| Quarterly | Access review (members, API keys, SCIM tokens, break-glass) |
| Annually | Pen test + Type I/II observation period with auditor |

## Client-facing language

> Que provides an engineering evidence pack mapped to common Trust Services Criteria.
> Formal SOC 2 Type II attestation is a separate engagement with an independent auditor.

## Related surfaces

- UI: `/compliance`, `/settings/enterprise`
- API: `GET /workspaces/:workspaceId/enterprise/soc2-evidence`
- Ops: `GET /health`, `GET /metrics`, `GET /metrics?format=prom`
