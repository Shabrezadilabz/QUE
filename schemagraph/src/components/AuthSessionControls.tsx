import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'

/** Compact signed-in identity — dark IDE presence chip. */
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
    <div className="flex shrink-0 items-center gap-sm">
      {role ? (
        <span
          className="hidden rounded-full bg-secondary/15 px-sm py-xs font-label text-[9px] font-medium tracking-wide text-secondary uppercase sm:inline"
          title={`${user.email} · ${role}`}
        >
          {role}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void onLogout()}
        title={`Sign out (${user.email})`}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest font-label text-xs font-bold text-secondary transition-colors hover:border-secondary hover:bg-secondary/15"
        aria-label={`Signed in as ${user.email}. Click to sign out.`}
      >
        {initial}
      </button>
    </div>
  )
}
