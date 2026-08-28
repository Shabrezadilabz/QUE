import { useCallback, useEffect, useState } from 'react'
import {
  executeBiChartApi,
  executeWarehouseSql,
  fetchBiChartDrillSql,
  type BiChartPreviewResult,
} from '@/services/stitchApi'
import {
  ChatLiveResults,
  type ChatLiveQueryResult,
} from '@/components/chat/ChatLiveResults'

type ChartRunOpts = {
  skipCache?: boolean
  limit?: number
  filters?: { field: string; op?: string; value: string }[]
  parameters?: { id: string; label: string; defaultValue?: string; bindField?: string }[]
  parameterOverrides?: Record<string, string>
  crossFilter?: { field: string; value: string } | null
  drill?: { field: string; value: string } | null
}

interface RunInWarehouseButtonProps {
  sql?: string
  /** BI widget — runs stored SQL + board filters via warehouse executor */
  chartId?: string
  chartRunOpts?: ChartRunOpts
  className?: string
  compact?: boolean
  label?: string
  /** Show results inline below the button */
  showResults?: boolean
  showSql?: boolean
  onResult?: (result: ChatLiveQueryResult) => void
  onChartResult?: (result: BiChartPreviewResult) => void
  /** Override default warehouse execute (e.g. Model IDE /model/run) */
  runFn?: () => Promise<ChatLiveQueryResult>
}

function previewToLive(
  out: BiChartPreviewResult,
  started: number,
): ChatLiveQueryResult {
  const columns = out.rows?.[0] ? Object.keys(out.rows[0]) : []
  return {
    ok: true,
    columns,
    rows: out.rows || [],
    rowCount: (out.rows || []).length,
    connectionName: 'Que Warehouse',
    durationMs: out.durationMs ?? Date.now() - started,
    aiIsolation: 'row_payloads_never_sent_to_model',
    policy: out.source === 'que_warehouse' ? 'que-warehouse-readonly' : 'que-bi-widget',
    sql: out.sql,
    source: out.source,
    cached: out.cached,
    note: out.note,
  }
}

/**
 * Phase 3 — explicit read-only execute against the workspace Que Warehouse.
 * Row payloads stay in the UI only — never sent to the AI model.
 */
export function RunInWarehouseButton({
  sql,
  chartId,
  chartRunOpts,
  className = '',
  compact = false,
  label,
  showResults = true,
  showSql = false,
  onResult,
  onChartResult,
  runFn,
}: RunInWarehouseButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ChatLiveQueryResult | null>(null)
  const [resolvedSql, setResolvedSql] = useState(String(sql || '').trim())

  useEffect(() => {
    setResolvedSql(String(sql || '').trim())
  }, [sql])

  useEffect(() => {
    if (!chartId) return
    void fetchBiChartDrillSql(chartId, {
      crossFilter: chartRunOpts?.crossFilter ?? undefined,
    })
      .then((r) => setResolvedSql(String(r.sql || '').trim()))
      .catch(() => setResolvedSql(''))
  }, [chartId, chartRunOpts?.crossFilter, chartRunOpts?.filters, chartRunOpts?.parameterOverrides])

  const canRun = Boolean(chartId || runFn || resolvedSql)

  const run = useCallback(async () => {
    if (!canRun || busy) return
    setBusy(true)
    setError(null)
    const started = Date.now()
    try {
      let live: ChatLiveQueryResult
      if (runFn) {
        live = await runFn()
      } else if (chartId) {
        const out = await executeBiChartApi(chartId, {
          ...chartRunOpts,
          skipCache: chartRunOpts?.skipCache ?? true,
        })
        if (out.sql) setResolvedSql(out.sql)
        onChartResult?.(out)
        live = previewToLive(out, started)
      } else {
        const exec = await executeWarehouseSql(resolvedSql)
        const columns = (exec.columns || []).map((c) => c.name)
        live = {
          ok: true,
          columns,
          rows: exec.rows || [],
          rowCount: (exec.rows || []).length,
          connectionName: 'Que Warehouse',
          durationMs: Date.now() - started,
          aiIsolation: 'row_payloads_never_sent_to_model',
          policy: 'que-warehouse-readonly',
          sql: resolvedSql,
        }
      }
      if (!live.ok) {
        setError(live.error || 'Run failed')
      }
      setResult(live)
      onResult?.(live)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      const fail: ChatLiveQueryResult = { ok: false, error: msg }
      setResult(fail)
      onResult?.(fail)
    } finally {
      setBusy(false)
    }
  }, [
    canRun,
    busy,
    runFn,
    chartId,
    chartRunOpts,
    resolvedSql,
    onResult,
    onChartResult,
  ])

  if (!canRun) return null

  const buttonLabel =
    label ?? (busy ? 'Running…' : compact ? '▶ Run in WH' : '▶ Run in Que Warehouse')

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className={
          compact
            ? 'pdf-btn-ghost px-[10px] py-[4px] text-[11px] font-medium text-[#7aecd0] disabled:opacity-50'
            : 'rounded-lg border border-[#7aecd0]/40 bg-[#7aecd0]/10 px-sm py-xs font-label text-[11px] font-medium text-[#7aecd0] hover:bg-[#7aecd0]/15 disabled:opacity-50'
        }
        title="Execute read-only SQL in your workspace Que Warehouse — results never sent to AI"
      >
        {busy ? 'Running…' : buttonLabel}
      </button>
      {showSql && resolvedSql ? (
        <pre className="mt-[8px] max-h-[100px] overflow-auto whitespace-pre-wrap rounded-[4px] border border-[#424850] bg-[#0f1215] p-[8px] font-mono text-[10px] text-[#c8cdd3]">
          {resolvedSql}
        </pre>
      ) : null}
      {error ? (
        <p className="mt-[6px] text-[10px] text-[var(--pdf-error,#f87171)]">{error}</p>
      ) : null}
      {showResults && result ? (
        <div className="mt-sm">
          <ChatLiveResults liveQuery={result} />
        </div>
      ) : null}
    </div>
  )
}
