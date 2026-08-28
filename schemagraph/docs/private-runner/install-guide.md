# Que private runner — install guide (S11.1)

Run Que job SQL **inside your VPC** while Que orchestrates work orders and records audit trails.

## Architecture

```
Que API  ──POST work order (HMAC)──►  Your runner (VPC)
         ◄──POST /runner/callback────  Status + logs
```

## Job isolation

- **One run ID per work order** — never reuse idempotency keys
- **Subprocess or container per job** — no shared temp dirs between tenants
- **Secrets** — verify `X-Que-Signature: sha256=…` with workspace secret only
- **Timeout** — default 120s soft timeout on Que side; runner should enforce its own kill switch

## Minimal runner (Node)

1. `POST /` — accept JSON work order body
2. Verify HMAC with shared secret
3. Spawn isolated process to run `sqlText` against your warehouse
4. `POST` callback to `callbackUrl` from payload:

```json
{
  "workspaceId": "…",
  "runId": "…",
  "status": "succeeded",
  "summary": "12 rows",
  "logs": [{ "ts": "…", "level": "info", "message": "done" }]
}
```

## Health check

Expose `GET /health` returning `200 OK`. Que Settings → **Test health** probes this endpoint.

## Enterprise checklist

- [ ] HTTPS only (TLS 1.2+)
- [ ] Runner SA with least-privilege warehouse role
- [ ] Egress allowlist to Que API callback URL
- [ ] Log redaction for PII in job output
- [ ] On-call runbook entry for callback failures (see `docs/ops/on-call-runbook.md`)
