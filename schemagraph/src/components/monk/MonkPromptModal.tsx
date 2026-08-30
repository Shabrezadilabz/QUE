import { Link } from 'react-router-dom'
import { PdfPrimaryButton, PdfGhostButton } from '@/components/pdf/PdfUi'

export interface MonkPromptModalProps {
  connectionId: string
  connectionName: string
  tablesSynced?: number
  warehouseReplicated?: boolean
  onDismiss: () => void
  onRunMonk: () => void
  busy?: boolean
}

/**
 * Phase 1 — shown on /workspace after a new connector sync lands in Que Warehouse.
 * Width uses explicit rem values — theme --spacing-lg overrides max-w-lg (~24px).
 */
export function MonkPromptModal({
  connectionId,
  connectionName,
  tablesSynced = 0,
  warehouseReplicated = false,
  onDismiss,
  onRunMonk,
  busy = false,
}: MonkPromptModalProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-[16px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monk-prompt-title"
    >
      <div className="w-full max-w-[32rem] shrink-0 rounded-[10px] border border-solid border-[#424850] bg-[#1a1f24] p-[24px] shadow-xl">
        <h2
          id="monk-prompt-title"
          className="text-[18px] font-semibold text-[#f0f4f8]"
        >
          Run Monk Mode?
        </h2>
        <p className="mt-[8px] text-[13px] leading-relaxed text-[#aab5c0]">
          <strong className="text-[#d0d8e0]">{connectionName}</strong> synced
          {tablesSynced > 0 ? ` · ${tablesSynced} tables mapped` : ''}
          {warehouseReplicated ? ' · data landed in Que Warehouse' : ''}.
          Monk Mode can generate jobs, metrics, BI dashboards, and pack templates
          from this source.
        </p>
        <p className="mt-[8px] text-[12px] text-[#7a8694]">
          Connection ID: {connectionId.slice(0, 8)}… — you can run Monk later from{' '}
          <Link to="/monk" className="underline">
            Monk Mode
          </Link>
          .
        </p>
        <div className="mt-[20px] flex flex-wrap justify-end gap-[8px]">
          <PdfGhostButton type="button" disabled={busy} onClick={onDismiss}>
            Later
          </PdfGhostButton>
          <PdfPrimaryButton type="button" disabled={busy} onClick={onRunMonk}>
            Run Monk Mode
          </PdfPrimaryButton>
        </div>
      </div>
    </div>
  )
}
