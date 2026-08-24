/**
 * Managed Plane — read-only query preview (warehouse + managed datasets).
 * Credentials stay server-side; results never sent to AI Chat.
 */
import { getWorkspaceSettings } from './workspaceSettings.js'
import { isManagedPlaneEnabled, listManagedDatasets, readManagedDatasetRows } from './managedDataPlane.js'
import { getConnectionSecrets, listConnectionsRaw } from './connections.js'
import {
  executeLiveSql,
  prepareReadonlySql,
  resolveLiveTarget,
  LIVE_VALIDATE_MAX_ROWS,
} from './liveExec.js'
import { createPlaneActivityEvent } from './planeActivity.js'
import { landManagedFromConnectionSync } from './managedDataPlane.js'
import { stubCustomerWarehouseMaterializeFromSync } from './materialize.js'
import { scrubGridRows } from './privacy/gridScrub.js'
import { isHidePiiRuleEnabled } from './workspaceRules.js'
import { loadPiiTaggedColumnNames } from './policyPacks.js'

const LIVE_ENGINES = new Set(['postgresql', 'databricks', 'snowflake'])

export const DATA_LANDING_MODES = [
  'schema_only',
  'managed_plane',
  'customer_warehouse',
]

/**
 * @param {string} workspaceId
 * @param {{ sql: string, connectionId?: string|null, datasetId?: string|null, maxRows?: number, userId?: string|null }} opts
 */
export async function previewPlaneQuery(workspaceId, opts = {}) {
  if (!(await isManagedPlaneEnabled(workspaceId))) {
    const err = new Error(
      'Managed Plane is disabled — enable enableManagedDataPlane in Settings',
    )
    err.status = 403
    throw err
  }

  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  if (settings.enableLiveValidate === false) {
    const err = new Error(
      'Live query preview is disabled (Settings → AI & Policy → Live validate)',
    )
    err.status = 403
    throw err
  }

  const sql = String(opts.sql || '').trim()
  if (!sql) {
    const err = new Error('sql is required')
    err.status = 400
    throw err
  }

  const maxRows = Math.min(
    Math.max(Number(opts.maxRows ?? LIVE_VALIDATE_MAX_ROWS), 1),
    LIVE_VALIDATE_MAX_ROWS,
  )
  const prepared = prepareReadonlySql(sql, maxRows)
  const started = Date.now()

  let result
  if (opts.datasetId) {
    result = await previewManagedDataset(workspaceId, opts.datasetId, maxRows, prepared)
  } else if (opts.connectionId) {
    result = await previewWarehouseConnection(
      workspaceId,
      opts.connectionId,
      prepared,
      maxRows,
    )
  } else {
    const slug = await detectManagedSlugInSql(workspaceId, prepared)
    if (slug) {
      result = await previewManagedDataset(workspaceId, slug.datasetId, maxRows, prepared)
    } else {
      const conn = await resolveLiveTarget(workspaceId, {}, null)
      result = await previewWarehouseConnection(
        workspaceId,
        conn.id,
        prepared,
        maxRows,
        conn,
      )
    }
  }

  const durationMs = Date.now() - started

  try {
    await createPlaneActivityEvent(
      workspaceId,
      {
        kind: 'executed',
        source: 'plane_sql',
        actor: 'user',
        title:
          result.target === 'managed'
            ? `Preview ${result.datasetName || 'managed dataset'}`
            : `Preview ${result.connectionName || 'warehouse'}`,
        detail: `${result.rowCount} row(s) · ${result.target}`,
        sql: prepared,
        datasetId: result.datasetId || null,
        connectionId: result.connectionId || null,
        rowCount: result.rowCount,
        durationMs,
      },
      opts.userId ?? null,
    )
  } catch (err) {
    console.warn('[Que] plane preview activity:', err.message || err)
  }

  const hidePii = await isHidePiiRuleEnabled(workspaceId)
  const taggedNames = hidePii ? await loadPiiTaggedColumnNames(workspaceId) : null
  const scrubbedRows = hidePii
    ? scrubGridRows(result.rows || [], result.columns || [], { taggedNames })
    : result.rows || []
  const masked =
    hidePii &&
    JSON.stringify(scrubbedRows) !== JSON.stringify(result.rows || [])

  return {
    ok: true,
    ...result,
    rows: scrubbedRows,
    displayMasked: masked,
    sqlExecuted: prepared,
    durationMs,
    policy: 'plane-readonly-capped',
  }
}

async function detectManagedSlugInSql(workspaceId, sql) {
  const list = await listManagedDatasets(workspaceId)
  const lower = sql.toLowerCase()
  for (const d of list) {
    const slug = String(d.slug || '').toLowerCase()
    if (slug && new RegExp(`\\bfrom\\s+${slug}\\b`, 'i').test(lower)) {
      return { datasetId: d.id, slug: d.slug }
    }
  }
  return null
}

async function previewManagedDataset(workspaceId, datasetId, maxRows, sql) {
  const { dataset, rows } = await readManagedDatasetRows(workspaceId, datasetId, {
    limit: maxRows,
  })
  const columns =
    dataset.columns?.length
      ? dataset.columns.map((c) => ({
          name: c.name,
          dataType: c.dataType || 'text',
        }))
      : rows[0]
        ? Object.keys(rows[0].data || {}).map((name) => ({
            name,
            dataType: 'text',
          }))
        : []

  return {
    target: 'managed',
    datasetId: dataset.id,
    datasetName: dataset.name,
    datasetSlug: dataset.slug,
    connectionId: null,
    connectionName: null,
    columns,
    rows: rows.map((r) => r.data),
    rowCount: rows.length,
    truncated: Number(dataset.rowCount || 0) > rows.length,
    note:
      'Managed dataset preview — SQL semantics not evaluated; showing stored rows (read-only).',
    sqlExecuted: sql,
  }
}

async function previewWarehouseConnection(
  workspaceId,
  connectionId,
  sql,
  maxRows,
  connPrefetched = null,
) {
  const conn =
    connPrefetched || (await getConnectionSecrets(workspaceId, connectionId))
  if (!conn) {
    const err = new Error('connection not found')
    err.status = 404
    throw err
  }
  if (!LIVE_ENGINES.has(conn.type)) {
    const err = new Error(
      `Connection type “${conn.type}” cannot run live SQL preview`,
    )
    err.status = 400
    throw err
  }

  const live = await executeLiveSql(conn, sql, { maxRows })
  return {
    target: 'warehouse',
    datasetId: null,
    datasetName: null,
    datasetSlug: null,
    connectionId: live.connectionId,
    connectionName: live.connectionName,
    engine: live.engine,
    columns: (live.columns || []).map((c) =>
      typeof c === 'string' ? { name: c, dataType: 'text' } : c,
    ),
    rows: live.rows || [],
    rowCount: live.rowCount ?? (live.rows || []).length,
    truncated: Boolean(live.truncated),
    note: null,
    sqlExecuted: live.sqlExecuted,
  }
}

/** List connections that can run plane SQL preview. */
export async function listPlanePreviewConnections(workspaceId) {
  const all = await listConnectionsRaw(workspaceId)
  return all
    .filter((c) => {
      if (!LIVE_ENGINES.has(c.type)) return false
      if (c.type === 'databricks') {
        return Boolean(c.config?.token && c.config?.host && c.config?.warehouseId)
      }
      return true
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      dataLandingMode: c.config?.dataLandingMode || 'schema_only',
    }))
}

/**
 * After schema sync — record landing intent from per-source toggle.
 */
export async function noteSourceLandingAfterSync(
  workspaceId,
  connectionId,
  userId = null,
) {
  const conn = await getConnectionSecrets(workspaceId, connectionId)
  if (!conn) return { noted: false }
  const mode = conn.config?.dataLandingMode || 'schema_only'
  if (mode === 'schema_only') return { noted: false, mode }

  if (mode === 'managed_plane') {
    const land = await landManagedFromConnectionSync(workspaceId, connectionId, {
      userId,
    })
    if (land.landed && land.datasets?.length) {
      const totalRows = land.datasets.reduce(
        (n, d) => n + (d.rowCount || 0),
        0,
      )
      await createPlaneActivityEvent(
        workspaceId,
        {
          kind: 'landed',
          source: 'source_sync',
          actor: 'system',
          title: `Landed ${land.datasets.length} dataset(s) from “${conn.name}”`,
          detail: `Auto-land on sync — ${totalRows} scrubbed row(s) from pinned samples.`,
          connectionId: conn.id,
          rowCount: totalRows,
        },
        userId,
      )
      return { noted: true, mode, landed: land }
    }
    await createPlaneActivityEvent(
      workspaceId,
      {
        kind: 'created',
        source: 'source_sync',
        actor: 'system',
        title: `Source “${conn.name}” set to land in Managed Plane`,
        detail:
          'Schema synced but no pinned samples to land yet — re-sync with samples enabled.',
        connectionId: conn.id,
      },
      userId,
    )
    return { noted: true, mode, landed: land }
  }

  if (mode === 'customer_warehouse') {
    const stub = await stubCustomerWarehouseMaterializeFromSync(
      workspaceId,
      connectionId,
      { userId },
    )
    return { noted: true, mode, planned: stub }
  }

  return { noted: false, mode }
}

export function normalizeDataLandingMode(raw) {
  const v = String(raw || 'schema_only').trim()
  return DATA_LANDING_MODES.includes(v) ? v : 'schema_only'
}
