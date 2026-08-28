import { useCallback, useEffect, useState } from 'react'
import {
  fetchReportBoardConfig,
  refreshReportBoardApi,
  updateReportBoardConfigApi,
  type ReportBoardConfig,
} from '@/services/stitchApi'
import { PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'

type Props = {
  reportId: string
  canWrite: boolean
  onRefreshAll?: () => void
  onToast?: (msg: string) => void
}

/**
 * Phase 4.5 — scheduled refresh controls + webhook config for Report Studio boards.
 */
export function StudioBoardSchedulePanel({
  reportId,
  canWrite,
  onRefreshAll,
  onToast,
}: Props) {
  const [config, setConfig] = useState<ReportBoardConfig | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [refreshOnJob, setRefreshOnJob] = useState(true)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const c = await fetchReportBoardConfig(reportId)
    setConfig(c)
    setWebhookUrl(c.refreshWebhookUrl || '')
    setRefreshOnJob(c.refreshOnJobComplete !== false)
  }, [reportId])

  useEffect(() => {
    void reload().catch(() => setConfig(null))
  }, [reload])

  async function saveConfig() {
    if (!canWrite) return
    setBusy(true)
    try {
      const c = await updateReportBoardConfigApi(reportId, {
        refreshWebhookUrl: webhookUrl.trim(),
        refreshOnJobComplete: refreshOnJob,
      })
      setConfig(c)
      onToast?.('Board refresh settings saved')
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function triggerRefresh() {
    setBusy(true)
    try {
      onRefreshAll?.()
      const out = await refreshReportBoardApi(reportId)
      if (out.skipped) {
        onToast?.('No refresh webhook URL — saved settings only')
      } else {
        onToast?.(`Refresh webhook sent${out.ok ? '' : ' (pending)'}`)
      }
      await reload()
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!config) return null

  return (
    <div className="mt-[10px] rounded-[8px] border border-[#424850] bg-[#121619] p-[12px]">
      <p className="text-[10px] font-bold tracking-[0.8px] text-[#8a9099] uppercase">
        Scheduled refresh · {reportId}
      </p>
      <div className="mt-[8px] flex flex-wrap items-end gap-[10px]">
        <label className="block min-w-[220px] flex-1 text-[10px] text-[#a3afbe]">
          Refresh webhook URL
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            disabled={!canWrite || busy}
            placeholder="https://hooks.example.com/que-board-refresh"
            className="mt-[4px] w-full rounded-[4px] border border-[#424850] bg-[#0f1215] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
          />
        </label>
        <label className="flex items-center gap-[6px] pb-[6px] text-[11px] text-[#a3afbe]">
          <input
            type="checkbox"
            checked={refreshOnJob}
            onChange={(e) => setRefreshOnJob(e.target.checked)}
            disabled={!canWrite || busy}
          />
          Refresh on job complete
        </label>
      </div>
      <div className="mt-[8px] flex flex-wrap gap-[8px]">
        {canWrite ? (
          <PdfGhostButton type="button" disabled={busy} onClick={() => void saveConfig()}>
            Save schedule
          </PdfGhostButton>
        ) : null}
        <PdfPrimaryButton
          type="button"
          disabled={busy}
          onClick={() => void triggerRefresh()}
          className="px-[12px] py-[6px] text-[11px]"
        >
          Run all + refresh
        </PdfPrimaryButton>
      </div>
      {config.lastRefreshAt ? (
        <p className="mt-[6px] text-[10px] text-[#6b7380]">
          Last refresh: {new Date(config.lastRefreshAt).toLocaleString()}
        </p>
      ) : (
        <p className="mt-[6px] text-[10px] text-[#6b7380]">
          Cross-filter: click a chart segment on the canvas · drill SQL in the
          right rail when a visual is selected.
        </p>
      )}
    </div>
  )
}
