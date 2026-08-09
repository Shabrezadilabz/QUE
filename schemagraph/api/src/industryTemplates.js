/**
 * P2 — industry template marketplace (expanded packs + install history).
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { buildNotebookFromFields } from './jobNotebook.js'
import { createJob } from './jobs.js'
import { recordAuditEvent } from './auditLog.js'

export const INDUSTRY_TEMPLATE_PACKS = [
  {
    id: 'retail-customer-360',
    industry: 'Retail',
    title: 'Customer 360 stitch',
    description:
      'Join orders, customers, and campaigns into a trusted customer profile job.',
    tablesHint: ['customers', 'orders', 'campaigns'],
    tags: ['joins', 'crm', 'featured'],
    difficulty: 'starter',
    featured: true,
    notebookMarkdown:
      '# Customer 360\nDraft joins across customers ↔ orders ↔ campaigns. Promote joins first.',
    sqlCells: [
      {
        title: 'Customer orders',
        sql: `-- Review promoted joins before running\nSELECT c.*, o.order_id, o.order_date\nFROM customers c\nLEFT JOIN orders o ON c.id = o.customer_id\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'finance-reconciliation',
    industry: 'Finance',
    title: 'Ledger reconciliation',
    description: 'Stitch ledger lines to bank feeds with HITL join review.',
    tablesHint: ['ledger', 'bank_feed', 'entities'],
    tags: ['finance', 'reconciliation', 'featured'],
    difficulty: 'intermediate',
    featured: true,
    notebookMarkdown:
      '# Finance reconciliation\nValidate keys before materializing.',
    sqlCells: [
      {
        title: 'Unmatched ledger',
        sql: `SELECT l.*\nFROM ledger l\nLEFT JOIN bank_feed b ON l.external_ref = b.ref\nWHERE b.ref IS NULL\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'saas-product-usage',
    industry: 'SaaS',
    title: 'Product usage funnel',
    description: 'Accounts × events × invoices for product analytics.',
    tablesHint: ['accounts', 'events', 'invoices'],
    tags: ['product', 'funnel', 'metrics'],
    difficulty: 'starter',
    featured: true,
    notebookMarkdown: '# Product usage\nCertified metrics feed BI KPIs.',
    sqlCells: [
      {
        title: 'Weekly active',
        sql: `SELECT account_id, COUNT(*) AS events\nFROM events\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'healthcare-claims',
    industry: 'Healthcare',
    title: 'Claims ↔ eligibility stitch',
    description:
      'Join claims, members, and eligibility windows — HITL on PHI-adjacent keys.',
    tablesHint: ['claims', 'members', 'eligibility'],
    tags: ['healthcare', 'claims'],
    difficulty: 'advanced',
    featured: false,
    notebookMarkdown:
      '# Claims stitch\nPromote member keys carefully; keep samples scrubbed.',
    sqlCells: [
      {
        title: 'Open claims',
        sql: `SELECT c.claim_id, c.member_id, e.plan_id\nFROM claims c\nLEFT JOIN eligibility e\n  ON c.member_id = e.member_id\n AND c.service_date BETWEEN e.start_date AND e.end_date\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'logistics-shipment-sla',
    industry: 'Logistics',
    title: 'Shipment SLA dashboard job',
    description: 'Shipments × carriers × SLA clocks for ops DE handoff.',
    tablesHint: ['shipments', 'carriers', 'sla_clocks'],
    tags: ['ops', 'sla'],
    difficulty: 'intermediate',
    featured: false,
    notebookMarkdown: '# Shipment SLA\nAggregate late shipments after join promote.',
    sqlCells: [
      {
        title: 'Late shipments',
        sql: `SELECT s.shipment_id, s.carrier_id, s.promised_at, s.delivered_at\nFROM shipments s\nWHERE s.delivered_at IS NULL OR s.delivered_at > s.promised_at\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'marketing-attribution',
    industry: 'Marketing',
    title: 'Multi-touch attribution draft',
    description: 'Touches × conversions with reviewable join evidence.',
    tablesHint: ['touches', 'conversions', 'campaigns'],
    tags: ['marketing', 'attribution'],
    difficulty: 'intermediate',
    featured: false,
    notebookMarkdown: '# Attribution\nDo not auto-promote fuzzy campaign keys.',
    sqlCells: [
      {
        title: 'Touch → conversion',
        sql: `SELECT t.touch_id, t.campaign_id, c.conversion_id, c.revenue\nFROM touches t\nLEFT JOIN conversions c ON t.visitor_id = c.visitor_id\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'hr-headcount-cost',
    industry: 'HR',
    title: 'Headcount × cost centers',
    description: 'Employees to cost centers for finance/HR shared metrics.',
    tablesHint: ['employees', 'cost_centers', 'org_units'],
    tags: ['hr', 'finance'],
    difficulty: 'starter',
    featured: false,
    notebookMarkdown: '# Headcount cost\nPublish certified headcount metric after Promote.',
    sqlCells: [
      {
        title: 'Headcount by center',
        sql: `SELECT e.cost_center_id, COUNT(*) AS headcount\nFROM employees e\nWHERE e.active = true\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'data-quality-contracts',
    industry: 'Platform',
    title: 'Data quality contract starter',
    description:
      'Null/dup checks + contract test skeleton for attested delivery.',
    tablesHint: ['staging_orders', 'dim_customer'],
    tags: ['quality', 'contracts', 'featured'],
    difficulty: 'starter',
    featured: true,
    notebookMarkdown:
      '# Quality contracts\nWire contract tests after first Promote.',
    sqlCells: [
      {
        title: 'Null key scan',
        sql: `SELECT COUNT(*) AS null_keys\nFROM staging_orders\nWHERE order_id IS NULL;`,
      },
      {
        title: 'Dup scan',
        sql: `SELECT order_id, COUNT(*) AS n\nFROM staging_orders\nGROUP BY 1\nHAVING COUNT(*) > 1\nLIMIT 50;`,
      },
    ],
  },
  {
    id: 'snowflake-dbt-handoff',
    industry: 'Platform',
    title: 'Snowflake → dbt handoff',
    description:
      'Offer A starter: promoted joins → attested dbt export checklist job.',
    tablesHint: ['raw_orders', 'raw_customers'],
    tags: ['snowflake', 'dbt', 'offer-a'],
    difficulty: 'intermediate',
    featured: true,
    notebookMarkdown:
      '# Snowflake dbt handoff\nPromote joins, freeze contract, export dbt PR.',
    sqlCells: [
      {
        title: 'Staging select',
        sql: `SELECT o.order_id, o.customer_id, c.email\nFROM raw_orders o\nJOIN raw_customers c ON o.customer_id = c.customer_id\nLIMIT 100;`,
      },
    ],
  },
  {
    id: 'databricks-lakehouse-gold',
    industry: 'Platform',
    title: 'Databricks gold layer draft',
    description:
      'Offer A: sketch gold table from bronze/silver with external run bridge.',
    tablesHint: ['bronze_events', 'silver_sessions'],
    tags: ['databricks', 'lakehouse', 'offer-a'],
    difficulty: 'advanced',
    featured: false,
    notebookMarkdown:
      '# Databricks gold\nTrigger customer job; ingest status via external-status API.',
    sqlCells: [
      {
        title: 'Gold sessions',
        sql: `SELECT session_id, user_id, COUNT(*) AS events\nFROM silver_sessions\nGROUP BY 1, 2\nLIMIT 100;`,
      },
    ],
  },
]

function summarizePack(p) {
  return {
    id: p.id,
    industry: p.industry,
    title: p.title,
    description: p.description,
    tablesHint: p.tablesHint || [],
    tags: p.tags || [],
    difficulty: p.difficulty || 'starter',
    featured: Boolean(p.featured),
    sqlCellCount: (p.sqlCells || []).length,
  }
}

export function listIndustryTemplatePacks({ industry, tag, q } = {}) {
  let packs = INDUSTRY_TEMPLATE_PACKS.map(summarizePack)
  if (industry) {
    const ind = String(industry).toLowerCase()
    packs = packs.filter((p) => p.industry.toLowerCase() === ind)
  }
  if (tag) {
    const t = String(tag).toLowerCase()
    packs = packs.filter((p) =>
      (p.tags || []).some((x) => String(x).toLowerCase() === t),
    )
  }
  if (q) {
    const needle = String(q).toLowerCase()
    packs = packs.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.industry.toLowerCase().includes(needle) ||
        (p.tags || []).some((x) => String(x).toLowerCase().includes(needle)),
    )
  }
  return packs
}

export function getIndustryTemplatePack(packId) {
  return INDUSTRY_TEMPLATE_PACKS.find((p) => p.id === packId) || null
}

export function listMarketplaceCatalog(opts = {}) {
  const packs = listIndustryTemplatePacks(opts)
  const industries = [
    ...new Set(INDUSTRY_TEMPLATE_PACKS.map((p) => p.industry)),
  ].sort()
  const tags = [
    ...new Set(INDUSTRY_TEMPLATE_PACKS.flatMap((p) => p.tags || [])),
  ].sort()
  return {
    packs,
    industries,
    tags,
    featured: packs.filter((p) => p.featured),
    total: packs.length,
  }
}

/**
 * Apply pack → job + install record.
 */
export async function applyIndustryTemplatePack(
  workspaceId,
  packId,
  { userId = null } = {},
) {
  const pack = getIndustryTemplatePack(packId)
  if (!pack) {
    const err = new Error('template pack not found')
    err.status = 404
    throw err
  }
  const sqlText = (pack.sqlCells || [])
    .map((c) => `-- ${c.title}\n${c.sql}`)
    .join('\n\n')
  const notebook = buildNotebookFromFields({
    title: pack.title,
    notes: `${pack.notebookMarkdown || ''}\n\n${pack.description}`,
    sqlText,
    tables: pack.tablesHint || [],
  })
  const job = await createJob(workspaceId, {
    title: pack.title,
    notebook,
    sqlText,
    notes: pack.description,
    tables: pack.tablesHint || [],
  })
  const installId = randomUUID()
  await query(
    `INSERT INTO industry_pack_installs (
       id, workspace_id, pack_id, job_id, installed_by
     ) VALUES ($1,$2,$3,$4,$5)`,
    [installId, workspaceId, pack.id, job.id, userId],
  ).catch(() => undefined)
  void recordAuditEvent({
    workspaceId,
    actorUserId: userId,
    action: 'marketplace.install',
    resourceType: 'job',
    resourceId: job.id,
    summary: `Installed pack ${pack.id} → job “${job.title}”`,
    meta: { packId: pack.id },
  })
  return { job, pack: summarizePack(pack), installId }
}

export async function listPackInstalls(workspaceId, { limit = 30 } = {}) {
  const { rows } = await query(
    `SELECT * FROM industry_pack_installs
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(100, Math.max(1, Number(limit) || 30))],
  ).catch(() => ({ rows: [] }))
  return rows.map((r) => ({
    id: r.id,
    packId: r.pack_id,
    jobId: r.job_id,
    installedBy: r.installed_by,
    createdAt: r.created_at,
  }))
}
