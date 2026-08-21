import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
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
        className="flex size-full items-center justify-center text-[14px] text-[#c8cdd3]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgb(17, 20, 22) 0%, rgb(17, 20, 22) 100%)',
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
      className="relative flex min-h-full w-full flex-col overflow-y-auto bg-[#111416] text-[#d4dbe3]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(66, 72, 80, 0.1) 2.5%, rgba(66, 72, 80, 0) 2.5%), linear-gradient(180deg, rgba(66, 72, 80, 0.1) 2.5%, rgba(66, 72, 80, 0) 2.5%)',
          backgroundSize: '40px 40px',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-[66.66%] left-[-10%] right-1/2 top-[-16.67%] rounded-[12px] bg-[#aab5c0] opacity-[0.06] blur-[60px]"
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
              <p className="text-[24px] font-black leading-[32px] tracking-[-0.6px] text-[#ecf0f4]">
                Que
              </p>
            </div>
          </header>

          <div className="que-glass-card relative flex w-full flex-col gap-[16px] p-[33px]">
          <h1 className="text-center text-[20px] font-semibold leading-[28px] text-[#d4dbe3]">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h1>

          {mode === 'register' ? (
            <div className="flex gap-[4px] rounded-[4px] border border-solid border-[#424850] p-[4px]">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex-1 rounded-[4px] py-[8px] text-[10px] font-bold tracking-[1px] text-[#c8cdd3]"
              >
                SIGN IN
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className="flex-1 rounded-[4px] bg-[#252a30] py-[8px] text-[10px] font-bold tracking-[1px] text-[#d4dbe3]"
              >
                REGISTER
              </button>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-[4px] border border-solid border-[#ff6b6b]/40 bg-[rgba(255,107,107,0.13)] px-[12px] py-[8px] text-[13px] text-[#ff6b6b]"
            >
              {error}
            </p>
          ) : null}

          <form onSubmit={onSubmit} className="flex w-full flex-col gap-[16px]">
            {mode === 'register' ? (
              <label className="flex w-full flex-col gap-[4px]">
                <span className="text-[12px] font-semibold tracking-[0.6px] text-[#c8cdd3]">
                  Display name
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#2e343b] px-[13px] py-[12px] text-[14px] text-[#d4dbe3] outline-none placeholder:text-[#8a9099]"
                />
              </label>
            ) : null}

            <label className="flex w-full flex-col gap-[4px]">
              <span className="text-[12px] font-semibold tracking-[0.6px] text-[#c8cdd3]">
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
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#2e343b] py-[12px] pl-[37px] pr-[13px] text-[14px] text-[#d4dbe3] outline-none placeholder:text-[#8a9099]"
                />
                <div className="pointer-events-none absolute bottom-0 left-0 top-0 flex items-center pl-[12px]">
                  <img alt="" className="h-[12px] w-[15px]" src={LOGIN_ASSETS.mail} />
                </div>
              </div>
            </label>

            <label className="flex w-full flex-col gap-[4px]">
              <span className="flex items-center justify-between">
                <span className="text-[12px] font-semibold tracking-[0.6px] text-[#c8cdd3]">
                  Password
                </span>
                {mode === 'login' ? (
                  <span className="text-[12px] font-semibold tracking-[0.6px] text-[#d0d8e0]">
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
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#2e343b] py-[12px] pl-[37px] pr-[13px] text-[14px] text-[#d4dbe3] outline-none placeholder:text-[#8a9099]"
                />
                <div className="pointer-events-none absolute bottom-0 left-0 top-0 flex items-center pl-[12px]">
                  <img alt="" className="h-[15.75px] w-[12px]" src={LOGIN_ASSETS.lock} />
                </div>
              </div>
            </label>

            {mode === 'register' ? (
              <label className="flex w-full flex-col gap-[4px]">
                <span className="text-[12px] font-semibold tracking-[0.6px] text-[#c8cdd3]">
                  First workspace name
                </span>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My workspace"
                  className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#2e343b] px-[13px] py-[12px] text-[14px] text-[#d4dbe3] outline-none placeholder:text-[#8a9099]"
                />
              </label>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-[8px] rounded-[4px] bg-[#d0d8e0] py-[12px] text-[12px] font-semibold tracking-[0.6px] text-[#323840] disabled:opacity-40"
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
                <div className="h-px min-w-0 flex-1 border-t border-solid border-[#424850]" />
                <span className="shrink-0 px-[12px] text-[10px] font-bold tracking-[1px] text-[#c8cdd3]">
                  OR CONTINUE WITH
                </span>
                <div className="h-px min-w-0 flex-1 border-t border-solid border-[#424850]" />
              </div>
              <a
                href={`${getApiBase()}/auth/sso/start`}
                className="flex w-full items-center justify-center gap-[8px] rounded-[4px] border border-solid border-[#424850] bg-[#252a30] px-px py-[13px] text-[12px] font-semibold tracking-[0.6px] text-[#d4dbe3]"
              >
                <img alt="" className="h-[9px] w-[16.5px]" src={LOGIN_ASSETS.sso} />
                Sign in with SSO
              </a>
              {ssoRequireInvite ? (
                <p className="text-center text-[11px] text-[#c8cdd3]">
                  SSO requires a workspace invite for your email before first login.
                </p>
              ) : null}
            </>
          ) : null}

          <p className="pt-[8px] text-center text-[12px] leading-[18px] text-[#c3c6d0]">
            Don&apos;t have an account?{' '}
            <Link to="/sales" className="font-medium text-[#d3e4ff]">
              Contact Sales
            </Link>
            {mode === 'login' ? (
              <>
                {' '}
                ·{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="font-medium text-[#d3e4ff]"
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
                  className="font-medium text-[#d3e4ff]"
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          {import.meta.env.DEV && mode === 'login' ? (
            <div className="mt-[8px] space-y-[8px] border-t border-solid border-[#424850] pt-[16px]">
              <p className="text-[10px] font-bold tracking-[1px] text-[#c8cdd3]">
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
            className="text-[10px] font-bold tracking-[1px] text-[#c8cdd3]"
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
        className="flex w-full flex-col gap-[4px] border border-solid border-[#424850] bg-[#252a30] px-[12px] py-[8px] text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="text-[10px] font-bold tracking-[1px] text-[#7aecd0] uppercase">
          {role}
        </span>
        <span className="min-w-0 break-all text-[12px] text-[#c8cdd3] sm:text-right">
          {email}
          <span className="text-[#8a9099]"> / </span>
          {password}
        </span>
      </button>
    </li>
  )
}

export default LoginPage
