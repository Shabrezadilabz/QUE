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
    id: 'sources',
    title: '3 · Add connectors',
    body: 'Go to Sources and add Postgres, Databricks, Snowflake, or fixtures. Secrets are encrypted at rest. Click Sync so tables appear on the canvas.',
    href: '/sources',
    ctaLabel: 'Go to Sources',
  },
  {
    id: 'joins',
    title: '4 · Review joins (HITL)',
    body: 'After sync, Que suggests cross-source joins. On the Workspace canvas, Promote the good ones and Reject noise. Nothing ships until a human accepts.',
    href: '/workspace',
    ctaLabel: 'Open Workspace',
  },
  {
    id: 'chat',
    title: '5 · Ask the schema AI',
    body: 'AI Chat answers from metadata (and optional sample previews). Try /help or /list. When ready, ask for a job draft and Save to Jobs — you’ll jump to the notebook.',
    href: '/chat',
    ctaLabel: 'Open AI Chat',
  },
  {
    id: 'jobs',
    title: '6 · Jobs → validate → export',
    body: 'Edit the notebook, Run Test (dry-run), optionally Validate (live, capped rows), mark Ready, then export JSON/SQL/dbt or open an attested dbt PR.',
    href: '/jobs',
    ctaLabel: 'Open Jobs',
  },
  {
    id: 'policy',
    title: '7 · Privacy & drift gates',
    body: 'Settings → Show policy… for scrub samples, block export on drift / unreviewed joins, and Databricks query-history assist. These protect schema-only shipping.',
    href: '/settings',
    ctaLabel: 'Policy settings',
  },
  {
    id: 'done',
    title: 'You’re ready',
    body: 'Wedge to remember: join truth → human approve → freeze → attested PR. Reopen this roadmap anytime from the ? button in the header.',
  },
]
