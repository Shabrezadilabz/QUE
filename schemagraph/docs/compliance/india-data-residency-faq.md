# India Data Residency FAQ — Que Enterprise

**Last updated:** March 2026

---

## Where is Que hosted?

Que SaaS defaults to **AWS ap-south-1 (Mumbai)** for India enterprise customers. Metadata (schema graph, joins, steward inbox, audit events) is stored in PostgreSQL in the contracted region.

## Does Que copy my full warehouse to Que servers?

**Offer A (default):** No. Que connects to **your** Postgres, Snowflake, BigQuery, Salesforce, etc. Schema metadata and optional **pinned sample rows** (5–10 scrubbed rows per column) are stored. Full table dumps are not retained.

**Offer B (managed data plane):** Optional isolated staging with configurable retention (default 90 days). Enable only when contract requires Que-managed marts.

## Can we keep all PII in India?

Yes — connect India-region warehouses and CRM sandboxes only. Que does not require US-region sub-processors for core metadata processing when deployed in ap-south-1.

## What crosses borders?

- **LLM inference:** If AI features are enabled, schema-only context may be sent to configured model provider (OpenRouter). Disable AI or use enterprise VPC runner for air-gapped deployments.  
- **SIEM webhooks:** Audit events export to Customer's SIEM endpoint (Customer chooses region).  
- **BI export:** Certified artifacts download to Customer environment — not hosted by Que.

## DPDP Act 2023 alignment

Que supports:

- Purpose limitation (steward automation only)  
- Data minimization (schema-first, pinned samples optional)  
- Access controls (RBAC, ABAC, SSO)  
- Auditability (exportable audit trail)  
- Erasure (workspace deletion + no-lock-in export)

Que is **not** a legal compliance certification. Customer remains Data Fiduciary.

## SOC 2 and enterprise diligence

Engineering evidence pack available at `/compliance`. Type II observation period tracked after kickoff — not a certification letter.

## INR billing

Enterprise SKUs from **₹50k–80k/mo** land motion; **₹2L/mo+** for multi-source Monk + SOC2 bundle. Invoices in INR with GSTIN on request.

## Questions

Contact: **enterprise@que.dev** (replace with your sales alias)
