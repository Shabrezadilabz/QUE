export type SettingsSection =
  | 'members'
  | 'security'
  | 'automation'
  | 'governance'
  | 'team'
  | 'billing'
  | 'ai-policy'

export const SETTINGS_SECTION_META: Record<
  SettingsSection,
  { title: string; subtitle: string }
> = {
  members: {
    title: 'Members',
    subtitle: 'Team permissions and invites for this workspace.',
  },
  security: {
    title: 'Security',
    subtitle: 'SSO status, API key summary, and environment overview.',
  },
  automation: {
    title: 'Automation',
    subtitle: 'Scheduled sync/jobs, orchestrator webhook, and private runner.',
  },
  governance: {
    title: 'Governance',
    subtitle: 'Drift alerts, attestations, signed artifacts, and audit log.',
  },
  team: {
    title: 'Team OS',
    subtitle: 'Propose vs Promote roles, Slack/Teams join + drift digests.',
  },
  billing: {
    title: 'Billing',
    subtitle: 'Seats and checkout for this workspace.',
  },
  'ai-policy': {
    title: 'AI & Policy',
    subtitle: 'Privacy gates, feature flags, BYOK, and GitHub/dbt deploy branches.',
  },
}
