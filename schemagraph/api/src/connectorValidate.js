/**
 * S5 — Live connector validation (BigQuery + Salesforce).
 */
import { introspectBigQuery } from './connectors/bigquery.js'
import { introspectSalesforce } from './connectors/salesforce.js'
import { runReadonlyQuery as runBqReadonly } from './connectors/bigquery.js'
import { getConnectionSecrets } from './connections.js'
import { prepareReadonlySql } from './liveExec.js'

export async function validateConnectionLive(workspaceId, connectionId) {
  const conn = await getConnectionSecrets(workspaceId, connectionId)
  if (!conn) {
    const err = new Error('connection not found')
    err.status = 404
    throw err
  }

  const config = { ...(conn.config || {}), mode: 'live' }

  if (conn.type === 'bigquery') {
    const intro = await introspectBigQuery({
      ...config,
      includeSamples: true,
      maxTables: 5,
    })
    const projectId = config.projectId || config.project
    const dataset = config.dataset || config.schema
    const sampleSql = dataset
      ? `SELECT 1 AS que_validate FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.TABLES\` LIMIT 1`
      : 'SELECT 1 AS que_validate'
    const live = await runBqReadonly(config, sampleSql, { maxRows: 1 })
    return {
      type: 'bigquery',
      ok: true,
      tablesFound: intro.tables?.length || 0,
      liveExec: true,
      rowCount: live.rows?.length || 0,
      meta: intro.meta,
    }
  }

  if (conn.type === 'salesforce') {
    const intro = await introspectSalesforce({
      ...config,
      includeSamples: true,
      maxObjects: 8,
      objects: config.objects || ['Account', 'Contact', 'Opportunity'],
    })
    return {
      type: 'salesforce',
      ok: true,
      objectsFound: intro.tables?.length || 0,
      foreignKeys: intro.foreignKeys?.length || 0,
      incrementalReady: config.incrementalSync !== false,
      meta: intro.meta,
    }
  }

  if (conn.type === 'postgresql') {
    const sql = prepareReadonlySql('SELECT 1 AS que_validate')
    const { executeLiveSql } = await import('./liveExec.js')
    const live = await executeLiveSql(conn, sql, { maxRows: 1 })
    return {
      type: 'postgresql',
      ok: true,
      liveExec: true,
      rowCount: live.rows?.length || 0,
    }
  }

  return {
    type: conn.type,
    ok: false,
    skipped: true,
    reason: 'validate_live not implemented for this connector — use sync',
  }
}
