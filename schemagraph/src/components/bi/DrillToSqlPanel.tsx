import { RunInWarehouseButton } from '@/components/warehouse/RunInWarehouseButton'

type Props = {
  sql: string
  chartTitle?: string
  xField?: string
}

/** Phase 4.4 — drill-to-SQL panel with Run in Que Warehouse. */
export function DrillToSqlPanel({ sql, chartTitle, xField }: Props) {
  if (!sql) return null

  return (
    <div className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[10px]">
      <p className="text-[10px] font-bold tracking-[0.6px] text-[#8a9099] uppercase">
        Drill-to-SQL
        {chartTitle ? ` · ${chartTitle}` : ''}
      </p>
      {xField ? (
        <p className="mt-[4px] text-[9px] text-[#6b7380]">
          Click a bar segment on canvas to cross-filter · drill field: {xField}
        </p>
      ) : null}
      <pre className="mt-[8px] max-h-[120px] overflow-auto whitespace-pre-wrap font-mono text-[10px] text-[#c8cdd3]">
        {sql}
      </pre>
      <RunInWarehouseButton sql={sql} showResults className="mt-[8px]" />
    </div>
  )
}
