/**
 * Sprint 10 — Orchestrator recipe templates (Kestra, n8n) + partner ingest patterns.
 */
import { getWorkspaceSettings } from './workspaceSettings.js'

export const ORCHESTRATOR_KINDS = [
  'generic',
  'airflow',
  'dagster',
  'kestra',
  'n8n',
  'airbyte',
  'fivetran',
]

export function buildMonkStartPayload(workspaceId, opts = {}) {
  return {
    event: 'que.monk.start',
    workspaceId,
    packId: opts.packId || 'ecommerce-v1',
    multiSource: opts.multiSource !== false,
    at: new Date().toISOString(),
    api: {
      method: 'POST',
      path: `/workspaces/${workspaceId}/monk/start`,
      body: { packId: opts.packId || 'ecommerce-v1' },
    },
  }
}

export function getKestraMonkRecipe(workspaceId, opts = {}) {
  const base = opts.apiBase || 'https://api.que.dev'
  const packId = opts.packId || 'ecommerce-v1'
  return {
    format: 'kestra',
    description: 'Run Que Monk Mode after warehouse sync completes',
    yaml: `id: que_monk_after_sync
namespace: que.integrations

tasks:
  - id: start_monk
    type: io.kestra.plugin.core.http.Request
    uri: "${base}/workspaces/${workspaceId}/monk/start"
    method: POST
    headers:
      Authorization: "Bearer \${{ secret('QUE_API_TOKEN') }}"
      Content-Type: application/json
    body: |
      {"packId": "${packId}"}

triggers:
  - id: on_fivetran_webhook
    type: io.kestra.plugin.core.trigger.Webhook
    key: que-post-sync
`,
  }
}

export function getN8nMonkRecipe(workspaceId, opts = {}) {
  const base = opts.apiBase || 'https://api.que.dev'
  const packId = opts.packId || 'ecommerce-v1'
  return {
    format: 'n8n',
    description: 'n8n workflow — webhook → Que Monk start',
    workflow: {
      name: 'Que Monk after ingest',
      nodes: [
        {
          name: 'Webhook',
          type: 'n8n-nodes-base.webhook',
          parameters: { path: 'que-post-sync', httpMethod: 'POST' },
        },
        {
          name: 'Start Monk',
          type: 'n8n-nodes-base.httpRequest',
          parameters: {
            method: 'POST',
            url: `${base}/workspaces/${workspaceId}/monk/start`,
            authentication: 'genericCredentialType',
            jsonBody: JSON.stringify({ packId }),
          },
        },
      ],
      connections: {
        Webhook: { main: [[{ node: 'Start Monk', type: 'main', index: 0 }]] },
      },
    },
  }
}

export function getAirbyteIngestPattern(workspaceId) {
  return {
    partner: 'airbyte',
    event: 'que.integrations.ingest_hook',
    description:
      'Call Que after Airbyte sync success — infer joins and optionally queue Monk.',
    webhook: {
      method: 'POST',
      path: `/workspaces/${workspaceId}/integrations/ingest-hook`,
      body: {
        source: 'airbyte',
        connectionId: '<que-connection-uuid>',
        status: 'succeeded',
        tablesSynced: 12,
        queueMonk: true,
        packId: 'ecommerce-v1',
      },
    },
    docsPath: 'docs/orchestration/airbyte-fivetran-hook.md',
  }
}

export function getFivetranIngestPattern(workspaceId) {
  return {
    partner: 'fivetran',
    event: 'que.integrations.ingest_hook',
    description:
      'Fivetran webhook → Que post-sync automation (stack, do not replace).',
    webhook: {
      method: 'POST',
      path: `/workspaces/${workspaceId}/integrations/ingest-hook`,
      body: {
        source: 'fivetran',
        connectionId: '<que-connection-uuid>',
        status: 'sync_end',
        queueMonk: false,
      },
    },
    docsPath: 'docs/orchestration/airbyte-fivetran-hook.md',
  }
}

export async function getOrchestratorRecipes(workspaceId, opts = {}) {
  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const apiBase = opts.apiBase || process.env.QUE_PUBLIC_API_BASE || ''
  const packId = opts.packId || settings.postSyncMonkPackId || 'ecommerce-v1'
  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    monkStartPayload: buildMonkStartPayload(workspaceId, { packId }),
    kestra: getKestraMonkRecipe(workspaceId, { apiBase, packId }),
    n8n: getN8nMonkRecipe(workspaceId, { apiBase, packId }),
    airbyte: getAirbyteIngestPattern(workspaceId),
    fivetran: getFivetranIngestPattern(workspaceId),
    supportedKinds: ORCHESTRATOR_KINDS,
  }
}
