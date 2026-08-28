/** Condensed sidebar navigation — grouped areas with sub-nav in app chrome. */

export type QueNavId =
  | 'platform'
  | 'workspace'
  | 'sources'
  | 'joins'
  | 'chat'
  | 'build'
  | 'analytics'
  | 'govern'
  | 'settings'

export type QueNavItem = {
  id: QueNavId
  to: string
  label: string
  /** Path prefixes that mark this item active */
  match: string[]
}

/** Primary sidebar — 8 items (platform modules live under /hub). */
export const QUE_PDF_NAV: QueNavItem[] = [
  {
    id: 'platform',
    to: '/hub',
    label: 'Platform',
    match: ['/hub', '/load', '/catalog', '/pipes'],
  },
  {
    id: 'workspace',
    to: '/workspace',
    label: 'Workspace',
    match: ['/workspace'],
  },
  {
    id: 'sources',
    to: '/sources',
    label: 'Sources',
    match: ['/sources', '/managed', '/plane'],
  },
  {
    id: 'joins',
    to: '/joins',
    label: 'Joins',
    match: ['/joins', '/proposals', '/transforms'],
  },
  {
    id: 'chat',
    to: '/chat',
    label: 'Chat',
    match: ['/chat', '/agent', '/outcome'],
  },
  {
    id: 'build',
    to: '/jobs',
    label: 'Build',
    match: [
      '/jobs',
      '/model',
      '/lineage',
      '/templates',
      '/validation',
      '/drift-agent',
    ],
  },
  {
    id: 'analytics',
    to: '/bi',
    label: 'Analytics',
    match: ['/bi', '/studio', '/metrics', '/ship'],
  },
  {
    id: 'govern',
    to: '/observe',
    label: 'Govern',
    match: [
      '/observe',
      '/compliance',
      '/marketplace',
      '/monk',
      '/glossary',
      '/steward',
      '/eval',
      '/rules',
      '/product',
    ],
  },
]

/** Horizontal sub-nav tabs shown under the top bar per active group. */
export type QueSectionLink = { to: string; label: string; end?: boolean }

export const QUE_SECTION_NAV: Partial<Record<QueNavId, QueSectionLink[]>> = {
  platform: [
    { to: '/hub', label: 'Overview', end: true },
    { to: '/load', label: 'Load' },
    { to: '/model', label: 'Model' },
    { to: '/studio/grid', label: 'Studio' },
    { to: '/catalog', label: 'Catalog' },
    { to: '/pipes', label: 'Pipes' },
    { to: '/observe', label: 'Observe' },
  ],
  build: [
    { to: '/jobs', label: 'Jobs', end: true },
    { to: '/model', label: 'Model' },
    { to: '/pipes', label: 'Pipes' },
    { to: '/lineage', label: 'Lineage' },
    { to: '/templates', label: 'Templates' },
    { to: '/validation', label: 'Validate' },
    { to: '/drift-agent', label: 'Drift' },
  ],
  analytics: [
    { to: '/bi', label: 'BI Studio', end: true },
    { to: '/studio/grid', label: 'Grid' },
    { to: '/metrics', label: 'Metrics' },
    { to: '/ship', label: 'Ship' },
  ],
  govern: [
    { to: '/observe', label: 'Observe', end: true },
    { to: '/compliance', label: 'Compliance' },
    { to: '/marketplace', label: 'Marketplace' },
    { to: '/monk', label: 'Monk' },
    { to: '/catalog', label: 'Catalog' },
    { to: '/eval', label: 'Eval' },
    { to: '/glossary', label: 'Glossary' },
  ],
}

/** @deprecated use QUE_PDF_NAV */
export const QUE_V2_NAV = QUE_PDF_NAV

export function resolveActiveNav(pathname: string): QueNavId | 'settings' {
  if (pathname.startsWith('/settings')) return 'settings'
  for (const item of QUE_PDF_NAV) {
    if (item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))) {
      return item.id
    }
  }
  return 'workspace'
}
