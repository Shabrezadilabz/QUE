# Client onboarding (production path)

## 1. Seed a demo workspace (optional)

```bash
cd adc/schemagraph/api
node scripts/migrate.js
node scripts/seedDemoWorkspace.js --email client@example.com --password 'ChangeMe123!'
```

## 2. Walkthrough

1. Login → `/product` (positioning)
2. `/sources` → sync (pins scrubbed samples)
3. `/joins` → edit columns → Promote
4. Settings → AI & Policy → Offer A (customer) or Offer B (managed plane)
5. `/jobs` → dry-run / live validate (managed land when plane=managed)
6. `/managed` → certify dataset
7. `/bi` → create chart → preview → certify → mint embed
8. `/compliance` → download evidence pack

## 3. Ops

- `GET /health` — JSON snapshot + inventory
- `GET /metrics` — JSON
- `GET /metrics?format=prom` — Prometheus text
- Retention purge: `POST /workspaces/:id/managed-datasets/purge-expired`

## 4. Honest claims

- Pinned overlap confidence band ~88–95%, not 100%
- HITL Promote required by default
- Evidence pack ≠ SOC 2 Type II certified
