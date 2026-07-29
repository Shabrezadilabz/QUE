import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { getApiBase } from '@/services/apiConfig'

/**
 * Login — email/password + optional OIDC SSO.
 * Sunset Clay: Hanken Grotesk headlines, Inter body, Geist labels.
 */
export function LoginPage() {
  const { user, ready, login } = useAuth()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from || '/workspace'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ssoReady, setSsoReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/auth/sso`)
        const body = (await res.json()) as {
          sso?: { loginImplemented?: boolean }
        }
        if (!cancelled) setSsoReady(Boolean(body.sso?.loginImplemented))
      } catch {
        if (!cancelled) setSsoReady(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-full w-full items-center justify-center bg-canvas font-label text-[11px] tracking-widest text-on-surface-variant">
        CHECKING SESSION…
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
      await login(email.trim(), password)
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
          <span className="font-headline text-lg font-bold tracking-tight text-primary sm:text-xl">
            Que
          </span>
          <span className="font-label text-[10px] font-bold tracking-[0.18em] text-on-surface-variant sm:text-[11px]">
            SIGN IN
          </span>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex flex-1 flex-col gap-lg p-md sm:gap-lg sm:p-lg"
        >
          <div className="space-y-sm">
            <h1 className="font-headline text-[1.75rem] leading-tight font-semibold tracking-tight text-on-surface sm:text-[2rem] md:text-[2.25rem]">
              Workspace access
            </h1>
            <p className="max-w-[36ch] font-body text-[13px] leading-relaxed text-on-surface-variant sm:text-sm">
              Schema metadata only — membership is enforced per workspace.
            </p>
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
            <label className="block">
              <span className="mb-sm block font-label text-[10px] font-bold tracking-[0.16em] text-on-surface-variant sm:text-[11px]">
                EMAIL
              </span>
              <input
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 w-full border border-outline-variant bg-surface-container-low px-md py-sm font-body text-[15px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-primary-fixed sm:min-h-12 sm:text-base"
                required
              />
            </label>

            <label className="block">
              <span className="mb-sm block font-label text-[10px] font-bold tracking-[0.16em] text-on-surface-variant sm:text-[11px]">
                PASSWORD
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full border border-outline-variant bg-surface-container-low px-md py-sm font-body text-[15px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-primary-fixed sm:min-h-12 sm:text-base"
                required
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded-lg bg-primary-container px-md py-md font-label text-[11px] font-bold tracking-[0.2em] text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40 sm:text-xs"
          >
            {busy ? 'SIGNING IN…' : 'SIGN IN'}
          </button>

          {ssoReady ? (
            <a
              href={`${getApiBase()}/auth/sso/start`}
              className="block w-full rounded-xl border border-outline-variant/40 py-3 text-center font-label text-sm text-primary hover:bg-secondary-container/50"
            >
              Continue with SSO
            </a>
          ) : null}

          {import.meta.env.DEV ? (
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
