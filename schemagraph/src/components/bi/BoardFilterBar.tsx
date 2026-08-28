export type BoardFilter = {
  field: string
  op?: 'eq' | 'contains' | 'gte' | 'lte'
  value: string
}

export type BoardParameter = {
  id: string
  label: string
  defaultValue?: string
  bindField?: string
}

type Props = {
  parameters: BoardParameter[]
  parameterValues: Record<string, string>
  onParameterChange: (id: string, value: string) => void
  filterField: string
  filterValue: string
  onFilterFieldChange: (field: string) => void
  onFilterValueChange: (value: string) => void
  crossFilter: { field: string; value: string; fromChart?: string } | null
  onClearCrossFilter: () => void
  fieldOptions: string[]
  onApply: () => void
  busy?: boolean
}

/** Phase 4.4 — board-level filters + parameters + cross-filter chip. */
export function BoardFilterBar({
  parameters,
  parameterValues,
  onParameterChange,
  filterField,
  filterValue,
  onFilterFieldChange,
  onFilterValueChange,
  crossFilter,
  onClearCrossFilter,
  fieldOptions,
  onApply,
  busy,
}: Props) {
  return (
    <div className="shrink-0 space-y-[10px] border-b border-solid border-[#424850] bg-[#0f1215] px-[16px] py-[12px]">
      <div className="flex flex-wrap items-end gap-[10px]">
        <p className="w-full text-[10px] font-bold tracking-[0.8px] text-[#8a9099] uppercase">
          Board filters · warehouse SQL
        </p>
        {parameters.map((p) => (
          <label key={p.id} className="block min-w-[120px] text-[10px] text-[#a3afbe]">
            {p.label}
            <input
              value={parameterValues[p.id] ?? p.defaultValue ?? ''}
              onChange={(e) => onParameterChange(p.id, e.target.value)}
              className="mt-[4px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
            />
          </label>
        ))}
        <select
          value={filterField}
          onChange={(e) => onFilterFieldChange(e.target.value)}
          className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
        >
          <option value="">Filter field…</option>
          {fieldOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          value={filterValue}
          onChange={(e) => onFilterValueChange(e.target.value)}
          placeholder="Contains…"
          className="min-w-[140px] rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={onApply}
          className="pdf-btn-primary px-[12px] py-[6px] text-[11px] disabled:opacity-40"
        >
          Apply to board
        </button>
      </div>
      {crossFilter ? (
        <div className="flex items-center gap-[8px] text-[11px]">
          <span className="rounded-full border border-[#7aecd0]/40 bg-[#7aecd0]/10 px-[10px] py-[3px] text-[#7aecd0]">
            Cross-filter: {crossFilter.field} = {crossFilter.value}
            {crossFilter.fromChart ? ` (from ${crossFilter.fromChart})` : ''}
          </span>
          <button
            type="button"
            onClick={onClearCrossFilter}
            className="text-[10px] text-[#a3afbe] underline"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  )
}
