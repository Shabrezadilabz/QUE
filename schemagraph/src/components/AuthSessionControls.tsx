import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

/** Compact signed-in identity + role + logout (workspace switch is in nav). */
export function AuthSessionControls() {
  const { user, logout } = useAuth()
  const { role } = useWorkspaceRole()
  const navigate = useNavigate()

  if (!user) return null

  async function onLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const localPart = user.email.split('@')[0] ?? user.email

  return (
    <div className="flex shrink-0 items-center gap-xs sm:gap-sm">
      {role ? (
        <span
          className="border border-outline-variant px-sm py-xs font-label text-[9px] font-bold tracking-[0.14em] text-primary-fixed uppercase"
          title={`${user.email} · ${role}`}
        >
          {role}
        </span>
      ) : (
        <span
          className="border border-outline-variant px-sm py-xs font-label text-[9px] tracking-[0.14em] text-on-surface-variant uppercase"
          title="No role on active workspace"
        >
          no role
        </span>
      )}
      <span
        className="hidden max-w-[7rem] truncate font-body text-[11px] text-on-surface-variant 2xl:inline"
        title={user.email}
      >
        {localPart}
      </span>
      <button
        type="button"
        onClick={() => void onLogout()}
        title={`Sign out (${user.email})`}
        className="border border-outline-variant px-sm py-xs font-label text-[9px] font-bold tracking-[0.14em] text-on-surface-variant uppercase transition-colors hover:border-primary-fixed hover:text-primary-fixed sm:text-[10px]"
      >
        <span className="sm:hidden">Out</span>
        <span className="hidden sm:inline">Log out</span>
      </button>
    </div>
  )
}
