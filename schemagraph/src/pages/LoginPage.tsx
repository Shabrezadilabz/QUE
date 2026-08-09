import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getApiBase } from '@/services/apiConfig'
import { QueLogo } from '@/components/QueLogo'

/**
 * Login / Sign up — email/password + optional OIDC SSO.
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
      <div className="flex min-h-full w-full items-center justify-center bg-canvas font-label text-sm tracking-widest text-on-surface-variant">
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
    <div className="flex min-h-full w-full items-stretch justify-center overflow-y-auto bg-canvas sm:items-center sm:px-lg sm:py-xl">
      <div className="que-card flex w-full max-w-[26rem] flex-col sm:my-lg md:max-w-[28rem]">
        <header className="flex items-center justify-between border-b border-secondary-container/40 bg-surface-container-low px-md py-md sm:px-lg">
          <QueLogo
            size={32}
            withWordmark
            wordmarkClassName="font-headline text-lg font-bold tracking-tight text-on-surface sm:text-xl"
          />
          <span className="font-label text-xs font-bold tracking-[0.14em] text-on-surface-variant sm:text-sm">
            {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </span>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex flex-1 flex-col gap-lg p-md sm:gap-lg sm:p-lg"
        >
          <div className="space-y-sm">
            <h1 className="font-headline text-xl font-semibold leading-tight tracking-tight text-on-surface sm:text-2xl">
              {mode === 'login' ? 'Workspace access' : 'Get started'}
            </h1>
            <p className="max-w-[40ch] font-body text-[13px] leading-snug text-on-surface-variant">
              {mode === 'login'
                ? 'Schema metadata only — membership is enforced per workspace. Join suggestions always need human Promote.'
                : 'Create an account and your first workspace. Invites are claimed automatically on login.'}
            </p>
          </div>

          <div className="flex gap-sm rounded-lg border border-outline-variant/40 p-xs">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={[
                'flex-1 rounded-md py-sm font-label text-sm tracking-widest',
                mode === 'login'
                  ? 'bg-secondary text-on-secondary'
                  : 'text-on-surface-variant',
              ].join(' ')}
            >
              SIGN IN
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={[
                'flex-1 rounded-md py-sm font-label text-sm tracking-widest',
                mode === 'register'
                  ? 'bg-secondary text-on-secondary'
                  : 'text-on-surface-variant',
              ].join(' ')}
            >
              CREATE ACCOUNT
            </button>
          </div>

          {error ? (
            <p
              role="alert"
              className="border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] leading-snug text-error sm:text-sm"
            >
              {error}
            </p>
          ) : null}

          <div className="space-y-md">
            {mode === 'register' ? (
              <label className="block">
                <span className="mb-sm block font-label text-sm font-semibold text-on-surface-variant">
                  DISPLAY NAME
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="min-h-11 w-full rounded border border-outline-variant bg-surface-container-lowest px-md py-sm font-body text-[13px] text-on-surface outline-none focus:border-secondary sm:min-h-12 sm:text-[13px]"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-sm block font-label text-sm font-semibold text-on-surface-variant">
                EMAIL
              </span>
              <input
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 w-full rounded border border-outline-variant bg-surface-container-lowest px-md py-sm font-body text-[13px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-secondary sm:min-h-12 sm:text-[13px]"
                required
              />
            </label>

            <label className="block">
              <span className="mb-sm block font-label text-sm font-semibold text-on-surface-variant">
                PASSWORD
              </span>
              <input
                type="password"
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === 'register' ? 8 : undefined}
                className="min-h-11 w-full rounded border border-outline-variant bg-surface-container-lowest px-md py-sm font-body text-[13px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-secondary sm:min-h-12 sm:text-[13px]"
                required
              />
              {mode === 'register' ? (
                <span className="mt-xs block font-body text-[11px] text-on-surface-variant">
                  At least 8 characters
                </span>
              ) : null}
            </label>

            {mode === 'register' ? (
              <label className="block">
                <span className="mb-sm block font-label text-sm font-semibold text-on-surface-variant">
                  FIRST WORKSPACE NAME
                </span>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My workspace"
                  className="min-h-11 w-full rounded border border-outline-variant bg-surface-container-lowest px-md py-sm font-body text-[13px] text-on-surface outline-none focus:border-secondary sm:min-h-12 sm:text-[13px]"
                />
              </label>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded bg-secondary px-md py-md font-label text-[11px] font-bold tracking-[0.2em] text-on-secondary transition-colors hover:bg-secondary-fixed-dim disabled:opacity-40 sm:text-xs"
          >
            {busy
              ? mode === 'register'
                ? 'CREATING…'
                : 'SIGNING IN…'
              : mode === 'register'
                ? 'CREATE ACCOUNT'
                : 'SIGN IN'}
          </button>

          {ssoReady && mode === 'login' ? (
            <div className="space-y-sm">
              <a
                href={`${getApiBase()}/auth/sso/start`}
                className="block w-full rounded border border-outline-variant py-3 text-center font-label text-sm text-secondary hover:border-secondary hover:bg-secondary/10"
              >
                Continue with SSO
              </a>
              {ssoRequireInvite ? (
                <p className="text-center font-body text-[11px] leading-snug text-on-surface-variant">
                  SSO requires a workspace invite for your email before first
                  login.
                </p>
              ) : null}
            </div>
          ) : null}

          {import.meta.env.DEV && mode === 'login' ? (
            <div className="mt-auto space-y-sm border-t border-outline-variant pt-md">
              <p className="font-label text-[10px] font-bold tracking-[0.16em] text-on-surface-variant">
                LOCAL DEMO (DEV ONLY)
              </p>
              <ul className="space-y-sm">
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
        </form>
      </div>
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
        className="flex w-full flex-col gap-xs border border-outline-variant bg-surface-container-low px-md py-sm text-left transition-colors hover:border-primary-fixed sm:flex-row sm:items-center sm:justify-between sm:gap-md"
      >
        <span className="font-label text-[10px] font-bold tracking-[0.14em] text-primary-fixed uppercase">
          {role}
        </span>
        <span className="min-w-0 font-body text-[12px] leading-snug break-all text-on-surface-variant sm:text-right sm:text-[13px]">
          {email}
          <span className="text-on-surface-variant/50"> / </span>
          {password}
        </span>
      </button>
    </li>
  )
}

export default LoginPage
