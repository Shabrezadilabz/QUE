import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

/** Compact signed-in identity for PDF top bars. */
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
  const initial = (user.displayName || localPart).charAt(0).toUpperCase()

  return (
    <div className="flex shrink-0 items-center gap-[10px]">
      {role ? (
        <span
          className="pdf-auth-pill hidden rounded-[4px] border border-solid px-[8px] py-[4px] text-[9px] font-semibold tracking-[0.4px] uppercase sm:inline"
          title={`${user.email} · ${role}`}
        >
          {role}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void onLogout()}
        title={`Sign out (${user.email})`}
        className="pdf-auth-avatar flex size-[32px] items-center justify-center overflow-hidden rounded-full border border-solid text-[12px] font-bold transition-colors"
        aria-label={`Signed in as ${user.email}. Click to sign out.`}
      >
        {initial}
      </button>
    </div>
  )
}
