/**
 * Industry pack registry — all verticals (Phase 4).
 */
import { ECOMMERCE_PACK_V1 } from './ecommerce-v1.js'
import { FINANCE_PACK_V1 } from './finance-v1.js'
import { AUDIT_PACK_V1 } from './audit-v1.js'
import { HEALTHCARE_PACK_V1 } from './healthcare-v1.js'

const ALL_PACKS = [
  ECOMMERCE_PACK_V1,
  FINANCE_PACK_V1,
  HEALTHCARE_PACK_V1,
  AUDIT_PACK_V1,
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
    featured: p.id === 'ecommerce-v1',
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

export { ECOMMERCE_PACK_V1, FINANCE_PACK_V1, AUDIT_PACK_V1, HEALTHCARE_PACK_V1 }
