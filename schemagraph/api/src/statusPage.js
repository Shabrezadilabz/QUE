/**
 * Sprint 11 — Public status page + on-call runbook (SOC 2 evidence).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectOpsSnapshot } from './opsMetrics.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = join(__dirname, '../../docs/ops')

export const ON_CALL_RUNBOOK_ID = 'que-on-call-v1'

export function getOnCallRunbook() {
  let markdown = ''
  try {
    markdown = readFileSync(join(DOCS_ROOT, 'on-call-runbook.md'), 'utf8')
  } catch {
    markdown = [
      '# Que on-call runbook',
      '',
      '## P1 — API down',
      '1. Check `/health` and `/status`',
      '2. Verify Postgres connectivity',
      '3. Page on-call via PagerDuty / Slack #que-incidents',
      '',
      '## P2 — Sync failures spike',
      '1. Review connection health dashboard',
      '2. Check partner ingest webhooks',
      '',
    ].join('\n')
  }
  return {
    id: ON_CALL_RUNBOOK_ID,
    title: 'Que on-call runbook',
    markdown,
    escalation: [
      { level: 'P1', channel: '#que-incidents', slaMin: 15 },
      { level: 'P2', channel: '#que-ops', slaMin: 60 },
      { level: 'P3', channel: 'email:ops@que.dev', slaMin: 480 },
    ],
    playbooks: [
      { id: 'api-down', title: 'API unreachable', steps: 4 },
      { id: 'db-latency', title: 'DB latency > 500ms', steps: 3 },
      { id: 'private-runner', title: 'Private runner callback failures', steps: 5 },
      { id: 'billing-webhook', title: 'Stripe webhook failures', steps: 3 },
    ],
    updatedAt: new Date().toISOString(),
  }
}

function componentFromSnapshot(snap) {
  const dbOk = Boolean(snap.db?.ok)
  const latency = snap.db?.latencyMs ?? -1
  return {
    api: {
      ok: snap.ok,
      latencyMs: latency,
      status: snap.ok ? 'operational' : 'degraded',
    },
    db: {
      ok: dbOk,
      latencyMs: latency,
      status: dbOk ? 'operational' : 'degraded',
    },
    jobs: {
      ok: snap.ok,
      status: snap.ok ? 'operational' : 'degraded',
      note: 'Sync engine shares API pool; see connection sync audit.',
    },
    vector: {
      ok: Boolean(snap.vectorReady),
      status: snap.vectorReady ? 'operational' : 'optional_off',
    },
  }
}

/**
 * Enhanced public status for /status and enterprise status route.
 */
export async function getEnhancedPublicStatus() {
  const snap = await collectOpsSnapshot()
  const components = componentFromSnapshot(snap)
  const runbook = getOnCallRunbook()
  const allOperational =
    components.api.ok && components.db.ok && components.jobs.ok
  return {
    ok: allOperational,
    product: 'Que',
    message: allOperational
      ? 'All systems operational'
      : 'Degraded — one or more components unhealthy',
    components,
    runbook: {
      id: runbook.id,
      title: runbook.title,
      escalation: runbook.escalation,
    },
    inventory: snap.inventory,
    region: snap.region,
    uptimeSec: snap.uptimeSec,
    generatedAt: snap.generatedAt || new Date().toISOString(),
    db: snap.db,
    service: snap.service,
  }
}

export function formatRunbookMarkdown(runbook = getOnCallRunbook()) {
  return runbook.markdown
}
