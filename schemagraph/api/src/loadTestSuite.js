/**
 * Sprint 11 — Load test suite (simulated, no DB).
 * Models 50 concurrent workspace API fan-out for CI thresholds.
 */
import { buildMeteringInvoice, S1_PRICING } from './billingMetering.js'
import { getOnCallRunbook } from './statusPage.js'

const DEFAULT_CONCURRENCY = 50
const DEFAULT_P95_MS = 800

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Simulates a steward workspace session: usage calc + join list shaping. */
export async function simulateWorkspaceSession(workspaceId, seed = 0) {
  const t0 = Date.now()
  const usage = {
    inventory: {
      connections: 3 + (seed % 7),
      members: 2 + (seed % 5),
    },
    usagePct: (seed * 7) % 100,
    nearLimit: seed % 11 === 0 ? ['syncs'] : [],
  }
  const billing = {
    seatCount: seed % 3 === 0 ? 5 : 0,
    members: usage.inventory.members,
    configured: true,
    billingStatus: 'active',
  }
  const invoice = buildMeteringInvoice({
    planTier: seed % 5 === 0 ? 'enterprise' : 'growth',
    usage,
    billing,
    packCount: 1 + (seed % 2),
  })
  // CPU-ish work: stringify/parse loop
  let checksum = 0
  for (let i = 0; i < 1200; i += 1) {
    checksum += JSON.stringify(invoice).length % 97
  }
  await sleep(1 + (seed % 4))
  return {
    workspaceId,
    durationMs: Date.now() - t0,
    checksum,
    totalInr: invoice.totalInr,
  }
}

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  )
  return sorted[idx]
}

/**
 * @param {{ concurrency?: number, maxP95Ms?: number }} [opts]
 */
export async function runLoadTestSuite(opts = {}) {
  const concurrency = Math.min(
    Math.max(Number(opts.concurrency) || DEFAULT_CONCURRENCY, 1),
    200,
  )
  const maxP95Ms = Number(opts.maxP95Ms) || DEFAULT_P95_MS
  const startedAt = Date.now()
  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, i) =>
      simulateWorkspaceSession(`ws-load-${i}`, i),
    ),
  )
  const durations = results.map((r) => r.durationMs)
  const p50Ms = percentile(durations, 50)
  const p95Ms = percentile(durations, 95)
  const p99Ms = percentile(durations, 99)
  const failures = results.filter((r) => !r.totalInr || r.durationMs > maxP95Ms * 2)
  const runbook = getOnCallRunbook()
  const report = {
    ok: p95Ms <= maxP95Ms && failures.length === 0,
    concurrency,
    durationMs: Date.now() - startedAt,
    p50Ms,
    p95Ms,
    p99Ms,
    failures: failures.length,
    threshold: { maxP95Ms, concurrency },
    runbookRef: runbook.id,
    note: 'Simulated load — no database. Use for CI regression on pure API helpers.',
  }
  return report
}

export const LOAD_TEST_DEFAULTS = {
  concurrency: DEFAULT_CONCURRENCY,
  maxP95Ms: DEFAULT_P95_MS,
}

export { S1_PRICING }
