/**
 * Sprint 12 — Report Studio RS-7: embed SDK, white-label CEO, template marketplace.
 */
import {
  ECOMMERCE_CEO_DASHBOARD,
  FINANCE_CEO_DASHBOARD,
  LOGISTICS_SLA_DASHBOARD,
  SAAS_METRICS_DASHBOARD,
  SPORTEDGE_EXEC_DASHBOARD,
} from './dashboardTemplates.js'
import { getWorkspaceSettings } from './workspaceSettings.js'

export const EMBED_SDK_VERSION = '1.0.0'

export const BI_TEMPLATE_MARKETPLACE = [
  {
    id: 'ceo-revenue',
    title: ECOMMERCE_CEO_DASHBOARD.title,
    audience: 'CEO',
    packIds: ['ecommerce-v1'],
    widgetCount: ECOMMERCE_CEO_DASHBOARD.widgets.length,
    certRequired: true,
  },
  {
    id: 'sportedge-exec',
    title: SPORTEDGE_EXEC_DASHBOARD.title,
    audience: 'Executive',
    packIds: ['ecommerce-v1'],
    widgetCount: SPORTEDGE_EXEC_DASHBOARD.widgets.length,
    certRequired: true,
    featured: true,
  },
  {
    id: 'finance-recon',
    title: FINANCE_CEO_DASHBOARD.title,
    audience: 'CFO',
    packIds: ['finance-v1', 'india-gst-v1'],
    widgetCount: FINANCE_CEO_DASHBOARD.widgets.length,
    certRequired: true,
  },
  {
    id: 'logistics-sla',
    title: LOGISTICS_SLA_DASHBOARD.title,
    audience: 'Ops',
    packIds: ['logistics-v1'],
    widgetCount: LOGISTICS_SLA_DASHBOARD.widgets.length,
    certRequired: true,
  },
  {
    id: 'saas-metrics',
    title: SAAS_METRICS_DASHBOARD.title,
    audience: 'CEO',
    packIds: ['saas-metrics-v1'],
    widgetCount: SAAS_METRICS_DASHBOARD.widgets.length,
    certRequired: true,
  },
]

export function listBiTemplateMarketplace({ packId = null } = {}) {
  let items = BI_TEMPLATE_MARKETPLACE
  if (packId) {
    items = items.filter((t) => t.packIds.includes(packId))
  }
  return {
    version: EMBED_SDK_VERSION,
    items,
    note: 'Templates seed Report Studio boards from certified marts — not pixel clones of Looker.',
  }
}

export function buildEmbedSdkSnippet({
  token,
  baseUrl = 'https://app.que.dev',
  whiteLabel = {},
} = {}) {
  const origin = String(baseUrl).replace(/\/$/, '')
  const wl = whiteLabel.brandName ? ` data-brand="${whiteLabel.brandName}"` : ''
  const theme = whiteLabel.theme === 'light' ? ' data-theme="light"' : ''
  return {
    version: EMBED_SDK_VERSION,
    html: `<iframe
  src="${origin}/embed/${token}"
  title="Que certified board"
  width="100%"
  height="480"
  frameborder="0"
  loading="lazy"${wl}${theme}
></iframe>`,
    react: `import { QueEmbed } from '@que/embed-sdk'

export function CeoDashboard() {
  return (
    <QueEmbed
      token="${token}"
      baseUrl="${origin}"
      brandName="${whiteLabel.brandName || 'Your brand'}"
      theme="${whiteLabel.theme || 'dark'}"
      height={480}
    />
  )
}`,
    postMessageContract: {
      events: ['que.embed.ready', 'que.embed.drift_blocked', 'que.embed.cert_badge'],
      parentOrigin: whiteLabel.allowedOrigin || '*',
    },
  }
}

export async function getWhiteLabelEmbedConfig(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const embed = settings.embedWhiteLabel || {}
  return {
    brandName: embed.brandName || settings.workspaceBrandName || 'Que',
    logoUrl: embed.logoUrl || null,
    theme: embed.theme || 'dark',
    hideQueWordmark: Boolean(embed.hideQueWordmark),
    allowedOrigin: embed.allowedOrigin || null,
    ceoViewTitle: embed.ceoViewTitle || 'Executive dashboard',
  }
}

export function buildCeoWhiteLabelViewConfig(chart, whiteLabel = {}) {
  return {
    title: whiteLabel.ceoViewTitle || chart?.title || 'CEO view',
    brandName: whiteLabel.brandName || 'Que',
    showCertBadge: true,
    hideSql: true,
    custody: 'certified_marts_only',
    attestationRequired: true,
  }
}
