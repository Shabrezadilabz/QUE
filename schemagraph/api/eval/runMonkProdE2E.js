/**
 * Live prod E2E — SportEdge on Neon:
 * Monk cert → CEO revenue chat → Que Genie job create.
 *
 * Usage:
 *   QUE_API_BASE=https://your-api.onrender.com \
 *   MONK_E2E_WORKSPACE_ID=... \
 *   MONK_E2E_EMAIL=... MONK_E2E_PASSWORD=... \
 *   node eval/runMonkProdE2E.js
 *
 * Optional: MONK_E2E_SKIP_START=1 if a recent cert run exists.
 * Optional: MONK_E2E_TIMEOUT_MS=600000 (10 min default)
 */
const BASE = process.env.QUE_API_BASE || 'http://localhost:8787'
const WS =
  process.env.MONK_E2E_WORKSPACE_ID ||
  process.env.DEMO_WORKSPACE_ID ||
  '22222222-2222-2222-2222-222222222222'
const EMAIL = process.env.MONK_E2E_EMAIL || 'dev@stitch.local'
const PASSWORD = process.env.MONK_E2E_PASSWORD || 'stitch-dev'
const TIMEOUT_MS = Number(process.env.MONK_E2E_TIMEOUT_MS || 600000)
const SKIP_START = process.env.MONK_E2E_SKIP_START === '1'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else console.log('ok:', msg)
}

async function json(res) {
  const text = await res.text()
  try {
    return { status: res.status, body: text ? JSON.parse(text) : null }
  } catch {
    return { status: res.status, body: text }
  }
}

async function login(headers) {
  const health = await fetch(`${BASE}/health`).then((r) => r.json())
  ok(health.ok === true, 'health ok')
  if (health.authDisabled) return { headers, token: null }

  const login = await json(
    await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }),
  )
  ok(login.status === 200 && login.body?.token, 'login')
  const token = login.body.token
  return {
    token,
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
    },
  }
}

async function pollMonkRun(headers, runId) {
  const started = Date.now()
  let lastSince = null
  let certSeen = false
  let done = false

  while (!done && Date.now() - started < TIMEOUT_MS) {
    const q = lastSince ? `?since=${encodeURIComponent(lastSince)}` : ''
    const ev = await json(
      await fetch(
        `${BASE}/workspaces/${WS}/monk/runs/${runId}/events${q}`,
        { headers },
      ),
    )
    ok(ev.status === 200, `monk events poll ${ev.status}`)
    for (const e of ev.body?.events || []) {
      lastSince = e.createdAt
      if (String(e.message || '').toLowerCase().includes('certif')) {
        certSeen = true
      }
      if (e.level === 'success' && String(e.message).includes('Autopilot certified')) {
        certSeen = true
      }
    }

    const runRes = await json(
      await fetch(`${BASE}/workspaces/${WS}/monk/runs/${runId}`, { headers }),
    )
    const run = runRes.body?.run
    if (run?.status === 'completed' || run?.status === 'failed') {
      done = true
      ok(run.status === 'completed', `monk run ${run.status}`)
      ok(certSeen || run.phase === 'done', 'cert events or done phase')
    } else {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  ok(done, 'monk run finished within timeout')
}

async function main() {
  console.log('Monk prod E2E →', BASE, 'workspace', WS)
  let { headers } = await login({ 'Content-Type': 'application/json' })

  let runId = process.env.MONK_E2E_RUN_ID || null

  if (!SKIP_START) {
    const start = await json(
      await fetch(`${BASE}/workspaces/${WS}/monk/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ packId: 'ecommerce-v1' }),
      }),
    )
    ok(start.status === 201 && start.body?.run?.id, `monk start ${start.status}`)
    runId = start.body?.run?.id
  } else {
    ok(Boolean(runId), 'MONK_E2E_RUN_ID required when SKIP_START=1')
  }

  if (runId) {
    console.log('Polling run', runId)
    await pollMonkRun(headers, runId)
  }

  const chat = await json(
    await fetch(`${BASE}/workspaces/${WS}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'What is Puma revenue?',
        audience: 'ceo',
      }),
    }),
  )
  ok(chat.status === 200 && chat.body?.reply, `CEO revenue chat ${chat.status}`)

  const genie = await json(
    await fetch(`${BASE}/workspaces/${WS}/que-agent/act`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Create a brand revenue summary job from orders and brands',
        pageContext: { route: '/monk', jobId: null },
      }),
    }),
  )
  ok(
    genie.status === 200 && (genie.body?.reply || genie.body?.result),
    `que-agent act ${genie.status}`,
  )

  const cert = await json(
    await fetch(
      `${BASE}/workspaces/${WS}/monk/certification?packId=ecommerce-v1`,
      { headers },
    ),
  )
  ok(cert.status === 200, `certification status ${cert.status}`)

  console.log(failed ? `\n${failed} check(s) failed` : '\nAll Monk prod E2E checks passed')
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
