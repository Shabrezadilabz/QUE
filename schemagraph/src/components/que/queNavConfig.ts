/** PDF sidebar navigation — matches Untitled.pdf pages 2–10. */

export type QueNavId =

  | 'workspace'

  | 'sources'

  | 'joins'

  | 'chat'

  | 'jobs'

  | 'lineage'

  | 'compliance'

  | 'marketplace'

  | 'metrics'

  | 'bi'

  | 'settings'



export type QueNavItem = {

  id: QueNavId

  to: string

  label: string

  /** Path prefixes that mark this item active */

  match: string[]

}



export const QUE_PDF_NAV: QueNavItem[] = [

  {

    id: 'workspace',

    to: '/workspace',

    label: 'Workspace',

    match: ['/workspace', '/ship'],

  },

  {

    id: 'sources',

    to: '/sources',

    label: 'Sources',

    match: ['/sources', '/managed'],

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

    id: 'jobs',

    to: '/jobs',

    label: 'Jobs',

    match: ['/jobs', '/templates', '/validation', '/drift-agent'],

  },

  {

    id: 'lineage',

    to: '/lineage',

    label: 'Lineage',

    match: ['/lineage'],

  },

  {

    id: 'compliance',

    to: '/compliance',

    label: 'Compliance',

    match: ['/compliance', '/product', '/eval', '/rules', '/catalog', '/glossary'],

  },

  {

    id: 'marketplace',

    to: '/marketplace',

    label: 'Marketplace',

    match: ['/marketplace'],

  },

  {

    id: 'metrics',

    to: '/metrics',

    label: 'Metrics',

    match: ['/metrics'],

  },

  {

    id: 'bi',

    to: '/bi',

    label: 'BI',

    match: ['/bi'],

  },

]



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

