/**
 * Wave 4.6 — Stripe seat billing (test-mode friendly, no stripe SDK).
 * Soft-enforce seats against member count via usage.js.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { query } from './db.js'
import { recordAuditEvent } from './auditLog.js'

function stripeConfigured() {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim())
}

function publicUrl() {
  return (
    process.env.QUE_PUBLIC_URL ||
    process.env.QUE_APP_URL ||
    'http://localhost:5174'
  ).replace(/\/$/, '')
}

async function stripeRequest(path, method, body) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    const err = new Error('STRIPE_SECRET_KEY not configured')
    err.status = 503
    err.code = 'STRIPE_UNSET'
    throw err
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(
      json?.error?.message || `Stripe HTTP ${res.status}`,
    )
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  return json
}

export async function getBillingStatus(workspaceId) {
  const { rows } = await query(
    `SELECT stripe_customer_id, stripe_subscription_id, seat_count, billing_status,
            name
     FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (!rows[0]) {
    const err = new Error('workspace not found')
    err.status = 404
    throw err
  }
  const { rows: mem } = await query(
    `SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1`,
    [workspaceId],
  )
  const members = mem[0]?.n ?? 0
  const seats = rows[0].seat_count ?? 0
  const planMax = Number(process.env.QUE_PLAN_MAX_MEMBERS) || 20
  const effectiveMax = seats > 0 ? seats : planMax
  return {
    configured: stripeConfigured(),
    workspaceName: rows[0].name,
    stripeCustomerId: rows[0].stripe_customer_id,
    stripeSubscriptionId: rows[0].stripe_subscription_id,
    seatCount: seats,
    billingStatus: rows[0].billing_status || 'none',
    members,
    effectiveMaxMembers: effectiveMax,
    overSeatSoft: seats > 0 && members > seats,
    note:
      'Wave 4.6 — soft seat limits. Set STRIPE_SECRET_KEY + STRIPE_PRICE_SEAT for Checkout.',
  }
}

export async function createCheckoutSession(workspaceId, opts = {}) {
  const price = process.env.STRIPE_PRICE_SEAT
  if (!price) {
    const err = new Error('STRIPE_PRICE_SEAT not configured')
    err.status = 503
    throw err
  }
  const seats = Math.min(Math.max(Number(opts.seats) || 5, 1), 200)
  const status = await getBillingStatus(workspaceId)
  let customerId = status.stripeCustomerId
  if (!customerId) {
    const customer = await stripeRequest('/customers', 'POST', {
      name: status.workspaceName || workspaceId,
      'metadata[workspace_id]': workspaceId,
    })
    customerId = customer.id
    await query(
      `UPDATE workspaces SET stripe_customer_id = $2 WHERE id = $1`,
      [workspaceId, customerId],
    )
  }
  const session = await stripeRequest('/checkout/sessions', 'POST', {
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': price,
    'line_items[0][quantity]': String(seats),
    success_url: `${publicUrl()}/settings?billing=success`,
    cancel_url: `${publicUrl()}/settings?billing=cancel`,
    'metadata[workspace_id]': workspaceId,
    'subscription_data[metadata][workspace_id]': workspaceId,
  })
  void recordAuditEvent({
    workspaceId,
    action: 'billing.checkout_created',
    resourceType: 'workspace',
    resourceId: workspaceId,
    summary: `Stripe Checkout for ${seats} seat(s)`,
    meta: { sessionId: session.id, seats },
  })
  return { url: session.url, sessionId: session.id, seats }
}

export async function createBillingPortalSession(workspaceId) {
  const status = await getBillingStatus(workspaceId)
  if (!status.stripeCustomerId) {
    const err = new Error('No Stripe customer yet — start Checkout first')
    err.status = 400
    throw err
  }
  const portal = await stripeRequest('/billing_portal/sessions', 'POST', {
    customer: status.stripeCustomerId,
    return_url: `${publicUrl()}/settings`,
  })
  return { url: portal.url }
}

function parseStripeEvent(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    // Dev: accept unsigned when secret unset
    return typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
  }
  if (!signatureHeader) {
    const err = new Error('missing Stripe-Signature')
    err.status = 400
    throw err
  }
  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(',')
      .map((p) => p.split('=').map((x) => x.trim())),
  )
  const ts = parts.t
  const v1 = parts.v1
  if (!ts || !v1) {
    const err = new Error('invalid Stripe-Signature')
    err.status = 400
    throw err
  }
  const text = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)
  const expected = createHmac('sha256', secret)
    .update(`${ts}.${text}`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(v1)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const err = new Error('Stripe signature mismatch')
    err.status = 401
    throw err
  }
  return JSON.parse(text)
}

async function applySubscriptionToWorkspace(workspaceId, sub) {
  const qty =
    sub?.items?.data?.[0]?.quantity ??
    sub?.quantity ??
    (Number(sub?.metadata?.seats) || 0)
  const status = sub?.status || 'active'
  const mapped =
    status === 'active' || status === 'trialing'
      ? status === 'trialing'
        ? 'trialing'
        : 'active'
      : status === 'past_due'
        ? 'past_due'
        : status === 'canceled'
          ? 'canceled'
          : 'active'
  await query(
    `UPDATE workspaces SET
       stripe_subscription_id = $2,
       seat_count = GREATEST($3::int, 0),
       billing_status = $4,
       stripe_customer_id = COALESCE($5, stripe_customer_id)
     WHERE id = $1`,
    [
      workspaceId,
      sub?.id || null,
      Number(qty) || 0,
      mapped,
      sub?.customer || null,
    ],
  )
}

export async function handleStripeWebhook(rawBody, signatureHeader) {
  const event = parseStripeEvent(rawBody, signatureHeader)
  const type = event.type
  const obj = event.data?.object || {}

  if (type === 'checkout.session.completed') {
    const workspaceId =
      obj.metadata?.workspace_id || obj.client_reference_id
    if (workspaceId && obj.subscription) {
      const sub = await stripeRequest(
        `/subscriptions/${obj.subscription}`,
        'GET',
      )
      await applySubscriptionToWorkspace(workspaceId, sub)
      void recordAuditEvent({
        workspaceId,
        action: 'billing.checkout_completed',
        resourceType: 'workspace',
        resourceId: workspaceId,
        summary: 'Stripe Checkout completed',
        meta: { subscriptionId: sub.id, seats: sub.items?.data?.[0]?.quantity },
      })
    }
  } else if (
    type === 'customer.subscription.updated' ||
    type === 'customer.subscription.created'
  ) {
    const workspaceId = obj.metadata?.workspace_id
    if (workspaceId) {
      await applySubscriptionToWorkspace(workspaceId, obj)
    } else if (obj.customer) {
      const { rows } = await query(
        `SELECT id FROM workspaces WHERE stripe_customer_id = $1 LIMIT 1`,
        [obj.customer],
      )
      if (rows[0]) await applySubscriptionToWorkspace(rows[0].id, obj)
    }
  } else if (type === 'customer.subscription.deleted') {
    const workspaceId = obj.metadata?.workspace_id
    let wsId = workspaceId
    if (!wsId && obj.customer) {
      const { rows } = await query(
        `SELECT id FROM workspaces WHERE stripe_customer_id = $1 LIMIT 1`,
        [obj.customer],
      )
      wsId = rows[0]?.id
    }
    if (wsId) {
      await query(
        `UPDATE workspaces SET
           billing_status = 'canceled',
           seat_count = 0,
           stripe_subscription_id = NULL
         WHERE id = $1`,
        [wsId],
      )
    }
  }

  return { received: true, type }
}
