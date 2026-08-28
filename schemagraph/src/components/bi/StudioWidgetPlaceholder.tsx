type Props = {
  title: string
  reason: 'unbound' | 'warehouse' | 'empty'
  compact?: boolean
}

/**
 * Studio v3 — honest empty tile (no mock chart bars).
 */
export function StudioWidgetPlaceholder({ title, reason, compact }: Props) {
  const msg =
    reason === 'unbound'
      ? 'Bind warehouse SQL or assign a certified dataset with sqlFallback.'
      : reason === 'warehouse'
        ? 'Run on Que Warehouse to load live rows — no managed-plane fallback.'
        : 'Query returned no rows for the current filters.'

  return (
    <div
      className={[
        'flex flex-col items-center justify-center rounded-[4px] border border-dashed border-[#424850] bg-[#0a0c0e] text-center',
        compact ? 'min-h-[80px] px-[8px] py-[12px]' : 'min-h-[120px] px-[12px] py-[16px]',
      ].join(' ')}
    >
      <p className="text-[11px] font-semibold text-[#8a9099]">{title}</p>
      <p className="mt-[6px] max-w-[220px] text-[10px] leading-relaxed text-[#6b7380]">
        {msg}
      </p>
    </div>
  )
}
