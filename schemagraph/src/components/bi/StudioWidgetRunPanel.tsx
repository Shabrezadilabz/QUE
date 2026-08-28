import { RunInWarehouseButton } from '@/components/warehouse/RunInWarehouseButton'
import type { BiChartPreviewResult } from '@/services/stitchApi'

type Props = {
  chartId: string
  chartTitle?: string
  runOpts?: {
    skipCache?: boolean
    filters?: { field: string; op?: string; value: string }[]
    parameters?: { id: string; label: string; defaultValue?: string; bindField?: string }[]
    parameterOverrides?: Record<string, string>
    crossFilter?: { field: string; value: string } | null
  }
  onResult?: (result: BiChartPreviewResult) => void
}

/**
 * Phase 3 — BI widget warehouse run with stored SQL + board filters.
 */
export function StudioWidgetRunPanel({
  chartId,
  chartTitle,
  runOpts,
  onResult,
}: Props) {
  return (
    <div className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[10px]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <p className="text-[10px] font-bold tracking-[0.6px] text-[#8a9099] uppercase">
          Widget SQL
          {chartTitle ? ` · ${chartTitle}` : ''}
        </p>
        <RunInWarehouseButton
          chartId={chartId}
          chartRunOpts={runOpts}
          compact
          showSql
          showResults
          onChartResult={onResult}
        />
      </div>
      <p className="mt-[6px] text-[9px] text-[#6b7380]">
        Runs on Que Warehouse · row payloads never sent to AI
      </p>
    </div>
  )
}
