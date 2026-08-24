import type { DataLandingMode } from '@/types/dataSource'

const OPTIONS: { value: DataLandingMode; label: string }[] = [
  { value: 'schema_only', label: 'Schema only' },
  { value: 'managed_plane', label: 'Land → Managed' },
  { value: 'customer_warehouse', label: 'Land → Warehouse' },
]

export function readDataLandingMode(
  config?: Record<string, unknown>,
): DataLandingMode {
  const v = config?.dataLandingMode
  if (v === 'managed_plane' || v === 'customer_warehouse') return v
  return 'schema_only'
}

interface SourceLandingModeSelectProps {
  value: DataLandingMode
  disabled?: boolean
  onChange: (mode: DataLandingMode) => void
}

/** Per-source toggle — where synced data should land (preference; full ETL via Jobs). */
export function SourceLandingModeSelect({
  value,
  disabled,
  onChange,
}: SourceLandingModeSelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as DataLandingMode)}
      className="max-w-[140px] rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-input)] px-[6px] py-[4px] text-[11px] text-[var(--pdf-text-primary)]"
      title="Data landing mode after sync"
      onClick={(e) => e.stopPropagation()}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
