# India Data Processing Agreement (DPA) — Template

**Que (SchemaGraph) — ADC Labs**  
**Version:** 2026-03 · **Jurisdiction:** India (DPDP Act 2023 aligned)

> **Disclaimer:** Template for enterprise procurement only. Requires legal review before countersignature.

---

## 1. Parties

- **Data Fiduciary / Controller:** `[Customer legal name]`  
- **Data Processor:** ADC Labs (`Que` product), `[Que entity address]`

## 2. Subject matter

Processor provides cloud metadata stewardship, join inference, Monk certification, and BI export services for Customer's connected data sources. Processor does **not** persist full warehouse row payloads unless Customer explicitly enables Offer B managed data plane.

## 3. Processing instructions

Customer instructs Processor to:

1. Sync schema metadata and optional pinned sample rows (5–10 rows, scrubbed) from connected sources  
2. Run steward workflows (join promote, transform HITL, golden eval)  
3. Export certified artifacts (dbt, Looker, Metabase, attestation bundles)

Processor shall not use Customer data for model training outside Customer workspace unless Customer opts in.

## 4. Sub-processors

Current sub-processors listed at `[status page URL]`. Customer receives 30-day notice of material changes.

## 5. Security measures

- Encryption in transit (TLS 1.2+) and at rest  
- Optional customer-managed keys (CMK)  
- SSO/OIDC + SCIM directory sync  
- Audit trail exportable to SIEM  
- Tenant isolation smoke tests

## 6. Data residency

Default deployment region: **ap-south-1 (Mumbai)** unless contract specifies otherwise. Metadata and pinned samples remain in contracted region. Customer warehouse remains source of record (Offer A).

## 7. Breach notification

Processor notifies Customer without undue delay (target **72 hours**) after confirming a personal-data breach affecting Processor systems.

## 8. Data subject requests

Processor assists Customer with access/erasure requests for data Processor stores (workspace members, audit logs, pinned samples).

## 9. Term & deletion

On termination, Processor deletes workspace metadata within **90 days** unless legal hold applies. Customer may export no-lock-in kit before deletion.

## 10. INR invoicing

Enterprise contracts may be invoiced in **INR** with GSTIN. Payment terms: Net 30 unless otherwise agreed.

---

**Customer signature:** ___________________  
**Que signature:** ___________________  
**Effective date:** ___________________
