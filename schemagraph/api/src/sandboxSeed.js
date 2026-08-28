/**
 * S1.3 — Self-serve sandbox workspace seed after register.
 * Applies demo-friendly settings + SportEdge starter connection stub.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

export const SANDBOX_WORKSPACE_SETTINGS = {
  sandbox: true,
  includeSamplesDefault: true,
  scrubSamples: true,
  aiMayUsePinnedSamples: true,
  pinnedSampleRows: 10,
  enableManagedDataPlane: true,
  defaultExecutionPlane: 'managed',
  enableStitchAgent: true,
  enableCatalogGovernance: true,
  enableMonkMode: true,
  managedMaxDatasets: 25,
  managedMaxRowsPerDataset: 10000,
  managedRetentionDays: 90,
  onboardingPath: 'sportedge-monk',
}

/** Seed sandbox artifacts for a newly registered workspace. Idempotent. */
export async function seedSandboxWorkspace(workspaceId) {
  if (!workspaceId) return { seeded: false, reason: 'no_workspace' }

  const { rows: wsRows } = await query(
    `SELECT settings_json FROM workspaces WHERE id = $1`,
    [workspaceId],
  )
  if (!wsRows.length) return { seeded: false, reason: 'workspace_not_found' }

  const prev = wsRows[0].settings_json || {}
  if (prev.sandboxSeeded === true) {
    return { seeded: true, workspaceId, already: true }
  }

  const settings = {
    ...prev,
    ...SANDBOX_WORKSPACE_SETTINGS,
    sandboxSeeded: true,
    sandboxSeededAt: new Date().toISOString(),
  }

  await query(
    `UPDATE workspaces SET settings_json = $2::jsonb WHERE id = $1`,
    [workspaceId, JSON.stringify(settings)],
  )

  const { rows: existingConn } = await query(
    `SELECT id FROM connections WHERE workspace_id = $1 AND name = $2 LIMIT 1`,
    [workspaceId, 'SportEdge Sandbox'],
  )

  if (!existingConn.length) {
    await query(
      `INSERT INTO connections (
         id, workspace_id, name, source_type, status, config_json
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        randomUUID(),
        workspaceId,
        'SportEdge Sandbox',
        'postgres',
        'pending',
        JSON.stringify({
          sandbox: true,
          note: 'Connect SportEdge Postgres or use shared demo — Sources → Sync → Monk',
          hostHint: process.env.QUE_SANDBOX_PG_HOST || 'See docs/DEPLOY-FREE.md',
          databaseHint: process.env.QUE_SANDBOX_PG_DB || 'sportedge',
          suggestedPack: 'ecommerce-v1',
        }),
      ],
    )
  }

  return { seeded: true, workspaceId, already: false }
}

export function sandboxRegisterEnabled() {
  return (
    String(process.env.QUE_SANDBOX_REGISTER || 'true').toLowerCase() !== 'false'
  )
}
