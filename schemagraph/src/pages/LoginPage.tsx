import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/context/AuthContext'
import { getApiBase } from '@/services/apiConfig'

const LOGIN_ASSETS = {
  logo: '/figma/login/logo.svg',
  mail: '/figma/login/mail.svg',
  lock: '/figma/login/lock.svg',
  arrow: '/figma/login/arrow.svg',
  sso: '/figma/login/sso.svg',
} as const

/**
 * Login — pixel-faithful Figma v1 slate frame (1:2).
 */
export function LoginPage() {
  const { user, ready, login, register } = useAuth()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from || '/workspace'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ssoReady, setSsoReady] = useState(false)
  const [ssoRequireInvite, setSsoRequireInvite] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/auth/sso`)
        const body = (await res.json()) as {
          sso?: { loginImplemented?: boolean; requireInvite?: boolean }
        }
        if (!cancelled) {
          setSsoReady(Boolean(body.sso?.loginImplemented))
          setSsoRequireInvite(Boolean(body.sso?.requireInvite))
        }
      } catch {
        if (!cancelled) {
          setSsoReady(false)
          setSsoRequireInvite(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <div
        className="flex size-full items-center justify-center text-[14px] text-[var(--pdf-text-secondary)]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, var(--pdf-bg-canvas) 0%, var(--pdf-bg-canvas) 100%)',
        }}
      >
        Checking session…
      </div>
    )
  }

  if (user) {
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'register') {
        await register({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          workspaceName: workspaceName.trim() || undefined,
        })
      } else {
        await login(email.trim(), password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="pdf-app-canvas relative flex min-h-full w-full flex-col overflow-y-auto"
    >
      <div className="absolute right-[24px] top-[24px] z-10">
        <ThemeToggle compact />
      </div>
      <div className="pdf-login-grid" aria-hidden />
      <div
        className="pdf-login-orb bottom-[66.66%] left-[-10%] right-1/2 top-[-16.67%]"
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-[24px] py-[48px]">
        <div className="flex w-full max-w-[480px] flex-col items-center gap-[32px]">
          <header className="flex flex-col items-center">
            <div className="flex items-center justify-center gap-[8px]">
              <div className="relative size-[24px] shrink-0">
                <img
                  alt=""
                  className="absolute inset-0 block size-full max-w-none"
                  src={LOGIN_ASSETS.logo}
                />
              </div>
              <p className="text-[24px] font-black leading-[32px] tracking-[-0.6px] text-[var(--pdf-text-heading)]">
                Que
              </p>
            </div>
          </header>

          <div className="que-glass-card relative flex w-full flex-col gap-[16px] p-[33px]">
          <h1 className="text-center text-[20px] font-semibold leading-[28px] text-[var(--pdf-text-primary)]">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h1>

          {mode === 'register' ? (
            <div className="flex gap-[4px] rounded-[4px] border border-solid border-[var(--pdf-border)] p-[4px]">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex-1 rounded-[4px] py-[8px] text-[10px] font-bold tracking-[1px] text-[var(--pdf-text-secondary)]"
              >
                SIGN IN
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className="flex-1 rounded-[4px] bg-[var(--pdf-bg-muted)] py-[8px] text-[10px] font-bold tracking-[1px] text-[var(--pdf-text-primary)]"
              >
                REGISTER
              </button>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="pdf-status-error rounded-[4px] px-[12px] py-[8px] text-[13px]"
            >
              {error}
            </p>
          ) : null}

          <form onSubmit={onSubmit} className="flex w-full flex-col gap-[16px]">
            {mode === 'register' ? (
              <label className="flex w-full flex-col gap-[4px]">
                <span className="text-[12px] font-semibold tracking-[0.6px] text-[var(--pdf-text-secondary)]">
                  Display name
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="pdf-input w-full px-[13px] py-[12px] text-[14px]"
                />
              </label>
            ) : null}

            <label className="flex w-full flex-col gap-[4px]">
              <span className="text-[12px] font-semibold tracking-[0.6px] text-[var(--pdf-text-secondary)]">
                Work Email
              </span>
              <div className="relative w-full">
                <input
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pdf-input w-full py-[12px] pl-[37px] pr-[13px] text-[14px]"
                />
                <div className="pointer-events-none absolute bottom-0 left-0 top-0 flex items-center pl-[12px]">
                  <img alt="" className="h-[12px] w-[15px]" src={LOGIN_ASSETS.mail} />
                </div>
              </div>
            </label>

            <label className="flex w-full flex-col gap-[4px]">
              <span className="flex items-center justify-between">
                <span className="text-[12px] font-semibold tracking-[0.6px] text-[var(--pdf-text-secondary)]">
                  Password
                </span>
                {mode === 'login' ? (
                  <span className="text-[12px] font-semibold tracking-[0.6px] text-[var(--pdf-text-accent)]">
                    Forgot password?
                  </span>
                ) : null}
              </span>
              <div className="relative w-full">
                <input
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === 'register' ? 8 : undefined}
                  required
                  className="pdf-input w-full py-[12px] pl-[37px] pr-[13px] text-[14px]"
                />
                <div className="pointer-events-none absolute bottom-0 left-0 top-0 flex items-center pl-[12px]">
                  <img alt="" className="h-[15.75px] w-[12px]" src={LOGIN_ASSETS.lock} />
                </div>
              </div>
            </label>

            {mode === 'register' ? (
              <label className="flex w-full flex-col gap-[4px]">
                <span className="text-[12px] font-semibold tracking-[0.6px] text-[var(--pdf-text-secondary)]">
                  First workspace name
                </span>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My workspace"
                  className="pdf-input w-full px-[13px] py-[12px] text-[14px]"
                />
              </label>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="pdf-btn-primary flex w-full items-center justify-center gap-[8px] rounded-[4px] py-[12px] text-[12px] font-semibold tracking-[0.6px] disabled:opacity-40"
            >
              {busy
                ? mode === 'register'
                  ? 'Creating…'
                  : 'Signing in…'
                : mode === 'register'
                  ? 'Create account'
                  : 'Sign in'}
              {!busy ? (
                <img alt="" className="size-[10.667px]" src={LOGIN_ASSETS.arrow} />
              ) : null}
            </button>
          </form>

          {ssoReady && mode === 'login' ? (
            <>
              <div className="flex w-full items-center py-[8px]">
                <div className="h-px min-w-0 flex-1 border-t border-solid border-[var(--pdf-border)]" />
                <span className="shrink-0 px-[12px] text-[10px] font-bold tracking-[1px] text-[var(--pdf-text-secondary)]">
                  OR CONTINUE WITH
                </span>
                <div className="h-px min-w-0 flex-1 border-t border-solid border-[var(--pdf-border)]" />
              </div>
              <a
                href={`${getApiBase()}/auth/sso/start`}
                className="pdf-btn-ghost flex w-full items-center justify-center gap-[8px] rounded-[4px] px-px py-[13px] text-[12px] font-semibold tracking-[0.6px]"
              >
                <img alt="" className="h-[9px] w-[16.5px]" src={LOGIN_ASSETS.sso} />
                Sign in with SSO
              </a>
              {ssoRequireInvite ? (
                <p className="text-center text-[11px] text-[var(--pdf-text-secondary)]">
                  SSO requires a workspace invite for your email before first login.
                </p>
              ) : null}
            </>
          ) : null}

          <p className="pt-[8px] text-center text-[12px] leading-[18px] text-[var(--pdf-text-muted)]">
            Don&apos;t have an account?{' '}
            <Link to="/sales" className="pdf-link">
              Contact Sales
            </Link>
            {mode === 'login' ? (
              <>
                {' '}
                ·{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="pdf-link"
                >
                  Register
                </button>
              </>
            ) : (
              <>
                {' '}
                ·{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="pdf-link"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          {import.meta.env.DEV && mode === 'login' ? (
            <div className="mt-[8px] space-y-[8px] border-t border-solid border-[var(--pdf-border)] pt-[16px]">
              <p className="text-[10px] font-bold tracking-[1px] text-[var(--pdf-text-secondary)]">
                LOCAL DEMO (DEV ONLY)
              </p>
              <ul className="space-y-[8px]">
                <DemoAccount
                  role="Owner"
                  email="dev@stitch.local"
                  password="stitch-dev"
                  onUse={() => {
                    setEmail('dev@stitch.local')
                    setPassword('stitch-dev')
                  }}
                />
                <DemoAccount
                  role="Member"
                  email="member@stitch.local"
                  password="stitch-member"
                  onUse={() => {
                    setEmail('member@stitch.local')
                    setPassword('stitch-member')
                  }}
                />
                <DemoAccount
                  role="Viewer"
                  email="viewer@stitch.local"
                  password="stitch-viewer"
                  onUse={() => {
                    setEmail('viewer@stitch.local')
                    setPassword('stitch-viewer')
                  }}
                />
              </ul>
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <nav
        className="relative shrink-0 pb-[32px] pt-[16px] flex justify-center gap-[16px]"
        aria-label="Legal links"
      >
        {(['Privacy', 'Terms', 'Support'] as const).map((label) => (
          <Link
            key={label}
            to="/sales"
            className="text-[10px] font-bold tracking-[1px] text-[var(--pdf-text-secondary)]"
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

function DemoAccount({
  role,
  email,
  password,
  onUse,
}: {
  role: string
  email: string
  password: string
  onUse: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onUse}
        className="pdf-btn-ghost flex w-full flex-col gap-[4px] px-[12px] py-[8px] text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="text-[10px] font-bold tracking-[1px] text-[var(--pdf-accent)] uppercase">
          {role}
        </span>
        <span className="min-w-0 break-all text-[12px] text-[var(--pdf-text-secondary)] sm:text-right">
          {email}
          <span className="text-[var(--pdf-text-faint)]"> / </span>
          {password}
        </span>
      </button>
    </li>
  )
}

export default LoginPage
