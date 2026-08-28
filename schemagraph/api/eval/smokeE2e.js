/**
 * Expanded API smoke / flow tests against a running Que API.
 * Usage: node eval/smokeE2e.js
 * Env: QUE_API_BASE (default http://localhost:8787)
 */
const BASE = process.env.QUE_API_BASE || 'http://localhost:8787'
const DEMO_WS =
  process.env.DEMO_WORKSPACE_ID || '22222222-2222-2222-2222-222222222222'

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

async function main() {
  // --- health / ops ---
  const health = await fetch(`${BASE}/health`).then((r) => r.json())
  ok(health.ok === true, 'health ok')
  ok(health.service === 'que-api', 'health service que-api')
  ok(typeof health.worker?.enabled === 'boolean', 'health worker rollup')

  const openapi = await fetch(`${BASE}/openapi.json`)
  ok(openapi.ok, 'openapi.json served')

  const sso = await fetch(`${BASE}/auth/sso`).then((r) => r.json())
  ok(sso.ok === true && sso.sso, 'sso status endpoint')

  // --- auth ---
  let token = null
  if (!health.authDisabled) {
    const bad = await json(
      await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'dev@stitch.local',
          password: 'wrong-password',
        }),
      }),
    )
    ok(bad.status === 401, 'bad password → 401')

    const login = await json(
      await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'dev@stitch.local',
          password: 'stitch-dev',
        }),
      }),
    )
    ok(login.status === 200 && Boolean(login.body?.token), 'password login')
    token = login.body.token
    ok(
      Array.isArray(login.body?.workspaces) && login.body.workspaces.length > 0,
      'login returns workspaces',
    )

    const me = await json(
      await fetch(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
    ok(me.status === 200 && me.body?.user?.email === 'dev@stitch.local', 'auth/me')
  } else {
    console.log('skip: auth flows (authDisabled)')
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  // --- settings ---
  const settings = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/settings`, { headers }),
  )
  ok(settings.status === 200 && settings.body?.ok, `settings GET ${settings.status}`)
  ok(
    settings.body?.settings &&
      typeof settings.body.settings.scrubSamples !== 'undefined',
    'settings has scrubSamples',
  )

  // --- sources / schema ---
  const sources = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/sources`, { headers }),
  )
  ok(sources.status === 200, `sources ${sources.status}`)

  const schema = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/schema`, { headers }),
  )
  ok(schema.status === 200 && Array.isArray(schema.body?.tables), 'schema tables[]')
  ok(Array.isArray(schema.body?.relationships), 'schema relationships[]')

  // --- create fixture connection + sync (idempotent name with suffix) ---
  const connName = `e2e_sf_${Date.now()}`
  const created = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/connections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: connName,
        type: 'snowflake',
        config: {
          mode: 'fixture',
          account: 'e2e',
          warehouse: 'e2e',
          database: 'E2E',
          schema: 'PUBLIC',
          username: 'e2e',
          password: 'e2e-secret-password',
        },
      }),
    }),
  )
  ok(created.status === 201 && created.body?.connection?.id, 'create snowflake fixture')
  const connectionId = created.body?.connection?.id
  ok(created.body?.connection?.hasSecrets === true, 'connection hasSecrets')
  const pubCfg = created.body?.connection?.config || {}
  ok(
    !String(JSON.stringify(pubCfg)).includes('e2e-secret-password'),
    'create response does not echo plaintext password',
  )

  if (connectionId) {
    const synced = await json(
      await fetch(
        `${BASE}/workspaces/${DEMO_WS}/connections/${connectionId}/sync`,
        { method: 'POST', headers, body: '{}' },
      ),
    )
    ok(synced.status === 200 && synced.body?.ok, `sync fixture ${synced.status}`)
    ok(
      (synced.body?.tablesSynced ?? 0) > 0 ||
        (synced.body?.schema?.tables?.length ?? 0) > 0,
      'sync returned tables',
    )

    // cleanup connection
    const del = await json(
      await fetch(
        `${BASE}/workspaces/${DEMO_WS}/connections/${connectionId}`,
        { method: 'DELETE', headers },
      ),
    )
    ok(del.status === 200 || del.status === 204 || del.body?.ok, 'delete connection')
  }

  // --- jobs list + optional create/run/export ---
  const jobs = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/jobs`, { headers }),
  )
  ok(jobs.status === 200, `jobs list ${jobs.status}`)

  const jobCreate = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `E2E smoke job ${Date.now()}`,
        notebook: [
          { id: 'c1', type: 'markdown', content: '# E2E' },
          {
            id: 'c2',
            type: 'sql',
            content: 'SELECT 1 AS n',
            language: 'sql',
          },
        ],
      }),
    }),
  )
  const jobId = jobCreate.body?.job?.id
  ok(jobCreate.status === 201 && jobId, `create job ${jobCreate.status}`)

  if (jobId) {
    const run = await json(
      await fetch(`${BASE}/workspaces/${DEMO_WS}/jobs/${jobId}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'dry_run' }),
      }),
    )
    ok(run.status === 201 || run.status === 200, `job dry_run ${run.status}`)

    const ready = await json(
      await fetch(`${BASE}/workspaces/${DEMO_WS}/jobs/${jobId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'ready' }),
      }),
    )
    ok(ready.status === 200, `mark ready ${ready.status}`)

    const exp = await json(
      await fetch(`${BASE}/workspaces/${DEMO_WS}/jobs/${jobId}/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ format: 'json', force: true }),
      }),
    )
    ok(
      exp.status === 200 && exp.body?.export?.attestation,
      `export json+attestation ${exp.status}`,
    )

    if (exp.body?.export?.attestation) {
      const ver = await json(
        await fetch(`${BASE}/auth/attestation/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exp.body.export.attestation),
        }),
      )
      ok(ver.status === 200 && ver.body?.ok === true, 'attestation verify endpoint')
    }
  }

  // --- platform modules (hub, observe, pack studio, agent runtime) ---
  const hub = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/platform/hub`, { headers }),
  )
  ok(hub.status === 200 && hub.body?.hub?.modules?.length === 6, 'platform hub 6 modules')
  ok(hub.body?.hub?.phase1?.readiness?.status, 'platform hub phase1 readiness')
  ok(hub.body?.hub?.phase5?.readiness?.status, 'platform hub phase5 load ops')

  const loadSummary = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/load/summary`, { headers }),
  )
  ok(
    loadSummary.status === 200 && loadSummary.body?.summary?.readiness?.status,
    'load ops summary',
  )

  const observe = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/observe/summary`, { headers }),
  )
  ok(observe.status === 200 && observe.body?.dashboard, 'observe summary')
  ok(
    observe.body?.dashboard?.load?.readiness?.status,
    'observe load readiness',
  )

  const packStudio = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/pack-studio/summary`, { headers }),
  )
  ok(
    packStudio.status === 200 && packStudio.body?.summary?.readiness,
    'pack studio summary',
  )

  const agentRt = await json(
    await fetch(
      `${BASE}/workspaces/${DEMO_WS}/agent/runtime-status?pageId=chat`,
      { headers },
    ),
  )
  ok(
    agentRt.status === 200 && agentRt.body?.runtime?.summary,
    'agent runtime status',
  )

  const autofill = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/autofill?page=load`, { headers }),
  )
  ok(autofill.status === 200 && autofill.body?.page, 'page autofill load')

  const warehouse = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/warehouse`, { headers }),
  )
  ok(
    warehouse.status === 200 && warehouse.body?.provisioned === true,
    'warehouse auto-provision status',
  )
  ok(
    warehouse.body?.replicateDefaultOn !== false,
    'warehouse replicate default on',
  )
  ok(
    warehouse.body?.readiness?.status && warehouse.body?.readiness?.label,
    'warehouse phase1 readiness',
  )

  const execution = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/execution/summary`, { headers }),
  )
  ok(
    execution.status === 200 && execution.body?.summary?.readiness,
    'execution summary',
  )

  const studio = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/studio/summary`, { headers }),
  )
  ok(studio.status === 200 && studio.body?.summary?.readiness, 'studio summary')

  const queMl = await json(
    await fetch(
      `${BASE}/workspaces/${DEMO_WS}/studio/que-ml?reportId=sportedge-exec`,
      { headers },
    ),
  )
  ok(
    queMl.status === 200 && queMl.body?.bundle?.format === 'que-ml-v1',
    'studio que-ml bundle',
  )

  const ssmEvents = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/ssm/events?limit=5`, { headers }),
  )
  ok(ssmEvents.status === 200 && Array.isArray(ssmEvents.body?.items), 'ssm events')

  const ssmExport = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/ssm/export?limit=10`, { headers }),
  )
  ok(
    ssmExport.status === 200 && ssmExport.body?.export?.format === 'que-ssm-b-export-v1',
    'ssm export bundle',
  )

  const ssmModel = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/ssm/model`, { headers }),
  )
  ok(
    ssmModel.status === 200 &&
      ssmModel.body?.status?.trained === true &&
      ssmModel.body?.status?.modelId === 'ssm-b-trained-v1',
    'ssm trained model status',
  )

  const ssmAb = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/ssm/route-ab`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'build revenue dashboard', pageContext: 'chat' }),
    }),
  )
  ok(
    ssmAb.status === 200 && ssmAb.body?.comparison?.recommendedIntent,
    'ssm route A/B',
  )

  const biAccess = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/studio/access/me`, { headers }),
  )
  ok(
    biAccess.status === 200 && typeof biAccess.body?.summary?.unrestricted === 'boolean',
    'bi access summary',
  )

  // --- chat ---
  const chat = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: '/help' }),
    }),
  )
  ok(chat.status === 200 && chat.body?.ok && chat.body?.reply, `chat /help ${chat.status}`)

  const chatSchema = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'list tables in workspace',
        audience: 'engineer',
      }),
    }),
  )
  ok(
    chatSchema.status === 200 && chatSchema.body?.graphContext?.ssmRouting?.routingSource,
    'chat graphContext ssmRouting',
  )

  const queExpr = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/studio/que-expr/compile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ formula: 'SUM(amount)', table: 'raw_orders' }),
    }),
  )
  ok(
    queExpr.status === 200 && queExpr.body?.compiled?.mode === 'expr',
    'que-expr compile',
  )

  const whWorker = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/warehouse/worker`, { headers }),
  )
  ok(
    whWorker.status === 200 && typeof whWorker.body?.worker?.enabled === 'boolean',
    'warehouse worker status',
  )

  // --- drift / bi ---
  const drift = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/drift`, { headers }),
  )
  ok(drift.status === 200 && drift.body?.ok, `drift list ${drift.status}`)

  const bi = await json(
    await fetch(`${BASE}/workspaces/${DEMO_WS}/bi-lineage`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tool: 'looker',
        assets: [{ name: 'e2e_explore', dependsOn: ['public.missing'] }],
      }),
    }),
  )
  ok(bi.status === 200 && bi.body?.ok, `bi-lineage post ${bi.status}`)

  // --- invites (admin) ---
  if (token) {
    const inviteEmail = `e2e_${Date.now()}@example.com`
    const inv = await json(
      await fetch(`${BASE}/workspaces/${DEMO_WS}/invites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: inviteEmail, role: 'member' }),
      }),
    )
    ok(inv.status === 201 && inv.body?.invite?.id, `create invite ${inv.status}`)
    if (inv.body?.invite?.id) {
      const rev = await json(
        await fetch(
          `${BASE}/workspaces/${DEMO_WS}/invites/${inv.body.invite.id}`,
          { method: 'DELETE', headers },
        ),
      )
      ok(rev.status === 200, `revoke invite ${rev.status}`)
    }
  }

  // --- role gate: viewer cannot create connection ---
  if (!health.authDisabled) {
    const viewerLogin = await json(
      await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'viewer@stitch.local',
          password: 'stitch-viewer',
        }),
      }),
    )
    if (viewerLogin.body?.token) {
      const forbidden = await json(
        await fetch(`${BASE}/workspaces/${DEMO_WS}/connections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${viewerLogin.body.token}`,
          },
          body: JSON.stringify({
            name: `viewer_should_fail_${Date.now()}`,
            type: 'snowflake',
            config: { mode: 'fixture' },
          }),
        }),
      )
      ok(forbidden.status === 403, 'viewer cannot create connection')
    } else {
      console.log('skip: viewer role gate (no viewer login)')
    }
  }

  if (failed) {
    console.error(`[Que] smoke e2e FAILED (${failed})`)
    process.exit(1)
  }
  console.log('[Que] smoke e2e PASSED')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
