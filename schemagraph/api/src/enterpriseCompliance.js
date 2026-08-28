/**
 * Sprint 8 — India enterprise SKU: INR invoicing notes, DPA template, residency FAQ.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getWorkspaceSettings } from './workspaceSettings.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = join(__dirname, '../../docs/compliance')

export const INDIA_ENTERPRISE_SKU = {
  id: 'india-enterprise',
  currency: 'INR',
  billingNote: 'Invoices in INR via Razorpay or wire; GSTIN on request.',
  listPriceMonthly: {
    min: 50000,
    max: 800000,
    landMotion: '₹50k–80k/mo land per India GTM sprint plan',
    enterpriseFloor: '₹2L/mo+ for multi-source Monk + SOC2 diligence bundle',
  },
  includes: [
    'Multi-source Monk (Postgres/BQ + Salesforce)',
    'SOC 2 evidence pack + Type II kickoff tracking',
    'SCIM/OIDC enterprise SSO',
    'India DPA template + data residency FAQ',
    'Dedicated steward onboarding (1 FTE equivalent)',
  ],
}

function readDoc(relativePath, fallback) {
  try {
    return readFileSync(join(DOCS_ROOT, relativePath), 'utf8')
  } catch {
    return fallback
  }
}

export function getIndiaCompliancePack() {
  return {
    sku: INDIA_ENTERPRISE_SKU,
    dpaTemplate: readDoc(
      'india-dpa-template.md',
      '# India DPA template\n\nTemplate file missing — contact legal@que.dev',
    ),
    residencyFaq: readDoc(
      'india-data-residency-faq.md',
      '# Data residency FAQ\n\nTemplate file missing — contact legal@que.dev',
    ),
    generatedAt: new Date().toISOString(),
  }
}

export async function buildIndiaEnterpriseCompliance(workspaceId) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const pack = getIndiaCompliancePack()
  return {
    ...pack,
    workspace: {
      region: process.env.QUE_REGION || settings.dataRegion || 'ap-south-1',
      residency: settings.dataResidency || process.env.QUE_DATA_RESIDENCY || null,
      enforceSso: Boolean(settings.enforceSso),
    },
  }
}

export function formatIndiaComplianceMarkdown(pack) {
  const lines = [
    '# Que India enterprise compliance pack',
    '',
    `Generated: ${pack.generatedAt}`,
    '',
    '## SKU',
    `- Currency: ${pack.sku.currency}`,
    `- Land motion: ${pack.sku.listPriceMonthly.landMotion}`,
    `- Enterprise floor: ${pack.sku.listPriceMonthly.enterpriseFloor}`,
    '',
    '## Includes',
    ...pack.sku.includes.map((i) => `- ${i}`),
    '',
    '---',
    '',
    pack.dpaTemplate,
    '',
    '---',
    '',
    pack.residencyFaq,
  ]
  return lines.join('\n')
}
