import { useManagedPlaneGate } from '@/hooks/useManagedPlaneGate'
import { usePlaneActivityUnread } from '@/hooks/usePlaneActivityUnread'

function DatabaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Opens Managed Plane SQL workspace in a new tab — beside theme toggle. */
export function ManagedPlaneLaunch({ compact = true }: { compact?: boolean }) {
  const { enabled, loading } = useManagedPlaneGate()
  const unread = usePlaneActivityUnread()

  const planeUrl = `${window.location.origin}/plane`
  const title =
    enabled === false && !loading
      ? 'Managed Plane — enable Offer B in Settings → AI & Policy'
      : 'Managed Plane — SQL workspace (opens new tab)'

  return (
    <a
      href={planeUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={[
        'pdf-theme-toggle relative inline-flex items-center justify-center rounded-[4px]',
        enabled === false && !loading ? 'opacity-70' : '',
        compact ? 'size-[32px]' : 'gap-[6px] px-[10px] py-[6px]',
      ].join(' ')}
      aria-label="Open Managed Plane in new tab"
    >
      <DatabaseIcon />
      {unread > 0 ? (
        <span
          className="absolute -right-[3px] -top-[3px] flex size-[14px] items-center justify-center rounded-full bg-[var(--pdf-accent)] text-[9px] font-bold text-white"
          aria-hidden
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </a>
  )
}
