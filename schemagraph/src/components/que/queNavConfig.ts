/** PDF sidebar navigation — matches Untitled.pdf pages 2–10. */

export type QueNavId =

  | 'workspace'

  | 'hub'

  | 'load'

  | 'model'

  | 'catalog'

  | 'pipes'

  | 'observe'

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

    id: 'hub',

    to: '/hub',

    label: 'Platform',

    match: ['/hub'],

  },

  {

    id: 'load',

    to: '/load',

    label: 'Load',

    match: ['/load'],

  },

  {

    id: 'model',

    to: '/model',

    label: 'Model',

    match: ['/model'],

  },

  {

    id: 'catalog',

    to: '/catalog',

    label: 'Catalog',

    match: ['/catalog'],

  },

  {

    id: 'pipes',

    to: '/pipes',

    label: 'Pipes',

    match: ['/pipes'],

  },

  {

    id: 'observe',

    to: '/observe',

    label: 'Observe',

    match: ['/observe'],

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

    match: ['/compliance', '/product', '/eval', '/rules', '/glossary', '/steward'],

  },

  {

    id: 'marketplace',

    to: '/marketplace',

    label: 'Marketplace',

    match: ['/marketplace', '/monk'],

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

    match: ['/bi', '/studio'],

  },

  {

    id: 'settings',

    to: '/settings',

    label: 'Settings',

    match: ['/settings'],

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

