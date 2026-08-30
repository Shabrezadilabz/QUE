export function BackendBusyOverlay({
  active,
  label = 'Updating…',
}: {
  active: boolean
  label?: string
}) {
  if (!active) return null
  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-black/45"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex min-w-[220px] flex-col items-center gap-[12px] rounded-[10px] border border-solid border-[#424850] bg-[#1a1e24] px-[28px] py-[22px] shadow-xl">
        <span
          className="size-[32px] animate-spin rounded-full border-[3px] border-[#424850] border-t-[#d0d8e0]"
          aria-hidden
        />
        <p className="text-[13px] font-semibold text-[#d4dbe3]">{label}</p>
      </div>
    </div>
  )
}
