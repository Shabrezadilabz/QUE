/**
 * US Healthcare pack v1 — claims, members, eligibility with HIPAA hard gates.
 */
export const HEALTHCARE_PACK_V1 = {
  id: 'healthcare-v1',
  industry: 'Healthcare',
  displayName: 'US Healthcare · Claims & Eligibility',
  description:
    'Claims, members, and eligibility windows — HIPAA scrub mandatory, no PHI in LLM, 95% join promote gate.',
  minMatchScore: 0.55,
  tableMatchers: [
    { pattern: 'claims', weight: 1.0, entity: 'FactClaim' },
    { pattern: 'members', weight: 0.95, entity: 'DimMember' },
    { pattern: 'eligibility', weight: 0.9, entity: 'DimEligibility' },
    { pattern: 'providers', weight: 0.75, entity: 'DimProvider' },
    { pattern: 'payers', weight: 0.7, entity: 'DimPayer' },
  ],
  requiredForMonk: ['claims', 'members'],
  policies: {
    hipaaStrict: true,
    scrubPhiMandatory: true,
    minJoinPromoteConfidence: 0.95,
    minCertRecall: 0.5,
    noAutoPromoteJoins: true,
    blockLlmPhi: true,
  },
  kpis: [
    {
      id: 'denial_rate',
      label: 'Claim denial rate',
      ceoQuestion: 'What is our claim denial rate?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS denial_rate_pct
FROM {claims}`,
    },
    {
      id: 'members_active',
      label: 'Active members',
      ceoQuestion: 'How many active members do we have?',
      sqlTemplate: `SELECT COUNT(*) AS active_members FROM {members} WHERE status = 'active' OR status IS NULL`,
    },
    {
      id: 'eligibility_gaps',
      label: 'Eligibility gaps',
      ceoQuestion: 'How many claims fall outside eligibility windows?',
      sqlTemplate: `SELECT COUNT(*) AS eligibility_gaps
FROM {claims} c
LEFT JOIN {eligibility} e
  ON c.member_id = e.member_id
 AND c.service_date BETWEEN e.start_date AND e.end_date
WHERE e.member_id IS NULL`,
    },
  ],
  jobs: [
    {
      id: 'open_claims_mart',
      title: 'Open claims with eligibility',
      description: 'Claims joined to eligibility — PHI scrubbed samples only.',
      sql: `SELECT c.claim_id, c.member_id, e.plan_id
FROM {claims} c
LEFT JOIN {eligibility} e
  ON c.member_id = e.member_id
 AND c.service_date BETWEEN e.start_date AND e.end_date
LIMIT 100`,
    },
  ],
  qualityRules: [
    {
      id: 'phi_scrub_required',
      severity: 'critical',
      title: 'PHI columns must be scrubbed',
      description: 'Apply PII/HIPAA policy pack before any AI or sample export.',
    },
    {
      id: 'member_key_integrity',
      severity: 'high',
      title: 'Claims missing member link',
      description: 'claim.member_id should reference members.member_id',
    },
  ],
  capabilities: [
    { id: 'hipaa_policy', label: 'HIPAA policy pack', href: '/settings/ai-policy' },
    { id: 'steward_inbox', label: 'Quality inbox', href: '/steward' },
    { id: 'joins_hitl', label: 'Join review (95% gate)', href: '/joins' },
    { id: 'metrics_kpis', label: 'Healthcare KPIs', href: '/metrics' },
    { id: 'compliance_export', label: 'Audit evidence', href: '/compliance' },
  ],
  goldenPairSource: 'healthcare/healthcare-golden-pairs.json',
  templatePackId: 'healthcare-claims',
}
