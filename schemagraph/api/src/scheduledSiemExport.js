/**
 * Scheduled SIEM webhook push — exports audit events on interval.
 */
import { query } from './db.js'
import { pushSiemWebhook } from './siemExport.js'

export function scheduledSiemExportEnabled() {
  const raw = String(process.env.QUE_SIEM_EXPORT_ENABLED || 'true')
    .trim()
    .toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no'
}

export async function runSiemExportTick() {
  if (!scheduledSiemExportEnabled()) {
    return { skipped: true, reason: 'disabled', results: [] }
  }
  const { rows } = await query(
    `SELECT workspace_id FROM siem_export_state
     WHERE enabled = true
       AND webhook_url IS NOT NULL
       AND TRIM(webhook_url) <> ''
     LIMIT 20`,
  )
  const results = []
  for (const r of rows) {
    try {
      const out = await pushSiemWebhook(r.workspace_id)
      results.push({
        workspaceId: r.workspace_id,
        ok: true,
        pushed: out.pushed ?? 0,
      })
    } catch (err) {
      results.push({
        workspaceId: r.workspace_id,
        ok: false,
        error: String(err.message || err).slice(0, 300),
      })
    }
  }
  return { scanned: rows.length, results }
}

let loopStarted = false

export function startSiemExportLoop() {
  if (loopStarted) return
  loopStarted = true
  const ms = Math.max(
    60_000,
    Number(process.env.QUE_SIEM_EXPORT_TICK_MS) || 10 * 60_000,
  )
  setInterval(() => {
    void runSiemExportTick().catch((err) =>
      console.warn('[Que] SIEM export tick:', err.message || err),
    )
  }, ms)
  console.log(`[Que] SIEM export loop every ${Math.round(ms / 1000)}s`)
}
