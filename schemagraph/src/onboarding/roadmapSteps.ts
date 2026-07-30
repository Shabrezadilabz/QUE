/**
 * First-run / reopenable product roadmap steps for Que.
 */
export type RoadmapStep = {
  id: string
  title: string
  body: string
  /** Optional route hint for “Go there” */
  href?: string
  ctaLabel?: string
}

export const QUE_ROADMAP_STORAGE_KEY = 'que_onboarding_roadmap_v1'

export const ROADMAP_STEPS: RoadmapStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Que',
    body: 'Que helps you discover cross-source joins, approve them with humans, freeze a contract, and ship an attested dbt PR — using schema metadata only (not a warehouse row lake).',
  },
  {
    id: 'account',
    title: '1 · Account & workspace',
    body: 'Create an account (or sign in). Your first workspace is created as owner. Use the workspace menu anytime to create or switch workspaces.',
    href: '/settings',
    ctaLabel: 'Open Settings',
  },
  {
    id: 'invite',
    title: '2 · Invite your team',
    body: 'In Settings → Invite Member, add emails with a role (viewer / member / admin). They join automatically on next login or SSO.',
    href: '/settings',
    ctaLabel: 'Invite members',
  },
  {
    id: 'poc-pack',
    title: '3 · Install SF ↔ DBX POC pack',
    body: 'On Sources, click Install POC pack for Snowflake + Databricks fixtures. Same-day demo without live warehouse tokens. Or add live connectors when ready.',
    href: '/sources',
    ctaLabel: 'Go to Connectors',
  },
  {
    id: 'sources',
    title: '4 · Connect → Sync',
    body: 'Browse the connector catalog (badges: Schema sync, Join assist, Live validate). Prefer one-click fixtures; use credentials only for live. Click Sync so tables appear on the canvas. Watch Connection health for re-auth.',
    href: '/sources',
    ctaLabel: 'Open Connectors',
  },
  {
    id: 'joins',
    title: '5 · Review joins (HITL)',
    body: 'Que suggests cross-source joins. On the Workspace canvas, Promote the good ones and Reject noise. AI may suggest — Que never auto-accepts joins.',
    href: '/workspace',
    ctaLabel: 'Open Workspace',
  },
  {
    id: 'chat',
    title: '6 · Ask the schema AI',
    body: 'AI Chat answers from schema packs (and optional scrubbed samples) — not free-form warehouse SQL. Try /help or /list. Save a job draft to jump to the notebook.',
    href: '/chat',
    ctaLabel: 'Open AI Chat',
  },
  {
    id: 'jobs',
    title: '7 · Jobs → validate → export',
    body: 'Edit the notebook, Run Test (dry-run), optionally Validate (live, capped), mark Ready, then export JSON/SQL/dbt or open an attested dbt PR. Attestation beats free-form chat for shipping.',
    href: '/jobs',
    ctaLabel: 'Open Jobs',
  },
  {
    id: 'policy',
    title: '8 · Privacy & drift gates',
    body: 'Settings → Show policy… for scrub samples, block export on drift / unreviewed joins, and Databricks query-history assist. These protect schema-only shipping.',
    href: '/settings',
    ctaLabel: 'Policy settings',
  },
  {
    id: 'done',
    title: 'You’re ready',
    body: 'Wedge: connect → sync → Promote join → freeze → attested PR. Reopen this roadmap anytime from the ? button in the header.',
  },
]
