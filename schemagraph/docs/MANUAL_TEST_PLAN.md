# Que — Manual Production / Paid-POC Test Plan

> **How to use:** print or open side-by-side while clicking through the app. Mark **PASS / FAIL / N/A**, attach evidence (screenshot, job id, PR URL).  
> **New-user walkthrough (account → connectors → chat → jobs):** open **`Que-Manual-Tester-Guide.pdf`** (HTML source: `Que-Manual-Tester-Guide.html`) — step-by-step with Result columns; updated as each connector step is run.  
> **Automation first:** from `schemagraph/api` run `npm run test:diligence` (joins + privacy + functional). CI workflow: `adc/.github/workflows/que-diligence.yml`.

Use this checklist for thorough manual testing before a design-partner or paid POC.

**Environment under test:** _________________  
**Build / commit:** _________________  
**Tester:** _________________  **Date:** _________________

---

## 0. Pre-flight (required once)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 0.1 | Apply migrations incl. `014_oidc_state_and_invites.sql` (`npm run migrate` in `api`) | Migrates cleanly | |
| 0.2 | Set `QUE_SECRETS_KEY`, `QUE_ATTESTATION_HMAC_SECRET`, `QUE_CORS_ORIGINS` | API boots | |
| 0.3 | Confirm `STITCH_AUTH_DISABLED` is **not** set for prod-like run | Login required | |
| 0.4 | Run `npm run test:diligence` and `npm run test:functional` in `api` | All PASS | |
| 0.5 | Open UI; login fields are **blank** (no prefilled demo password) | Blank form | |

---

## 1. Auth & SSO

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1.1 | Password login with valid owner | Lands in workspace | |
| 1.2 | Wrong password | 401 / error, no session | |
| 1.3 | Logout | Session cleared; protected routes redirect to login | |
| 1.4 | With OIDC env set, “Continue with SSO” visible | Button shown | |
| 1.5 | Complete SSO login | Redirect to `/auth/callback` with **hash** `#token=…` (not `?token=`) | |
| 1.6 | After callback, URL bar has **no** token left | History cleaned | |
| 1.7 | New SSO user **without** invite + `QUE_SSO_REQUIRE_INVITE=true` | Rejected with invite message | |
| 1.8 | Admin creates invite (`POST .../invites`) then SSO | User joins correct workspace role | |
| 1.9 | Email domain outside `QUE_SSO_ALLOWED_DOMAINS` | 403 domain not allowed | |
| 1.10 | Prod-like: `QUE_ENV=production` + `STITCH_AUTH_DISABLED=true` | API **refuses to boot** | |

---

## 2. Sources & credential encryption

| # | Step | Expected | Result |
|---|------|----------|--------|
| 2.1 | Create Postgres / Databricks / **Snowflake** connection with token/password | Saves; UI shows `••••••••` | |
| 2.2 | Inspect DB `connections.config_json` | Secrets in `__enc` blob; **no** plaintext token/password | |
| 2.3 | Edit connection leaving password blank | Previous secret retained; sync still works | |
| 2.4 | Sync fixture Snowflake / Databricks | Tables appear on canvas | |
| 2.5 | Sync live Databricks (if available) | Schema sync; optional query-history suggestions | |
| 2.6 | Delete connection | Removed; no orphan secrets in UI | |

---

## 3. Workspace joins & HITL

| # | Step | Expected | Result |
|---|------|----------|--------|
| 3.1 | After sync, suggested joins appear | Suggested edges visible | |
| 3.2 | Promote a join | Status accepted; evidence retained | |
| 3.3 | Reject a join | Status rejected; not used in export | |
| 3.4 | Stitch session (two sources) | Suggested cross-source edges | |
| 3.5 | Persist layout (drag tables, reload) | Positions restored | |

---

## 4. Privacy / settings

| # | Step | Expected | Result |
|---|------|----------|--------|
| 4.1 | Settings: **Scrub samples** toggle visible | Can toggle + Save | |
| 4.2 | Settings: **Block dbt PR on column drift** visible | Can toggle + Save | |
| 4.3 | Settings: Databricks query-history assist visible | Can toggle + Save | |
| 4.4 | Sync with samples on + scrub on | DB samples look tokenized (`email_…`, `tok_…`) | |
| 4.5 | Members list shows **real** users only (no Sarah Miller mock) | No fake roster | |
| 4.6 | Save workspace GitHub token in Settings | Status shows workspace source | |

---

## 5. Jobs notebook → export

| # | Step | Expected | Result |
|---|------|----------|--------|
| 5.1 | Open / create job; edit SQL + markdown cells | Light cards; Commit Changes works | |
| 5.2 | Run Test (dry-run) | Process/Output populate; no warehouse write | |
| 5.3 | Validate mode (≤20) against live PG/DBX/SF | Capped rows only | |
| 5.4 | Mark Ready | Status ready | |
| 5.5 | Export JSON | Payload includes `attestation.signature` HMAC | |
| 5.6 | `POST /auth/attestation/verify` with that attestation | `{ ok: true }` | |
| 5.7 | Export dbt-pr with open column drift (if any) | **409** blocked | |
| 5.8 | Ack drift / clear block; Open dbt PR | PR opened or clear reason | |
| 5.9 | Force export only with admin awareness | Documented footgun; audit row written | |

---

## 6. AI chat (schema-only)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 6.1 | Ask about tables without LLM keys | Heuristic / skills still answer | |
| 6.2 | @mention table/column into composer | Inserts context | |
| 6.3 | Confirm prompts do not dump full warehouse rows | Schema packs + caps only | |

---

## 7. BI / dbt assist APIs

| # | Step | Expected | Result |
|---|------|----------|--------|
| 7.1 | `POST .../bi-lineage` with sample assets | `{ linked ≥ 0 }` | |
| 7.2 | `GET .../bi-lineage` | Recent ingest listed | |
| 7.3 | `POST .../dbt-manifest` with small manifest | edges/matchedTables returned | |

---

## 8. Ops / CORS / OpenAPI

| # | Step | Expected | Result |
|---|------|----------|--------|
| 8.1 | `GET /health` | ok + sso status | |
| 8.2 | `GET /openapi.json` | Document returned | |
| 8.3 | Browser from **disallowed** origin | CORS blocked | |
| 8.4 | Browser from `QUE_CORS_ORIGINS` origin | API calls succeed | |
| 8.5 | API logs show JSON `http_request` with `requestId` | Structured logs | |
| 8.6 | Behind HTTPS reverse proxy | TLS 1.2+ only to clients | |

---

## 9. Negative / abuse

| # | Step | Expected | Result |
|---|------|----------|--------|
| 9.1 | Live SQL attempting `DELETE` / multi-statement | Blocked | |
| 9.2 | Viewer role tries create connection / export | 403 | |
| 9.3 | Access another workspace id | 403 | |
| 9.4 | Export with unreviewed joins when policy on | 409 | |

---

## Sign-off

| Role | Name | Sign | Date |
|------|------|------|------|
| Tester | | | |
| Eng lead | | | |
| Ready for paid POC? (Y/N) | | | |

**Known issues found:**

1.  
2.  
3.  

**Blockers before client:**

1.  
2.  
