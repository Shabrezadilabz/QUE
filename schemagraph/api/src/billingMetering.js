/**
 * Sprint 11 — Billing + metering aligned with S1 public pricing (INR + add-ons).
 * Complements Stripe seat billing in billing.js with usage-based line items.
 */
import { getBillingStatus } from './billing.js'
import { getWorkspaceUsage } from './usage.js'
import { query } from './db.js'

/** Mirrors PricingPage.tsx + S1.2 land motion */
export const S1_PRICING = {
  growth: {
    id: 'growth',
    currency: 'INR',
    inrMin: 50000,
    inrMax: 80000,
    usdList: 999,
    includedSeats: 2,
    includedConnections: 10,
    includedPacks: 1,
  },
  enterprise: {
    id: 'enterprise',
    currency: 'INR',
    inrMonthly: 200000,
    usdList: 2500,
    includedSeats: 10,
    includedConnections: 25,
    includedPacks: 3,
  },
  addons: {
    seat: { inr: 8000, usd: 99, unit: 'seat/mo' },
    connectorBlock: { inr: 5000, usd: 60, unit: '5 connections/mo', blockSize: 5 },
    industryPack: { inr: 20000, usd: 250, unit: 'pack/mo' },
  },
  paymentRails: ['stripe', 'razorpay', 'wire_inr'],
}

function countActivePacks(workspaceId) {
  return query(
    `SELECT COALESCE(
       NULLIF(settings_json->>'activePackId', ''),
       NULLIF(settings_json->>'defaultPackId', '')
     ) AS pack_id
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
    .then(({ rows }) => ({
      rows: [{ n: rows[0]?.pack_id ? 1 : 0 }],
    }))
    .catch(() => ({ rows: [{ n: 1 }] }))
}

/**
 * Pure invoice preview — no Stripe/Razorpay API calls.
 */
export function buildMeteringInvoice({
  planTier = 'growth',
  usage,
  billing,
  packCount = 0,
}) {
  const tier =
    planTier === 'enterprise' ? S1_PRICING.enterprise : S1_PRICING.growth
  const members = usage?.inventory?.members ?? billing?.members ?? 0
  const connections = usage?.inventory?.connections ?? 0
  const seatsPaid = billing?.seatCount ?? 0
  const effectiveSeats =
    seatsPaid > 0 ? seatsPaid : tier.includedSeats ?? S1_PRICING.growth.includedSeats

  const extraSeats = Math.max(0, members - effectiveSeats)
  const extraConnections = Math.max(
    0,
    connections - (tier.includedConnections ?? 10),
  )
  const connectorBlocks = Math.ceil(
    extraConnections / (S1_PRICING.addons.connectorBlock.blockSize || 5),
  )
  const extraPacks = Math.max(
    0,
    packCount - (tier.includedPacks ?? 1),
  )

  const lineItems = []
  const baseInr =
    planTier === 'enterprise'
      ? tier.inrMonthly
      : Math.round((S1_PRICING.growth.inrMin + S1_PRICING.growth.inrMax) / 2)

  lineItems.push({
    code: 'base_plan',
    label: planTier === 'enterprise' ? 'Enterprise base' : 'Growth base',
    quantity: 1,
    unitInr: baseInr,
    totalInr: baseInr,
  })

  if (extraSeats > 0) {
    const unit = S1_PRICING.addons.seat.inr
    lineItems.push({
      code: 'seat_addon',
      label: 'Extra seats',
      quantity: extraSeats,
      unitInr: unit,
      totalInr: extraSeats * unit,
    })
  }

  if (connectorBlocks > 0) {
    const unit = S1_PRICING.addons.connectorBlock.inr
    lineItems.push({
      code: 'connector_addon',
      label: 'Extra connection blocks (5)',
      quantity: connectorBlocks,
      unitInr: unit,
      totalInr: connectorBlocks * unit,
    })
  }

  if (extraPacks > 0) {
    const unit = S1_PRICING.addons.industryPack.inr
    lineItems.push({
      code: 'pack_addon',
      label: 'Industry pack add-ons',
      quantity: extraPacks,
      unitInr: unit,
      totalInr: extraPacks * unit,
    })
  }

  const subtotalInr = lineItems.reduce((s, l) => s + l.totalInr, 0)
  const gstInr = Math.round(subtotalInr * 0.18)

  return {
    currency: 'INR',
    planTier,
    lineItems,
    subtotalInr,
    gstInr,
    totalInr: subtotalInr + gstInr,
    usagePct: usage?.usagePct ?? 0,
    nearLimit: usage?.nearLimit ?? [],
    razorpayNote:
      'Razorpay invoice link when RAZORPAY_KEY_ID set; otherwise Stripe Checkout for USD.',
    stripeNote: billing?.configured
      ? 'Stripe seat subscription active or available via Checkout.'
      : 'Set STRIPE_SECRET_KEY for live Checkout.',
  }
}

export async function getWorkspaceMetering(workspaceId, opts = {}) {
  const [usage, billing, packs] = await Promise.all([
    getWorkspaceUsage(workspaceId),
    getBillingStatus(workspaceId),
    countActivePacks(workspaceId),
  ])
  const planTier =
    opts.planTier ||
    (billing.seatCount >= 10 || billing.billingStatus === 'active'
      ? 'growth'
      : 'growth')
  const packCount = Math.max(1, packs.rows[0]?.n ?? 1)
  const invoice = buildMeteringInvoice({
    planTier,
    usage,
    billing,
    packCount,
  })
  return {
    pricing: S1_PRICING,
    usage,
    billing: {
      status: billing.billingStatus,
      seats: billing.seatCount,
      members: billing.members,
      configured: billing.configured,
    },
    invoice,
    generatedAt: new Date().toISOString(),
  }
}
