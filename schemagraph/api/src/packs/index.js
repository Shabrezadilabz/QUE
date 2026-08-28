/**
 * Industry pack registry — all verticals (Phase 4 + Sprint 6).
 */
import { ECOMMERCE_PACK_V1 } from './ecommerce-v1.js'
import { FINANCE_PACK_V1 } from './finance-v1.js'
import { AUDIT_PACK_V1 } from './audit-v1.js'
import { HEALTHCARE_PACK_V1 } from './healthcare-v1.js'
import { LOGISTICS_PACK_V1 } from './logistics-v1.js'
import { SAAS_METRICS_PACK_V1 } from './saas-metrics-v1.js'
import { INDIA_GST_PACK_V1 } from './india-gst-v1.js'
import { MANUFACTURING_PACK_V1 } from './manufacturing-v1.js'
import { EDTECH_PACK_V1 } from './edtech-v1.js'
import { MARKETING_ATTRIBUTION_PACK_V1 } from './marketing-attribution-v1.js'

const ALL_PACKS = [
  ECOMMERCE_PACK_V1,
  FINANCE_PACK_V1,
  HEALTHCARE_PACK_V1,
  AUDIT_PACK_V1,
  LOGISTICS_PACK_V1,
  SAAS_METRICS_PACK_V1,
  INDIA_GST_PACK_V1,
  MANUFACTURING_PACK_V1,
  EDTECH_PACK_V1,
  MARKETING_ATTRIBUTION_PACK_V1,
]

const BY_ID = new Map(ALL_PACKS.map((p) => [p.id, p]))

export function listIndustryPacks() {
  return ALL_PACKS.map((p) => ({
    id: p.id,
    industry: p.industry,
    displayName: p.displayName,
    description: p.description,
    minMatchScore: p.minMatchScore,
    policies: p.policies || {},
    kpiCount: (p.kpis || []).length,
    featured: p.id === 'ecommerce-v1' || p.id === 'finance-v1',
    templatePackId: p.templatePackId || null,
  }))
}

/** Full pack objects for scoring / Monk orchestration. */
export function listFullIndustryPacks() {
  return ALL_PACKS
}

export function getIndustryPack(packId) {
  return BY_ID.get(packId) || null
}

export function getFullIndustryPack(packId) {
  return BY_ID.get(packId) || null
}

export {
  ECOMMERCE_PACK_V1,
  FINANCE_PACK_V1,
  AUDIT_PACK_V1,
  HEALTHCARE_PACK_V1,
  LOGISTICS_PACK_V1,
  SAAS_METRICS_PACK_V1,
  INDIA_GST_PACK_V1,
  MANUFACTURING_PACK_V1,
  EDTECH_PACK_V1,
  MARKETING_ATTRIBUTION_PACK_V1,
}
