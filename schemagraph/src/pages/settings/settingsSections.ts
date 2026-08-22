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
    subtitle:
      'Manage organization members, roles, and access permissions.',
  },
  security: {
    title: 'Security',
    subtitle: 'SSO, API keys, sessions, and environment configuration.',
  },
  automation: {
    title: 'Automation',
    subtitle:
      'Scheduled sync/jobs, orchestrator webhook, and private runner.',
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
    title: 'AI Policy',
    subtitle:
      'Privacy gates, feature flags, BYOK keys, and GitHub/dbt deploy branches.',
  },
}
