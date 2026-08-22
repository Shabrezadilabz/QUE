/** Settings org-nav icons — PDF page 10 (Members, Security, AI Policy, Automation, Billing). */
export const FIGMA_SETTINGS_NAV = {
  members: '/figma/settings/members.svg',
  security: '/figma/settings/security.svg',
  'ai-policy': '/figma/settings/ai-policy.svg',
  automation: '/figma/settings/automation.svg',
  billing: '/figma/settings/billing.svg',
} as const

export type SettingsNavId = keyof typeof FIGMA_SETTINGS_NAV
