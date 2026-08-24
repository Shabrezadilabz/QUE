import { openManagedPlane } from '@/plane/openPlaneHandoff'
import { handoffChatSqlToPlaneApi } from '@/services/stitchApi'

interface OpenInManagedPlaneButtonProps {
  sql: string
  detail?: string
  className?: string
  compact?: boolean
}

/** Chat handoff — records draft server-side and opens /plane in new tab. */
export function OpenInManagedPlaneButton({
  sql,
  detail,
  className = '',
  compact = false,
}: OpenInManagedPlaneButtonProps) {
  return (
    <button
      type="button"
      className={[
        compact
          ? 'pdf-btn-ghost px-[10px] py-[4px] text-[11px]'
          : 'rounded-lg border border-outline-variant px-sm py-xs font-label text-[11px] text-secondary hover:border-secondary',
        className,
      ].join(' ')}
      onClick={() => {
        void handoffChatSqlToPlaneApi({ sql, detail }).catch(() => undefined)
        openManagedPlane({ sql })
        window.dispatchEvent(new CustomEvent('que-plane-activity'))
      }}
    >
      Open in Managed Plane
    </button>
  )
}
