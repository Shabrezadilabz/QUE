# Report Studio embed SDK (RS-7)

**Version:** 1.0.0  
**Route:** `GET /workspaces/:workspaceId/bi/embed-sdk?token=`

---

## Quick start

```html
<iframe
  src="https://app.que.dev/embed/YOUR_TOKEN"
  width="100%"
  height="480"
  frameborder="0"
  loading="lazy"
  data-brand="Acme Corp"
></iframe>
```

Generate token from **Ship to BI** or **BI chart → Mint embed token**.

---

## White-label CEO view

Configure in workspace settings (`embedWhiteLabel`):

| Field | Purpose |
|-------|---------|
| `brandName` | Portal header text |
| `logoUrl` | Optional logo (HTTPS) |
| `theme` | `dark` or `light` |
| `hideQueWordmark` | White-label portals |
| `ceoViewTitle` | Executive dashboard title |
| `allowedOrigin` | postMessage parent origin |

API returns snippet + React stub via embed-sdk route.

---

## postMessage contract

Parent window may listen for:

- `que.embed.ready` — chart loaded  
- `que.embed.cert_badge` — certified mart attestation present  
- `que.embed.drift_blocked` — board hidden due to golden eval fail  

---

## Template marketplace

`GET /workspaces/:workspaceId/bi/marketplace` lists cert-required board templates (CEO revenue, SportEdge exec, finance, logistics, SaaS metrics).

Seed into workspace via pack Monk cert → dashboard seed job.

---

## Security

- Embed tokens are revocable  
- Read-only — no SQL export in embed mode  
- Drift fail hides board (attestation gate)
