/**
 * Sprint 12 — Global GTM: USD pricing emphasis + non-India case studies.
 */
export const GLOBAL_USD_PRICING = {
  currency: 'USD',
  growth: { monthly: 999, annual: 9990, seatsIncluded: 2 },
  enterprise: { monthly: 2500, annual: 25000, seatsIncluded: 10 },
  packAddon: { monthly: 250 },
  note: 'INR list on /pricing for India land motion; USD for US/EU self-serve quotes.',
}

export const GLOBAL_CASE_STUDIES = [
  {
    id: 'sportedge-india',
    region: 'India',
    industry: 'Retail / D2C',
    title: 'SportEdge — certified exec KPI in under 4 hours',
    outcome: 'Postgres + Mongo → Monk cert → Report Studio → Looker export',
    metric: '79/100 IdeaProof · 83% launch readiness',
    stackMotion: 'Stack on Hevo ingest; Que owns joins + cert loop',
    anonymized: false,
    featured: true,
  },
  {
    id: 'northstar-saas-us',
    region: 'United States',
    industry: 'B2B SaaS',
    title: 'Northstar Analytics — one steward vs hiring two DEs',
    outcome: 'Salesforce + Snowflake → SaaS metrics pack → CEO embed',
    metric: 'Golden recall 91% · agent success 86%',
    stackMotion: 'Fivetran warehouse load; Que semantic + Report Studio',
    anonymized: true,
    featured: true,
  },
  {
    id: 'helix-logistics-eu',
    region: 'European Union',
    industry: 'Logistics',
    title: 'Helix Freight — SLA dashboard from messy TMS schema',
    outcome: 'Multi-source Monk → logistics pack → Power BI export',
    metric: 'Cert SLA p50 3.1h · 5-chart board without SQL',
    stackMotion: 'Airbyte ingest hook → post-sync automation',
    anonymized: true,
    featured: true,
  },
]

export function getGlobalGtmPack() {
  return {
    pricing: GLOBAL_USD_PRICING,
    caseStudies: GLOBAL_CASE_STUDIES,
    battlecardRef: 'docs/gtm/looker-grade-battlecard.md',
    demoScriptRef: 'docs/gtm/rs8-demo-script.md',
    generatedAt: new Date().toISOString(),
  }
}

export function formatCaseStudiesMarkdown(studies = GLOBAL_CASE_STUDIES) {
  const lines = ['# Que customer outcomes', '']
  for (const s of studies) {
    lines.push(`## ${s.title}`, '')
    lines.push(`- **Region:** ${s.region}`)
    lines.push(`- **Industry:** ${s.industry}`)
    lines.push(`- **Outcome:** ${s.outcome}`)
    lines.push(`- **Proof:** ${s.metric}`)
    lines.push(`- **Stack:** ${s.stackMotion}`)
    lines.push('')
  }
  return lines.join('\n')
}
