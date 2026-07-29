# Que — What to test (new self-serve + existing)

Short clarity sheet for manual QA after the gaps we just shipped.

## Newly built (test these first)

| Feature | How to test | Expected |
|---------|-------------|----------|
| **Create account** | Login → **CREATE ACCOUNT** → email + password (≥8) + optional workspace name | Account created, lands in new workspace as **owner** |
| **Sign in** | Same page → SIGN IN with that email | Session restored; workspaces listed |
| **Create workspace** | Top nav workspace dropdown → name → **+ CREATE WORKSPACE** | New workspace active; empty canvas |
| **Invite member** | Settings → **Invite Member** → email + role | Pending invite listed; toast success |
| **Accept invite** | Register/login as invited email | Auto-joins that workspace with invited role |
| **Change role** | Settings → member role dropdown (admin+) | Role updates; last owner cannot be demoted |
| **Remove member** | Settings → Remove | Member gone; cannot remove last owner |
| **Revoke invite** | Settings → Pending invites → Revoke | Invite disappears |
| **Chat → Jobs** | Chat `/job` or job draft → **Save to Jobs** | Navigates to `/jobs?job=…` with that notebook open |

## Already built (smoke once)

| Feature | One-line check |
|---------|----------------|
| Sources + Sync | Add fixture SF/DBX → Sync → tables on Workspace |
| Join promote/reject | Suggested edge → Promote stays; Reject hides |
| Scrub / drift settings | Settings → Show policy… → toggles save |
| Job dry-run / validate | Jobs → Run Test; Validate if live warehouse |
| Export + attestation | Export JSON → signature present |
| Chat schema answers | `/help`, `/list` without LLM keys |
| Encrypted creds | Connection password stored as `__enc` (DB) |
| Viewer ACL | Viewer cannot create connection (403) |

## Still out of scope (do not expect)

- SCIM / IdP user directory sync  
- SOC2 Type II packaging  
- Full catalog replacement  
- Billing / upgrade plan (UI stubs only)  
- Auto-running warehouse SQL from every chat reply (previews are schema-samples or capped validate)

## Happy path (15 min)

1. Create account + workspace  
2. Invite a second email as **member**  
3. Register that email → confirm membership  
4. Add 2 fixture sources → Sync → promote one join  
5. Chat → save job → land on Jobs → Run Test  
6. Settings → change role / revoke leftover invite  

Demo logins still work in **DEV** only (`dev@stitch.local` / `stitch-dev`).

## In-app roadmap dialog

After login, a **step-by-step dialog** explains the flow (account → invite → sources → joins → chat → jobs → policy). Use **SKIP** to dismiss, **NEXT/BACK** to walk through, or **?** in the header to reopen anytime.
